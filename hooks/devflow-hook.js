'use strict'
// Shared hook contract: docs/specs/hooks.md.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const state = require('../bin/devflow-state')
const { isNetwork, localPath, smallFile, provenMain } = state

function devflowRoot(dir, stopAtGit = false) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    try { fs.lstatSync(path.join(d, '.devflow.json')); return d } catch {}
    if (stopAtGit && fs.existsSync(path.join(d, '.git'))) return null
    if (path.dirname(d) === d) return null
  }
}

// Autonomous work continues while a task is open and nothing waits on a person; at most twice per task.
const MAX_CONTINUES = 2
function continueWork(env, cwd) {
  // Only the session's own Issue continues: a task worktree writes no ledger (#73 G1).
  const ctx = state.repoContext(env, cwd, { session: eventSession })
  if (!ctx || ctx.bind !== 'own' || state.legacyOf(ctx, ctx.issue)) return ''
  // No ledger, no lock: the lock would create the Issue's folder in every repository branch the hook runs in.
  if (!state.readLedger(ctx.store, ctx.issue)) return ''
  // Decided and counted under the ledger lock, so a write another session makes meanwhile is kept (Issue #10). A lock
  // that cannot be taken lets the session stop.
  const r = state.updateLedger(ctx.store, ctx.issue, ledger => {
    // Unattended means the ledger says so: approval settings such as bypass or yolo say nothing about who is present.
    const task = ledger.task || {}
    // The task loop is open while current has not passed total; the skill moves it past total on leaving the loop, so
    // stage names stay the skill's (#150).
    const open = Number.isInteger(task.current) && Number.isInteger(task.total) && task.current <= task.total
    // Empty means empty: [] and {} are how ledger-update clears a key it cannot delete.
    const filled = v => (v && typeof v === 'object' ? Object.keys(v).length > 0 : Boolean(v))
    const waiting = filled(ledger.blocked) || filled(ledger.decisions) || filled(ledger.running)
    // Only the session that switched or claimed the run continues it; a later session on the branch, or one whose id
    // is unknown, stops (ledger.md, Unattended runs). Ids inherited through the environment are not this session: a
    // child started from the owner carries them too.
    const owner = ledger.modeChanged && typeof ledger.modeChanged === 'object' ? ledger.modeChanged.session : null
    const owned = typeof owner === 'string' && Boolean(eventSession) && owner === eventSession
    if (ledger.mode !== 'autonomous' || !owned || !open || waiting) return { result: null }
    const key = String(task.current)
    const counts = { ...(ledger.counts || {}) }
    const mine = { ...(counts[key] || {}) }
    if ((mine.continue || 0) >= MAX_CONTINUES) return { result: null }
    mine.continue = (mine.continue || 0) + 1
    counts[key] = mine
    return { ledger: { ...ledger, counts }, result: { task } }
  })
  if (!r.ok || !r.result) return ''
  const { task } = r.result
  // The reason names the open task and the unattended limits; it repeats no ledger text, so a stage or other value
  // cannot speak through the hook (#150).
  return JSON.stringify({ decision: 'block', reason: `devflow: task ${task.current}/${task.total} is open in autonomous mode. ` +
    'Continue that task: change, check, commit, update the ledger. Do not push, integrate or write the Issue while ' +
    'autonomous. Stop only for a blocker or a decision for the user, recorded in the ledger as blocked or decisions.' })
}

// Issue #10. Claude's shell gets the session id through CLAUDE_ENV_FILE, which every later Bash command sources, so
// devflow-state names the same session the hooks see, also after /clear starts a new one. Only in a devflow repository,
// only for an id that cannot break out of the quotes, and never inside Codex, whose own id comes first anyway.
const SESSION_ID = /^[A-Za-z0-9-]{1,128}$/
function shareSessionId(vars, cwd, sessionId) {
  try {
    if (!vars.CLAUDE_ENV_FILE || vars.CODEX_THREAD_ID || !SESSION_ID.test(String(sessionId || '')) || !devflowRoot(cwd)) return
    fs.appendFileSync(vars.CLAUDE_ENV_FILE, `export DEVFLOW_SESSION_ID="${sessionId}"\n`)
  } catch {}
}

// A session that ends stops counting as a recent writer of any Issue. One try per lock: SessionEnd has 1.5 s in all in
// Claude and at most 3 s in Codex, and an entry left behind expires in 30 minutes.
function releaseEverywhere(cwd, sessionId) {
  const found = devflowRoot(cwd)
  if (!found || !SESSION_ID.test(String(sessionId || ''))) return
  // Use the local metadata proof: a slow git process used to leave the main tree's session behind (#47).
  const root = gitLocation(found)?.main || found
  const hash = crypto.createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 12)
  const base = path.join(root, '.work', 'devflow')
  // Real folders only: a .work that is a link (to a network share, say) is not listed.
  const realDir = p => { try { return fs.lstatSync(p).isDirectory() } catch { return false } }
  if (!realDir(path.join(root, '.work')) || !realDir(base)) return
  let names = []
  try { names = fs.readdirSync(base) } catch { return }
  for (const name of names) {
    const m = /^i(\d+)$/.exec(name)
    if (!m) continue
    // readSessions skips linked folders, other file kinds and large files.
    if (state.readSessions(root, Number(m[1]))[hash]) state.releaseSessions(root, Number(m[1]), [hash], { waitMs: 0 })
  }
}

// Local git directories for session cleanup. A main tree is returned only with its back-link
// proof, without starting git or following a network path. Never throws.
function gitLocation(root) {
  try {
    const dotGit = path.join(root, '.git')
    const st = fs.lstatSync(dotGit)
    let own = dotGit
    let common = dotGit
    if (st.isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(smallFile(dotGit) || '')
      if (!m || isNetwork(m[1].trim())) return null
      own = path.resolve(root, m[1].trim())
      const commondir = smallFile(path.join(own, 'commondir'))
      common = commondir ? path.resolve(own, commondir.trim()) : own
    } else if (!st.isDirectory()) return null
    return { own, common, main: st.isFile() ? provenMain(root, own, common) : null }
  } catch {
    return null
  }
}

let eventSession = null
const sessionHash = id => (typeof id === 'string' && id ? crypto.createHash('sha256').update(id).digest('hex').slice(0, 12) : null)

function briefRoute(prompt) {
  if (typeof prompt !== 'string') return ''
  const task = prompt.replace(/```[\s\S]*?(?:```|$)/g, '').replace(/^[ \t]*>[^\n]*/gm, '')
  const brief = /\b(?:brief|prompt|worker instructions?)\b|작업\s*지시문|프롬프트|브리프|문안/i
  const write = /\b(?:draft|write|compose|revise|create)\b|작성|만들|초안/i
  const audit = /\b(?:audit|review|check|validate|verify)\b|감사|검토|대조/i
  const dispatch = /\b(?:delegate|dispatch|launch|(?:start|spawn|run)\s+.{0,45}\b(?:worker|agent|subagent)\b)\b|위임|띄워|넘겨|(?:작업자|에이전트|담당자).{0,25}(?:전달|시작|실행|보내)/i
  const actions = task.replace(/\b[\w.-]+\.(?:md|txt|json)\b/gi, '')
  if (!brief.test(task) || !write.test(actions) || !audit.test(actions) || !dispatch.test(actions)) return ''
  const excluded = [
    /^\s*(?:how|why)\s+(?:do|does|should|can|would|to)\b/i,
    /(?:위임하|넘기|전달하)는\s*(?:방법|절차)(?:을|를)?\s*(?:알려|설명)|^\s*(?:다음|아래)\s*(?:문장|문구)만\s*(?:번역|요약)/,
    /\b(?:do not|don't|never|without)\s+(?:actually\s+)?(?:delegate|dispatch|launch|(?:start|run)\b.{0,25}\b(?:worker|agent))\b/i,
    /\b(?:wait|ask)\b.{0,35}\bapproval\s+before\s+(?:delegat|dispatch|launch)/i,
    /\b(?:no (?:new )?(?:brief|draft|prompt|audit)|(?:do not|don't) (?:draft|write|audit) (?:a |the )?(?:brief|prompt))\b/i,
    /(?:위임|작업자\s*실행|에이전트\s*(?:실행|시작))(?:은|는|을|를)?\s*(?:실제로?\s*)?(?:하지\s*[마말]|금지)/,
    /(?:나중에|별도|추가).{0,18}승인.{0,25}(?:위임|넘겨|실행)|(?:확인|승인)을?\s*먼저\s*받.{0,16}(?:위임|넘겨|실행|보내)/,
    /(?:문안|지시문|브리프|프롬프트|감사).{0,30}(?:만들|작성|검토|감사)(?:할)?\s*(?:필요(?:가)?\s*없|하지\s*마)/,
    /(?:링크|위치)만\s*(?:답|전달|공유|알려)|\b(?:only|just)\s+(?:share|send|return)\s+(?:the |a )?link\b/i,
  ]
  if (excluded.some(rule => rule.test(task))) return ''
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit',
    additionalContext: 'For the requested delegation brief, use write-prompts to save the draft. Then use audit-prompts to reopen and audit the saved file. Dispatch only after PASS and explicit authorization to dispatch now. Prefer the file and SHA-256 for the worker to verify, or pass the text verbatim without additions.' } })
}

function readinessRoute(prompt) {
  if (typeof prompt !== 'string') return ''
  const task = prompt.replace(/```[\s\S]*?(?:```|$)/g, '').replace(/^[ \t]*>[^\n]*/gm, '')
  const readiness = /\b(?:deployment|release|merge|pull request|PR)\s+readiness\b|(?:배포|릴리스|병합)[^.\n]{0,24}준비\s*(?:상태|여부)/i
  const proof = /\b(?:approved|artifact|candidate|revision|head|sha-?256|commit|status checks?)\b|후보|승인|해시|아티팩트|검사\s*증거/i
  const readOnly = /\bread.only\b|\b(?:do not|don't)\s+(?:deploy|publish|merge)\b|읽기\s*전용|(?:상태|여부)만|(?:배포|게시)(?:는|을)?\s*하지\s*마/i
  const advice = /^\s*(?:(?:how|what|why|explain|describe)\b|일반적인)|(?:정의|뜻|의미)를?\s*(?:알려|설명)/i
  if (!readiness.test(task) || !proof.test(task) || !readOnly.test(task) || advice.test(task)) return ''
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit',
    additionalContext: 'Load the devflow skill and read its Delivery reference for this read-only readiness check.' } })
}

function nestedCheck(scope, tool) {
  let file = path.resolve(__dirname, '../bin/devflow-state')
  if (/[\r\n\x00]/.test(file)) return null
  if (process.platform === 'win32') file = file.replaceAll('\\', '/')
  const quoted = tool === 'PowerShell' ? file.replace(/['\u2018-\u201b]/g, '$&$&') : file.replaceAll("'", "'\\''")
  return `node '${quoted}' change-check ${scope.stage} ${scope.id}`
}

function assignmentRootHint({ root, cwd }, scope) {
  if (root === cwd) return ''
  const base = ` The assignment root is ${path.relative(cwd, root)} from the session directory; work paths are relative to that root. Use absolute tool paths for files outside the session directory.`
  if (!scope) return base
  const bash = nestedCheck(scope, 'Bash')
  const powershell = nestedCheck(scope, 'PowerShell')
  if (!bash) return base + ' Start at the assignment root to run the standalone check.'
  return base + (bash === powershell ? ` Run this standalone check from the session directory: ${bash}` :
    ` Run the standalone check from this directory, using Bash: ${bash} or PowerShell: ${powershell}`)
}

function assignedChangeContext(cwd, source) {
  if (!['startup', 'resume', 'clear', 'compact'].includes(source)) return ''
  const location = state.assignmentLocation(cwd)
  if (!location) return ''
  const additionalContext = source === 'startup'
    ? 'For assigned documents, implementation, status or independent review, load the devflow skill before selecting a stage. For drafting, revising or auditing documents, run its trusted stage check and read Change before opening records. For implementation, run the trusted build check before any edits.'
    : 'For a request about the local assignment, verify its current stage and reread the routed reference. For status, run the trusted resume check and read Resume before answering. Earlier results are history.'
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart',
    additionalContext: additionalContext + assignmentRootHint(location) } })
}

function revisionRoute(input, location, scope) {
  const task = typeof input.prompt === 'string' ? input.prompt.replace(/```[\s\S]*?(?:```|$)/g, '') : ''
  if (!scope || !/\b(?:edit|revise|fix|update|correct|rewrite)\b|수정|개정|고쳐|다듬|정리/i.test(task) ||
      !/\b(?:intent|spec|plan)\.md\b|의도서|사양서|계획서|초안|문서/i.test(task)) return ''
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit',
    additionalContext: `For this assigned document revision, load the devflow skill first. Run the trusted change-check ${scope.stage} ${scope.id} alone, then read Change. Only edit ${scope.file}. Report any needed changes to other files without editing them.` + assignmentRootHint(location, scope) } })
}

function revisionWrite(input, location, scope) {
  if (!scope) return ''
  const name = input.tool_name
  const request = input.tool_input
  const target = path.resolve(location.root, scope.file)
  const sameFile = file => {
    if (typeof file !== 'string' || isNetwork(file) || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(file)) return false
    if (path.relative(target, path.resolve(location.cwd, file))) return false
    try {
      const local = state.strictLocalPath(target)
      const stat = fs.lstatSync(target)
      return local.ok && !local.absent && stat.isFile() && stat.nlink === 1 &&
        !path.relative(target, fs.realpathSync(target))
    } catch { return false }
  }
  let allowed
  if (name === 'apply_patch') {
    const lines = typeof request?.command === 'string' ? request.command.split(/\r?\n/).map(line => line.trim()) : []
    const headers = lines.filter(line => /^\*\*\* (?:(?:Add|Update|Delete) File|Move to):/.test(line))
    allowed = headers.length === 1 && headers[0].startsWith('*** Update File: ') &&
      sameFile(headers[0].slice('*** Update File: '.length))
  } else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(name)) {
    allowed = sameFile(request?.file_path)
  } else if (['Agent', 'Task'].includes(name) || /^mcp__/.test(name || '')) {
    allowed = false
  } else if (['Bash', 'PowerShell'].includes(name) && typeof input.permission_mode === 'string' && !input.turn_id) {
    // Claude has dedicated file readers. Keep shell access to the assignment check during a revision.
    const check = `change-check ${scope.stage} ${scope.id}`
    const nested = location.root !== location.cwd && nestedCheck(scope, name)
    allowed = location.root === location.cwd ? ['node bin/devflow-state', 'node devflow/bin/devflow-state', 'devflow-state']
      .some(tool => request?.command === `${tool} ${check}`) : Boolean(nested && request?.command === nested)
  } else return ''
  return allowed ? '' : JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
    permissionDecisionReason: `Assigned document revision permits edits only to ${scope.file}. Use the trusted stage check and native file readers. Report other changes without writing them.` } })
}

function handle(raw, env = state.realEnv) {
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return ''
  }
  if (!input) return ''
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd()
  if (input.hook_event_name === 'UserPromptSubmit' || input.hook_event_name === 'PreToolUse') {
    const location = state.assignmentLocation(cwd)
    const scope = location && state.changeRevision(location.root, location.record)
    if (input.hook_event_name === 'UserPromptSubmit') {
      return revisionRoute(input, location, scope) || briefRoute(input.prompt) || readinessRoute(input.prompt)
    }
    return revisionWrite(input, location, scope)
  }
  if (!['SessionStart', 'Stop', 'SessionEnd'].includes(input.hook_event_name)) return ''
  const configured = input.hook_event_name === 'SessionEnd' ? null : devflowRoot(cwd, true)
  if (!configured && input.hook_event_name !== 'SessionEnd') {
    return input.hook_event_name === 'SessionStart' ? assignedChangeContext(cwd, input.source) : ''
  }
  eventSession = sessionHash(input.session_id)
  if (input.hook_event_name === 'SessionStart') {
    shareSessionId(env.vars || {}, cwd, input.session_id)
    let card
    try {
      card = state.card(env, cwd, { sessionId: input.session_id || null })
      if (!card) card = state.terminalFailure('tracked workspace could not be verified')
    } catch (e) {
      card = state.terminalFailure(e)
    }
    return card ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: card } }) : ''
  }
  if (input.hook_event_name === 'SessionEnd') {
    try {
      releaseEverywhere(cwd, input.session_id)
    } catch {}
    return '' // SessionEnd cannot block, and its output is dropped
  }
  if (input.hook_event_name === 'Stop') {
    try {
      return continueWork(env, cwd)
    } catch {
      return '' // blocking Stop on an error would loop
    }
  }
  return ''
}

// Read on the event loop: synchronous stdin reads can stall on macOS or mishandle large piped input (#37).
// Incomplete input produces no output; lifecycle hooks must not hold the host open.
const STDIN_TIMEOUT_MS = 3000
function readStdin() {
  return new Promise(resolve => {
    const chunks = []
    let settled = false
    const finish = complete => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ raw: Buffer.concat(chunks).toString('utf8'), complete })
    }
    const timer = setTimeout(() => finish(false), STDIN_TIMEOUT_MS)
    process.stdin.on('data', chunk => chunks.push(chunk))
    process.stdin.on('end', () => finish(true))
    process.stdin.on('error', () => finish(true))
  })
}

// Output is written synchronously before exiting: the process exits on purpose while stdin may still be open.
const emit = text => { if (text) fs.writeSync(1, text + '\n') }

async function main() {
  const { raw, complete } = await readStdin()
  if (complete) emit(handle(raw))
  process.exit(0)
}

module.exports = { handle, localPath, main }
