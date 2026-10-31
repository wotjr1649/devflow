'use strict'
// SessionStart prints the resume card, Stop continues autonomous work, and SessionEnd releases the session.
// Rules: docs/specs/hooks.md, docs/specs/issues.md (resume card), docs/specs/ledger.md (continuation and release).
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const state = require('../bin/devflow-state')

function devflowRoot(dir) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    try { fs.lstatSync(path.join(d, '.devflow.json')); return d } catch {}
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
    const open = ['build', 'verify'].includes(ledger.stage) && task.current <= task.total
    // Empty means empty: [] and {} are how ledger-update clears a key it cannot delete.
    const filled = v => (v && typeof v === 'object' ? Object.keys(v).length > 0 : Boolean(v))
    const waiting = filled(ledger.blocked) || filled(ledger.decisions) || filled(ledger.running)
    if (ledger.mode !== 'autonomous' || !open || waiting) return { result: null }
    const key = String(task.current)
    const counts = { ...(ledger.counts || {}) }
    const mine = { ...(counts[key] || {}) }
    if ((mine.continue || 0) >= MAX_CONTINUES) return { result: null }
    mine.continue = (mine.continue || 0) + 1
    counts[key] = mine
    return { ledger: { ...ledger, counts }, result: { task, stage: ledger.stage } }
  })
  if (!r.ok || !r.result) return ''
  const { task, stage } = r.result
  return JSON.stringify({ decision: 'block', reason: `devflow: task ${task.current}/${task.total} is open (${stage}) in ` +
    'autonomous mode. Continue it: finish the stage, commit, update the ledger. ' +
    `Stop only for a blocker or a decision for the user, recorded in the ledger as blocked or decisions.` })
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

// git metadata the hook reads only when it is a small regular file on a local path. A link, FIFO, device, network
// path or large file could make the read wait past the hook's timeout.
const NETWORK_PATH = /^(\\\\|\/\/)/
// A long-path prefix ("\\?\" or "\\.\") followed by a drive letter is local; a UNC share or "\\?\UNC\" is not.
const isNetwork = s => NETWORK_PATH.test(s) && !/^(\\\\|\/\/)[?.][\\/][A-Za-z]:/.test(s)

// False when p, or a folder link on the way to it, names a network path. A link is judged by its own text, read
// without following it, so the check itself never touches the network. A link to a link is judged the same way
// along the chain (Issue #53): the walk goes on from the link's text, past folders already known to be no links, so
// each link counts once; past MAX_LINKS links in all, the path counts as remote.
const MAX_LINKS = 8
function localPath(p) {
  if (isNetwork(p)) return false
  let done = path.parse(path.resolve(p)).root
  let rest = path.resolve(p).slice(done.length).split(/[\\/]/).filter(Boolean)
  let links = 0
  while (rest.length) {
    const q = path.join(done, rest.shift())
    let st
    try { st = fs.lstatSync(q) } catch { return true }
    if (!st.isSymbolicLink()) {
      done = q
      continue
    }
    let to
    try { to = fs.readlinkSync(q) } catch { return false }
    const next = path.resolve(done, to)
    if (++links > MAX_LINKS || isNetwork(to) || isNetwork(next)) return false
    done = path.parse(next).root
    rest = [...next.slice(done.length).split(/[\\/]/).filter(Boolean), ...rest]
  }
  return true
}

function smallFile(p, maxBytes = 4096) {
  if (!localPath(p)) return null
  let fd
  try {
    const st = fs.lstatSync(p)
    if (!st.isFile() || st.size > maxBytes) return null
    const { O_RDONLY, O_NONBLOCK = 0, O_NOFOLLOW = 0 } = fs.constants
    fd = fs.openSync(p, O_RDONLY | O_NONBLOCK | O_NOFOLLOW)
    const opened = fs.fstatSync(fd)
    if (!opened.isFile() || opened.size > maxBytes || opened.dev !== st.dev || opened.ino !== st.ino) return null
    // Windows has no O_NOFOLLOW: also reject a path replaced by a link to the same inode before reading the fd.
    const current = fs.lstatSync(p)
    if (!current.isFile() || current.dev !== opened.dev || current.ino !== opened.ino) return null
    const buf = Buffer.alloc(maxBytes + 1)
    let size = 0
    while (size < buf.length) {
      const n = fs.readSync(fd, buf, size, buf.length - size, null)
      if (!n) break
      size += n
    }
    return size <= maxBytes ? buf.toString('utf8', 0, size) : null
  } catch {
    return null
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
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

// The main work tree of linked worktree root, or null unless git's own records prove the worktree belongs to it
// (Issue #14): the common dir is a real folder named .git, the worktree's gitdir sits
// right under <common>/worktrees, and git's back link there names this worktree's .git. A .git file from an extracted
// archive cannot write into another repository's worktrees folder, so it cannot release sessions there.
function provenMain(root, own, common) {
  try {
    // Spellings only, never fs.realpath: a junction could lead the lookup to a network path past the hook timeout. A
    // worktree opened through subst or a junction fails the proof.
    const key = p => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p))
    // String tests first: once the gitdir is known to sit right under <common>/worktrees, the common dir is derived
    // from that local gitdir, so no crafted commondir (a network share, say) reaches the file system.
    if (isNetwork(common) || path.basename(common) !== '.git') return null
    if (key(path.dirname(own)) !== key(path.join(common, 'worktrees'))) return null
    const back = (smallFile(path.join(own, 'gitdir')) || '').trim()
    if (!back || isNetwork(back) || key(path.resolve(own, back)) !== key(path.join(root, '.git'))) return null
    // As devflow-state decides (docs/specs/repository.md, Issue 폴더): a .devflow.json is not asked of the main tree,
    // which may have a commit without one checked out; git's back link already ties the two.
    return fs.lstatSync(common).isDirectory() ? path.dirname(common) : null
  } catch {
    return null
  }
}

function handle(raw, env = state.realEnv) {
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return ''
  }
  if (!input || !['SessionStart', 'Stop', 'SessionEnd'].includes(input.hook_event_name)) return ''
  const cwd = input.cwd || process.cwd()
  eventSession = sessionHash(input.session_id)
  if (input.hook_event_name === 'SessionStart') {
    shareSessionId(env.vars || {}, cwd, input.session_id)
    let card
    try {
      card = state.card(env, cwd, { sessionId: input.session_id || null })
    } catch (e) {
      card = state.cardFailure(e)
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
