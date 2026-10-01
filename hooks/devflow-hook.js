'use strict'
// SessionStart prints the resume card; PreToolUse blocks Issue writes that bypass devflow-state.
// Both run only in repositories with .devflow.json. Rules: docs/specs/documents.md (Issue I/O, resume card).
const fs = require('fs')
const path = require('path')
const state = require('../bin/devflow-state')

const GH_COMMANDS = new Set(('auth browse codespace discussion gist issue org pr project release repo skill cache run workflow ' +
  'agent-task alias api attestation completion config copilot extension gpg-key label licenses preview ruleset search ' +
  'secret ssh-key status variable accessibility actions environment exit-codes formatting mintty reference telemetry help').split(' '))
const ISSUE_WRITE_OPS = new Set('create new close comment delete develop edit lock pin reopen transfer unlock unpin'.split(' '))
const LEADERS = new Set(('timeout time nice nohup stdbuf command builtin noglob nocorrect env sudo exec watch setsid ionice flock ' +
  'if then else elif do while until ! { } call start').split(' '))
const PRINTERS = new Set(['echo', 'printf', 'write-output', 'write-host'])
const SH = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
const PWSH = new Set(['pwsh', 'powershell'])
const EVALS = new Set(['eval', 'iex', 'invoke-expression'])
const SOURCERS = new Set(['.', 'source'])
const API_VALUE_FLAGS = new Set(['-X', '--method', '-f', '-F', '--field', '--raw-field', '-H', '--header', '--input', '-q', '--jq',
  '-t', '--template', '--hostname', '-p', '--preview', '--cache'])
const API_FIELD_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input'])
const HTTP_ISSUES = /api\.github\.com\/[^\s'"]*issues/i
const HTTP_WRITE = /(?:-X|--request|-Method)\s*['"]?(?:POST|PATCH|PUT|DELETE)\b|\s(?:-d|--data[\w-]*|--json|-Body)\b|\bmethod\s*:\s*['"](?:POST|PATCH|PUT|DELETE)/i
const SCRIPT_FLAG = /^(-[A-Za-z]*c[A-Za-z]*|-com\w*|-e|-ec|-en\w*|\/[ck])$/i
const MAX_DEPTH = 6
const MAX_SCRIPT_BYTES = 256 * 1024

const word = text => ({ text, raw: text, dynamic: /[$`]/.test(text) })
const baseName = raw => raw.replace(/^["']|["']$/g, '').split(/[\\/]/).pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '')
const flatten = ws => ws.flatMap(w => (w.dynamic ? [w] : w.text.split(/\s+/).filter(Boolean).map(word)))

// Splits shell text into simple commands. Bash rules first; PowerShell and cmd differ mostly in ways that only
// make this see more, not less. Substitutions, process substitutions and heredoc bodies are kept for a closer look.
function parse(src) {
  const cmds = []
  const nested = []
  const docs = []
  const newCmd = pipedFrom => ({ words: [], stdin: [], pipedFrom })
  let cur = newCmd(null)
  let w = null
  let into = 'words' // where the next word goes: words, stdin (here-string) or nowhere (redirect target)
  const start = () => (w ??= { text: '', raw: '', dynamic: false })
  const push = () => {
    if (w && into === 'words') cur.words.push(w)
    else if (w && into === 'stdin') cur.stdin.push(w.text)
    if (w) into = 'words'
    w = null
  }
  const end = pipe => {
    push()
    const done = cur
    if (done.words.length || done.stdin.length) cmds.push(done)
    cur = newCmd(pipe && done.words.length ? done : null)
  }
  const close = (i, open, shut) => {
    for (let d = 0, j = i; j < src.length; j++) {
      if (src[j] === open) d++
      else if (src[j] === shut && --d === 0) return j
    }
    return src.length
  }
  const substitution = (i, k) => {
    const s = start()
    s.dynamic = true
    s.text += src.slice(i, k + 1)
    s.raw += src.slice(i, k + 1)
  }
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const n = src[i + 1]
    if (c === '\\' && n === '\n') {
      i++
    } else if (c === '\n') {
      end(false)
      for (const doc of docs.splice(0)) {
        const body = []
        let j = i + 1
        while (j <= src.length) {
          const e = src.indexOf('\n', j)
          const line = src.slice(j, e < 0 ? src.length : e)
          j = e < 0 ? src.length + 1 : e + 1
          if ((doc.strip ? line.replace(/^\t+/, '') : line).trimEnd() === doc.delim) break
          body.push(line)
        }
        doc.owner.stdin.push(body.join('\n'))
        i = j - 1
      }
    } else if (/\s/.test(c)) {
      push()
    } else if (c === '#' && !w) {
      while (i + 1 < src.length && src[i + 1] !== '\n') i++
    } else if (c === '<' && n === '<') {
      push()
      const doc = /^<<(-?)[ \t]*(['"]?)([^\s'";|&<>()]+)\2/.exec(src.slice(i))
      if (src[i + 2] === '<') {
        into = 'stdin'
        i += 2
      } else if (doc) {
        docs.push({ owner: cur, delim: doc[3], strip: doc[1] === '-' })
        i += doc[0].length - 1
      }
    } else if ((c === '<' || c === '>') && n === '(') {
      const k = close(i + 1, '(', ')')
      nested.push(src.slice(i + 2, k))
      i = k
    } else if (c === '>' || c === '<' || (c === '&' && n === '>')) {
      if (w && /^\d+$/.test(w.text)) w = null
      push()
      while (src[i + 1] === '>' || src[i + 1] === '&') i++
      if (src[i] === '&' && /\d/.test(src[i + 1] || '')) {
        while (/\d/.test(src[i + 1] || '')) i++
      } else into = 'nowhere'
    } else if (c === '|') {
      end(n !== '|')
      if (n === '|' || n === '&') i++
    } else if (c === ';' || c === '&' || c === '(' || c === ')') {
      end(false)
      if ((c === '&' && n === '&') || (c === ';' && n === ';')) i++
    } else if (c === "'") {
      const k = src.indexOf("'", i + 1) < 0 ? src.length : src.indexOf("'", i + 1)
      const s = start()
      s.text += src.slice(i + 1, k)
      s.raw += src.slice(i, k + 1)
      i = k
    } else if (c === '"') {
      const s = start()
      s.raw += '"'
      let j = i + 1
      for (; j < src.length && src[j] !== '"'; j++) {
        const d = src[j]
        const tick = d === '`' ? src.indexOf('`', j + 1) : -1
        const quote = src.indexOf('"', j + 1)
        if (d === '$' && src[j + 1] === '(') {
          const k = close(j + 1, '(', ')')
          nested.push(src.slice(j + 2, k))
          s.dynamic = true
          s.text += src.slice(j, k + 1)
          s.raw += src.slice(j, k + 1)
          j = k
        } else if (d === '`' && tick > j && (quote < 0 || tick < quote)) {
          nested.push(src.slice(j + 1, tick))
          s.dynamic = true
          s.text += src.slice(j, tick + 1)
          s.raw += src.slice(j, tick + 1)
          j = tick
        } else if ((d === '\\' || d === '`') && j + 1 < src.length) {
          s.text += src[j + 1]
          s.raw += d + src[j + 1]
          j++
        } else {
          if (d === '$') s.dynamic = true
          s.text += d
          s.raw += d
        }
      }
      s.raw += '"'
      i = j
    } else if (c === '$' && n === '(') {
      const k = close(i + 1, '(', ')')
      nested.push(src.slice(i + 2, k))
      substitution(i, k)
      i = k
    } else if (c === '`' && src.indexOf('`', i + 1) > i) {
      const k = src.indexOf('`', i + 1)
      nested.push(src.slice(i + 1, k))
      substitution(i, k)
      i = k
    } else if (c === '\\' && i + 1 < src.length) {
      const s = start()
      s.text += n
      s.raw += c + n
      i++
    } else {
      const s = start()
      if (c === '$') s.dynamic = true
      s.text += c
      s.raw += c
    }
  }
  end(false)
  for (const doc of docs) doc.owner.stdin.push('')
  return { cmds, nested }
}

function readScript(cwd, file) {
  try {
    const p = path.resolve(cwd, file)
    const st = fs.statSync(p)
    return st.isFile() && st.size <= MAX_SCRIPT_BYTES ? fs.readFileSync(p, 'utf8') : ''
  } catch {
    return ''
  }
}

function aliasesOf(ctx) {
  if (ctx.aliasMap === undefined) {
    const r = ctx.env.run('gh', ['alias', 'list'], { cwd: ctx.cwd })
    ctx.aliasMap = r.code === 0
      ? Object.fromEntries(r.stdout.split(/\r?\n/).map(l => /^(\S+):\s+(.*)$/.exec(l)).filter(Boolean).map(m => [m[1], m[2].trim()]))
      : null
  }
  return ctx.aliasMap
}

function apiWrite(args) {
  let endpoint = null
  let method = null
  let fields = false
  let unreadableQuery = false
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text
    let flag = t
    let value = null
    let dynamic = false
    if (/^--[\w-]+=/.test(t)) [flag, value] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]
    else if (/^-X./.test(t)) [flag, value] = ['-X', t.slice(2)]
    else if (API_VALUE_FLAGS.has(t)) {
      value = args[i + 1] ? args[i + 1].text : ''
      dynamic = Boolean(args[i + 1] && args[i + 1].dynamic)
      i++
    } else if (!t.startsWith('-')) {
      endpoint ??= args[i]
      continue
    }
    if (flag === '-X' || flag === '--method') method = String(value).toUpperCase()
    if (API_FIELD_FLAGS.has(flag)) {
      fields = true
      if (flag === '--input' || (/^query=/.test(value || '') && (dynamic || /^query=@/.test(value)))) unreadableQuery = true
    }
  }
  if (!endpoint) return null
  if (!endpoint.dynamic && endpoint.text === 'graphql') {
    // A query read from a file or built at run time cannot be checked, so it counts as a mutation.
    return unreadableQuery || args.some(a => /\bmutation\b/i.test(a.text)) ? 'gh api graphql mutation' : null
  }
  if (!endpoint.dynamic && !/issues/i.test(endpoint.text)) return null
  const writes = method ? method !== 'GET' : fields
  if (!writes) return null
  return endpoint.dynamic ? 'gh api write to a path built at run time' : 'gh api Issue write'
}

function ghWrite(args, ctx, depth) {
  let i = 0
  const skipFlags = () => {
    while (i < args.length && args[i].text.startsWith('-')) i += /^(-R|--repo)$/.test(args[i].text) ? 2 : 1
  }
  skipFlags()
  const sub = args[i]
  if (!sub) return null
  if (sub.dynamic) return 'gh subcommand built at run time'
  const s = sub.text.toLowerCase()
  if (s === 'issue') {
    i++
    skipFlags()
    const op = args[i]
    if (!op) return null
    if (op.dynamic) return 'gh issue operation built at run time'
    return ISSUE_WRITE_OPS.has(op.text.toLowerCase()) ? 'gh issue write' : null
  }
  if (s === 'api') return apiWrite(args.slice(i + 1))
  if (GH_COMMANDS.has(s)) return null
  const aliases = aliasesOf(ctx)
  if (aliases === null) return `gh alias lookup failed for "${s}"`
  const expansion = aliases[s]
  if (expansion === undefined) return null // an extension
  if (depth >= MAX_DEPTH) return 'gh alias nested too deeply to check'
  const rest = args.slice(i + 1)
  if (expansion.startsWith('!')) return analyze(`${expansion.slice(1)} ${rest.map(a => a.raw).join(' ')}`, ctx, depth + 1)
  return ghWrite([...flatten([word(expansion)]), ...rest], ctx, depth + 1)
}

function shellWrite(cmd, k, ctx, depth) {
  const name = baseName(cmd.words[k].raw)
  const args = cmd.words.slice(k + 1)
  const texts = from => args.slice(from).map(a => a.text).join(' ')
  const at = re => args.findIndex(a => re.test(a.text))
  let script = null
  let file = null
  if (EVALS.has(name)) script = texts(0)
  else if (name === 'cmd') {
    const j = at(/^\/[ck]$/i)
    if (j >= 0) script = texts(j + 1)
  } else if (SOURCERS.has(name)) file = args[0] && args[0].text
  else if (PWSH.has(name)) {
    const c = at(/^-(c|com\w*)$/i)
    const e = at(/^-(e|ec|en\w*)$/i)
    const f = at(/^-f(ile)?$/i)
    if (c >= 0) script = texts(c + 1)
    else if (e >= 0 && args[e + 1]) script = Buffer.from(args[e + 1].text, 'base64').toString('utf16le')
    else if (f >= 0 && args[f + 1]) file = args[f + 1].text
    else file = (args.find(a => !a.text.startsWith('-')) || {}).text
  } else {
    const c = at(/^-[A-Za-z]*c[A-Za-z]*$/)
    if (c >= 0) script = args[c + 1] ? args[c + 1].text : ''
    else file = (args.find(a => !a.text.startsWith('-')) || {}).text
  }
  if (script !== null) return analyze(script, ctx, depth + 1)
  if (file) return analyze(readScript(ctx.cwd, file), ctx, depth + 1)
  // No script and no file: the shell runs what it reads on stdin.
  const from = cmd.pipedFrom
  const input = [...cmd.stdin, ...(from ? [...from.stdin, from.words.slice(1).map(a => a.text).join(' ')] : [])]
  for (const s of input) {
    const r = analyze(s, ctx, depth + 1)
    if (r) return r
  }
  return null
}

// The word the shell runs: past assignments, wrappers like timeout or env, and their options and numbers.
function leadOf(words, names) {
  let k = 0
  while (k < words.length) {
    if (/^[A-Za-z_]\w*=/.test(words[k].text)) k++
    else if (LEADERS.has(names[k])) {
      k++
      while (k < words.length && (/^-/.test(words[k].text) || /^\d+(\.\d+)?[smhd]?$/.test(words[k].text))) k++
    } else return k
  }
  return -1
}

function checkCommand(cmd, ctx, depth) {
  const { words } = cmd
  const names = words.map(w => baseName(w.raw))
  const lead = leadOf(words, names)
  if (lead < 0) return null
  if (words[lead].dynamic && words.some(w => /^(issue|api)$/i.test(w.text))) return 'command name built at run time with Issue words'
  if (PRINTERS.has(names[lead])) return null
  if (/\.(sh|bash|ps1|cmd|bat)$/i.test(words[lead].text) || /^\.{0,2}[\\/]/.test(words[lead].text)) {
    const body = readScript(ctx.cwd, words[lead].text)
    if (/^#!.*\b(sh|bash|zsh|pwsh)\b|^(?!#!)/.test(body) && !body.includes('\0')) {
      const r = analyze(body, ctx, depth + 1)
      if (r) return r
    }
  }
  for (let k = lead; k < words.length; k++) {
    const n = names[k]
    let r = null
    if (n === 'gh') r = ghWrite(k === lead ? words.slice(k + 1) : flatten(words.slice(k + 1)), ctx, depth)
    else if (k === lead && (SH.has(n) || PWSH.has(n) || EVALS.has(n) || SOURCERS.has(n) || n === 'cmd')) r = shellWrite(cmd, k, ctx, depth)
    else if (k > lead && (SH.has(n) || PWSH.has(n) || n === 'cmd') && words.slice(k + 1).some(a => SCRIPT_FLAG.test(a.text))) {
      // A shell started by another command (xargs, sudo, Start-Process) counts when it is given a script.
      r = shellWrite(cmd, k, ctx, depth)
    }
    if (r) return r
  }
  return null
}

function analyze(src, ctx, depth = 0) {
  if (!src) return null
  if (depth > MAX_DEPTH) return 'command nested too deeply to check'
  if (HTTP_ISSUES.test(src) && HTTP_WRITE.test(src)) return 'direct GitHub API Issue write'
  const { cmds, nested } = parse(src)
  for (const s of nested) {
    const r = analyze(s, ctx, depth + 1)
    if (r) return r
  }
  for (const cmd of cmds) {
    const r = checkCommand(cmd, ctx, depth)
    if (r) return r
  }
  return null
}

// Returns what kind of Issue write the shell command makes, or null. It follows what the text runs: separators,
// substitutions, shells given a script, eval, piped or heredoc input to a shell, script files and gh aliases.
// A guardrail, not a sandbox: words built from variables, encodings it does not decode, or HTTP from other
// languages get past it; a narrow gh token is what stops those.
function issueWrite(command, { cwd = process.cwd(), env = state.realEnv } = {}) {
  const ctx = { cwd, env, aliasMap: undefined }
  if (Array.isArray(command)) return checkCommand({ words: command.map(word), stdin: [], pipedFrom: null }, ctx, 0)
  return analyze(String(command || ''), ctx)
}

// GitHub MCP tools that write Issues: issue_write, sub_issue_write, add_issue_comment, assign_copilot_to_issue, ...
function mcpIssueWrite(tool) {
  const cut = tool.lastIndexOf('__')
  const server = tool.slice(5, cut)
  const name = tool.slice(cut + 2).toLowerCase()
  if (!/github/i.test(server) || !/issue/.test(name)) return null
  return /^(get|list|search)_|_read$/.test(name) ? null : `GitHub MCP Issue write (${name})`
}

function isDevflowRepo(dir) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.devflow.json'))) return true
    if (path.dirname(d) === d) return false
  }
}

const deny = reason => JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
})

// Returns the hook's stdout. PreToolUse fails closed: input it cannot read is denied.
function handle(raw, env = state.realEnv) {
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return deny('devflow: the hook input could not be read, so the command was not checked for Issue writes.')
  }
  const cwd = input.cwd || process.cwd()
  if (input.hook_event_name === 'SessionStart') {
    let card
    try {
      card = state.card(env, cwd)
    } catch (e) {
      card = `[devflow] resume card failed: ${e.message}`
    }
    return card ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: card } }) : ''
  }
  if (input.hook_event_name === 'PreToolUse') {
    try {
      if (!isDevflowRepo(cwd)) return ''
      const tool = String(input.tool_name || '')
      const kind = tool.startsWith('mcp__') ? mcpIssueWrite(tool) : issueWrite(input.tool_input && input.tool_input.command, { cwd, env })
      return kind ? deny(`devflow: Issue writes go through devflow-state (state, comment, close, reopen, create), which filters ` +
        `paths, secrets and length before posting. Blocked: ${kind}.`) : ''
    } catch (e) {
      return deny(`devflow: the Issue write check failed (${e.message}), so the command was blocked.`)
    }
  }
  return ''
}

function main() {
  let raw = ''
  try {
    raw = fs.readFileSync(0, 'utf8')
  } catch {}
  const out = handle(raw)
  if (out) process.stdout.write(out + '\n')
}

module.exports = { handle, issueWrite, mcpIssueWrite, main }
