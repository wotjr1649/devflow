'use strict'
// SessionStart prints the resume card; PreToolUse blocks Issue writes that bypass devflow-state.
// Both run only in repositories with .devflow.json. Rules: docs/specs/issues.md (Issue I/O, resume card),
// docs/specs/repository.md (profile protection, analysis deadline).
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const crypto = require('crypto')
const state = require('../bin/devflow-state')

const GH_COMMANDS = new Set(('auth browse codespace discussion gist issue org pr project release repo skill cache run workflow ' +
  'agent-task alias api attestation completion config copilot extension gpg-key label licenses preview ruleset search ' +
  'secret ssh-key status variable accessibility actions environment exit-codes formatting mintty reference telemetry help').split(' '))
const ISSUE_WRITE_OPS = new Set('create new close comment delete develop edit lock pin reopen transfer unlock unpin'.split(' '))
const LEADERS = new Set(('timeout time nice nohup stdbuf command builtin noglob nocorrect env sudo exec watch setsid ionice flock ' +
  'if then else elif do while until ! { } call start').split(' '))
const PRINTERS = new Set(['echo', 'printf', 'write-output', 'write-host'])
const FILE_PRINTERS = new Set(['cat', 'type', 'get-content', 'gc'])
const SH = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
const PWSH = new Set(['pwsh', 'powershell'])
const EVALS = new Set(['eval', 'iex', 'invoke-expression'])
const SOURCERS = new Set(['.', 'source'])
const API_VALUE_FLAGS = new Set(['-X', '--method', '-f', '-F', '--field', '--raw-field', '-H', '--header', '--input', '-q', '--jq',
  '-t', '--template', '--hostname', '-p', '--preview', '--cache'])
const API_FIELD_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input'])
const HTTP_ISSUES = /api\.github\.com\/[^\s'"]*issues/i
const HTTP_WRITE = /(?:-X|--request|-Method)\s*['"]?(?:POST|PATCH|PUT|DELETE)\b|\s(?:-d|--data[\w-]*|--json|-Body)\b|\bmethod\s*:\s*['"](?:POST|PATCH|PUT|DELETE)/i
// Commands that change every path they name, and those that change only the last one (the destination).
const WRITE_ALL = new Set(['rm', 'rmdir', 'mv', 'touch', 'tee', 'truncate', 'chmod', 'chown', 'shred', 'unlink', 'mkdir',
  'remove-item', 'ri', 'del', 'erase', 'rd', 'move-item', 'mi', 'move', 'set-content', 'sc', 'add-content', 'ac',
  'out-file', 'new-item', 'ni', 'rename-item', 'rni', 'clear-content', 'clc'])
const WRITE_DEEP = new Set(['rm', 'rmdir', 'chmod', 'chown', 'shred', 'remove-item', 'ri', 'del', 'erase', 'rd'])
const WRITE_LAST = new Set(['cp', 'copy-item', 'copy', 'cpi', 'install', 'ln'])
const CONTENT_WRITES = new Set(['set-content', 'sc', 'add-content', 'ac', 'out-file'])
const GIT_WRITES = new Set(['rm', 'mv', 'checkout', 'restore', 'clean'])
const SCRIPT_FLAG =/^(-[A-Za-z]*c[A-Za-z]*|-com\w*|-e|-ec|-en\w*|\/[ck])$/i
const HTTP_GRAPHQL = /api\.github\.com\/graphql/i
const ALIAS_TIMEOUT_MS = 3000
const MAX_DEPTH = 6
const MAX_SCRIPT_BYTES = 256 * 1024
const ANALYSIS_TIMEOUT_MS = 5000
// The PreToolUse hook gets 15 s (hooks.json); this is what its process may use from loading, leaving room for its start
// and exit. Starting the logging child alone took 0.7-1.4 s on a loaded machine, past a fixed 1 s (Issue #53), so
// logging gets whatever input and analysis left of it.
const HOOK_BUDGET_MS = 12000
const ANALYSIS_FAILURES = {
  'analysis-deadline': 'devflow: the 5-second analysis deadline was exceeded, so the tool call was blocked.',
  'hook-check-failed': 'devflow: the analyzer failed, so the tool call was blocked.',
}

const word = text => ({ text, raw: text, dynamic: /[$`]/.test(text) })
const baseName = raw => raw.replace(/^["']|["']$/g, '').split(/[\\/]/).pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '')
const flatten = ws => ws.flatMap(w => (w.dynamic ? [w] : w.text.split(/\s+/).filter(Boolean).map(word)))
// PowerShell and cmd separate paths with a backslash, which the Bash reading drops as an escape (Issue #48). The hook
// cannot tell which shell runs the text (Codex sends pwsh commands as Bash), so a word used as a path counts in both
// readings: the Bash one, and the raw word without quotes with its backslashes as separators.
const readingsOf = w => (w.raw.includes('\\') ? [w.text, w.raw.replace(/["']/g, '')] : [w.text])
const pathsOf = w => {
  const [bash, win] = readingsOf(w)
  if (win === undefined) return [bash]
  const p = win.replace(/\\/g, '/')
  // Off Windows, a drive or share path names no file in the repository.
  return process.platform !== 'win32' && /^([A-Za-z]:|\/\/)/.test(p) ? [bash] : [bash, p]
}

// The $(...) and `...` bodies in text the shell expands whatever quotes it holds (an unquoted heredoc body).
function substitutions(text) {
  const out = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') i++
    else if (text[i] === '$' && text[i + 1] === '(') {
      let j = i + 1
      for (let d = 0; j < text.length; j++) {
        if (text[j] === '(') d++
        else if (text[j] === ')' && --d === 0) break
      }
      out.push(text.slice(i + 2, j))
      i = j
    } else if (text[i] === '`') {
      const k = text.indexOf('`', i + 1)
      if (k < 0) break
      out.push(text.slice(i + 1, k))
      i = k
    }
  }
  return out
}

// Splits shell text into simple commands. Bash rules first; PowerShell and cmd differ mostly in ways that only
// make this see more, not less. Substitutions, process substitutions and heredoc bodies are kept for a closer look.
function parse(src, powershell = false) {
  const cmds = []
  const nested = []
  const docs = []
  // seps: the separators between this command and the one before it, for following cd (Issue #53).
  const newCmd = (pipedFrom, seps = []) => ({ words: [], stdin: [], redirects: [], pipedFrom, seps })
  let cur = newCmd(null)
  let w = null
  let into = 'words' // where the next word goes: words, stdin (here-string) or redirects (a redirect target)
  const start = () => (w ??= { text: '', raw: '', dynamic: false })
  const push = () => {
    if (w && into === 'words') cur.words.push(w)
    else if (w && into === 'stdin') cur.stdin.push(w.text)
    else if (w && into === 'redirects' && !w.text.startsWith('&')) cur.redirects.push(...pathsOf(w))
    if (w) into = 'words'
    w = null
  }
  const end = (pipe, sep) => {
    push()
    into = 'words'
    const done = cur
    const kept = done.words.length || done.stdin.length || done.redirects.length
    if (kept) cmds.push(done)
    cur = newCmd(pipe && done.words.length ? done : null, kept ? [sep] : [...done.seps, sep])
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
      end(false, ';')
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
        // An unquoted delimiter means the shell expands the body, running any $(...) or `...` in it.
        if (!doc.quoted) nested.push(...substitutions(body.join('\n')))
        i = j - 1
      }
    } else if (/\s/.test(c)) {
      push()
    } else if (powershell && c === '<' && n === '#') {
      push()
      const close = src.indexOf('#>', i + 2)
      i = close < 0 ? src.length : close + 1
    } else if (c === '#' && !w) {
      while (i + 1 < src.length && src[i + 1] !== '\n') i++
    } else if (c === '<' && n === '<') {
      push()
      const doc = /^<<(-?)[ \t]*(['"]?)([^\s'";|&<>()]+)\2/.exec(src.slice(i))
      if (src[i + 2] === '<') {
        into = 'stdin'
        i += 2
      } else if (doc) {
        docs.push({ owner: cur, delim: doc[3], strip: doc[1] === '-', quoted: doc[2] !== '' })
        i += doc[0].length - 1
      }
    } else if ((c === '<' || c === '>') && n === '(') {
      const k = close(i + 1, '(', ')')
      nested.push(src.slice(i + 2, k))
      i = k
    } else if (c === '>' || c === '<' || (c === '&' && n === '>')) {
      const reads = c === '<' && n !== '>' // "<" reads its target; ">", ">>", "&>" and "<>" write it
      if (w && /^\d+$/.test(w.text)) w = null
      push()
      while (src[i + 1] === '>' || src[i + 1] === '&') i++
      if (src[i] === '&' && /\d/.test(src[i + 1] || '')) {
        while (/\d/.test(src[i + 1] || '')) i++
      } else into = reads ? 'nowhere' : 'redirects'
    } else if (c === '|') {
      end(n !== '|', n === '|' ? '||' : '|')
      if (n === '|' || n === '&') i++
    } else if (c === ';' || c === '&' || c === '(' || c === ')') {
      end(false, c === '&' && n === '&' ? '&&' : c)
      if ((c === '&' && n === '&') || (c === ';' && n === ';')) i++
    } else if (!powershell && c === '$' && n === "'") {
      const s = start()
      let j = i + 2
      for (; j < src.length && src[j] !== "'"; j++) if (src[j] === '\\') j++
      // ANSI-C quotes are literal after escape decoding; an escaped quote does not end the word. Keep raw text for
      // the other path reading, but use the decoded text for redirects and file operands.
      const escapes = { a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' }
      s.text += src.slice(i + 2, j).replace(/\\(x[\da-fA-F]{1,2}|u[\da-fA-F]{1,4}|U[\da-fA-F]{1,8}|[0-7]{1,3}|c[\s\S]|[\s\S])/g, (raw, code) => {
        if (/^[xuU]/.test(code) && code.length > 1) return String.fromCodePoint(parseInt(code.slice(1), 16))
        if (/^[0-7]/.test(code)) return String.fromCharCode(parseInt(code, 8) & 255)
        if (code[0] === 'c' && code.length > 1) return String.fromCharCode(code[1] === '?' ? 127 : code[1].toUpperCase().charCodeAt(0) & 31)
        return escapes[code] ?? (/^[\\'"?]$/.test(code) ? code : raw)
      }).split('\0')[0]
      s.raw += src.slice(i, j + 1)
      i = j
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

// A file on a share is not opened: opening it would reach the server and offer it this user's credentials (Issue #48).
const isFile = p => {
  try {
    return localPath(p) && fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function readScript(cwd, file) {
  try {
    const p = path.resolve(cwd, file)
    if (!localPath(p)) return ''
    const st = fs.statSync(p)
    return st.isFile() && st.size <= MAX_SCRIPT_BYTES ? fs.readFileSync(p, 'utf8') : ''
  } catch {
    return ''
  }
}

// gh prints aliases as YAML, so a value may be quoted ('!gh …' for a shell alias). null: a value it cannot read.
function yamlScalar(v) {
  v = v.trim()
  if (v.startsWith("'")) return v.length > 1 && v.endsWith("'") ? v.slice(1, -1).replace(/''/g, "'") : null
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v)
    } catch {
      return null
    }
  }
  return /^[|>]/.test(v) ? null : v
}

function aliasesOf(ctx) {
  if (ctx.aliasMap === undefined) {
    // Shorter than the hook's own timeout, so a slow gh ends in a denial rather than the hook being cut off.
    const remaining = Math.floor(ctx.deadline - performance.now())
    if (remaining <= 0) throw new Error('analysis deadline exceeded')
    const r = ctx.env.run('gh', ['alias', 'list'], { cwd: ctx.cwd, timeout: Math.min(ALIAS_TIMEOUT_MS, remaining) })
    ctx.aliasMap = r.code === 0
      ? Object.fromEntries(r.stdout.split(/\r?\n/).map(l => /^([^\s:]+):\s*(.*)$/.exec(l)).filter(Boolean).map(m => [m[1], yamlScalar(m[2])]))
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
    if (/^--[\w-]+=/.test(t)) {
      ;[flag, value] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]
      dynamic = args[i].dynamic
    } else if (/^-[XfFHqtp]./.test(t)) {
      // pflag takes a short flag's value glued on: -XPOST, -fbody=x, -Fquery=@q.graphql
      ;[flag, value] = [t.slice(0, 2), t.slice(2)]
      dynamic = args[i].dynamic
    } else if (API_VALUE_FLAGS.has(t)) {
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
  const route = endpoint.text.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '').replace(/^api\/v3\//i, '').toLowerCase()
  if (!endpoint.dynamic && route === 'graphql') {
    // A query read from a file or built at run time cannot be checked, so it counts as a mutation.
    return unreadableQuery || args.some(a => /\bmutation\b/i.test(a.text)) ? 'gh api graphql mutation' : null
  }
  if (!endpoint.dynamic && !/issues/.test(route)) return null
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
  if (expansion === null) return `gh alias "${s}" could not be read`
  if (depth >= MAX_DEPTH) return 'gh alias nested too deeply to check'
  const rest = args.slice(i + 1)
  if (expansion.startsWith('!')) return analyze(`${expansion.slice(1)} ${rest.map(a => a.raw).join(' ')}`, ctx, depth + 1)
  return ghWrite([...flatten([word(expansion)]), ...rest], ctx, depth + 1)
}

function shellWrite(cmd, k, ctx, depth) {
  const name = baseName(cmd.words[k].raw)
  const args = cmd.words.slice(k + 1)
  // A script handed to the shell, in both readings when a word holds a backslash: the inner shell may be one that keeps
  // it as a path separator (Issue #48).
  const texts = from => {
    const ws = args.slice(from)
    const bash = ws.map(a => a.text).join(' ')
    return ws.some(a => a.raw.includes('\\')) ? [bash, ws.map(a => readingsOf(a).at(-1)).join(' ')] : [bash]
  }
  // Every script the command could run is checked: the -c/-Command text wherever it sits and the first operand when
  // it names a file. Telling an option's value from the script operand needs each shell's option table; checking all
  // candidates needs none, and a later "-c" or an unknown option cannot hide either one.
  const scripts = []
  const files = []
  if (EVALS.has(name)) scripts.push(...texts(0))
  else if (name === 'cmd') {
    const j = args.findIndex(a => /^\/[ck]$/i.test(a.text))
    if (j >= 0) scripts.push(...texts(j + 1))
  } else if (SOURCERS.has(name)) {
    if (args[0]) files.push(...pathsOf(args[0]))
  } else if (PWSH.has(name)) {
    let bare = null
    args.forEach((a, i) => {
      const t = a.text
      if (/^-(c|com\w*)$/i.test(t)) scripts.push(...texts(i + 1))
      else if (/^-(e|ec|en\w*)$/i.test(t) && args[i + 1]) scripts.push(Buffer.from(args[i + 1].text, 'base64').toString('utf16le'))
      else if (/^-f(ile)?$/i.test(t) && args[i + 1]) files.push(...pathsOf(args[i + 1]))
      else if (bare === null && !t.startsWith('-') && (name === 'powershell' || pathsOf(a).some(p => isFile(path.resolve(ctx.cwd, p))))) bare = i
    })
    // Windows PowerShell 5.1 reads a bare argument as -Command; PowerShell 7 reads it as -File.
    if (bare !== null) name === 'powershell' ? scripts.push(...texts(bare)) : files.push(...pathsOf(args[bare]))
  } else {
    args.forEach((a, i) => {
      if (/^-[A-Za-z]*c[A-Za-z]*$/.test(a.text) && args[i + 1]) scripts.push(...readingsOf(args[i + 1]))
    })
    // The first operand that is a file: an option's value (-o pipefail, --rcfile x) is passed over unless it is one.
    const operand = args.find(a => !/^[-+]/.test(a.text) && pathsOf(a).some(p => isFile(path.resolve(ctx.cwd, p))))
    if (operand) files.push(...pathsOf(operand))
  }
  const stdinScript = scripts.some(s => s === '-')
  for (const s of scripts.filter(s => s !== '-')) {
    const r = analyze(s, ctx, depth + 1, name === 'cmd')
    if (r) return r
  }
  for (const f of files) {
    const r = analyze(readScript(ctx.cwd, f), ctx, depth + 1)
    if (r) return r
  }
  if ((scripts.length && !stdinScript) || files.some(f => readScript(ctx.cwd, f))) return null
  // No script and no file: the shell runs what it reads on stdin, whether piped text, a heredoc or a file cat prints.
  const from = cmd.pipedFrom
  const fromNames = from ? from.words.map(w => baseName(w.raw)) : []
  const fromFiles = from && FILE_PRINTERS.has(fromNames[0])
    ? from.words.slice(1).filter(a => !a.text.startsWith('-')).flatMap(a => pathsOf(a).map(p => readScript(ctx.cwd, p)))
    : []
  const input = [...cmd.stdin, ...(from ? [...from.stdin, from.words.slice(1).map(a => a.text).join(' '), ...fromFiles] : [])]
  for (const s of input) {
    const r = analyze(s, ctx, depth + 1, name === 'cmd')
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
  if (ctx.protect) {
    const targets = writeTargets(cmd, names)
    const hit = ctx.protect((ctx.cwds || [ctx.cwd]).flatMap(c => targets.map(t => ({ ...t, path: path.resolve(c, nativePath(t.path)) }))))
    if (hit) return PROTECTED + hit
  }
  // env -S splits its argument into a command line of its own.
  const split = words.findIndex((w, k) => names[k - 1] === 'env' && /^(-S|--split-string)/.test(w.text))
  if (split >= 0) {
    const inline = words[split].text.replace(/^(-S|--split-string=?)/, '')
    const r = analyze([inline, ...words.slice(split + 1).map(w => w.text)].join(' ').trim(), ctx, depth + 1)
    if (r) return r
  }
  // devflow-state tests <n> lock -- <command> runs the command (Issue #50): what follows the first "--" after any word
  // naming devflow-state, in either reading, is checked as a command of its own.
  const ds = words.findIndex((w, k) => names[k] === 'devflow-state' || baseName(w.text) === 'devflow-state')
  const dash = ds < 0 ? -1 : words.findIndex((w, j) => j > ds && w.text === '--')
  if (dash >= 0) {
    const r = checkCommand({ words: words.slice(dash + 1), stdin: [], redirects: [], pipedFrom: null }, ctx, depth + 1)
    if (r) return r
  }
  const lead = leadOf(words, names)
  if (lead < 0) return null
  if (words[lead].dynamic && words.some(w => /^(issue|api)$/i.test(w.text))) return 'command name built at run time with Issue words'
  if (PRINTERS.has(names[lead])) return null
  if (/\.(sh|bash|ps1|cmd|bat)$/i.test(words[lead].text) || /^\.{0,2}[\\/]/.test(words[lead].text)) {
    // Every reading that names a script is checked: a file under one reading's name must not hide the other's.
    for (const body of pathsOf(words[lead]).map(p => readScript(ctx.cwd, p)).filter(Boolean)) {
      if (/^#!.*\b(sh|bash|zsh|pwsh)\b|^(?!#!)/.test(body) && !body.includes('\0')) {
        const r = analyze(body, ctx, depth + 1, /\.(cmd|bat)$/i.test(words[lead].text))
        if (r) return r
      }
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

// cd as the shell itself runs it, by its bare name: a path or an extension (/usr/bin/cd, ./cd.cmd) runs a program,
// which cannot move the shell, and bash finds CD on the PATH. PowerShell's own names ignore case.
const isCd = raw => /^(cd|pushd)$/.test(raw) || /^(set|push)-location$/i.test(raw)
const cdLike = c => c.words.length === 2 && isCd(c.words[0].raw)
// A redirect on a cd may be a pattern the parser split (zsh's <->), so only a bare one narrows.
const plainCd = c => cdLike(c) && !c.redirects.length && !c.stdin.length
// chdir and sl may be other programs in bash, so they only leave every folder seen.
const CWD_CHANGERS = new Set(['cd', 'pushd', 'set-location', 'push-location', 'chdir', 'sl', 'popd', 'pop-location',
  ...EVALS, ...SOURCERS])
// A folder a cd reaches from wherever the shell stands, with nothing the shell expands (* ? [ {). On Windows only a
// drive or share path: Git Bash mounts /tmp and / on other folders.
const fixedFolder = t => !/[*?[{]/.test(t) &&
  (process.platform === 'win32' ? /^([A-Za-z]:[\\/]|[\\/]{2})/.test(nativePath(t)) : t.startsWith('/'))
// Programs and cmdlets that cannot move the shell or give cd another meaning. A cd narrows only in text made of these
// and plain cds: a deny list of what can (functions, aliases, sourced files, modules, script blocks, cd..) never ended.
const KEEPS_FOLDER = new Set(['echo', 'printf', 'cat', 'head', 'tail', 'tee', 'ls', 'test', 'true', 'false', 'rm', 'rmdir',
  'mkdir', 'touch', 'cp', 'mv', 'ln', 'chmod', 'sed', 'awk', 'grep', 'jq', 'git', 'node', 'npm', 'npx', 'python', 'python3',
  'write-output', 'write-host', 'get-content', 'set-content', 'add-content', 'out-file', 'new-item', 'remove-item',
  'copy-item', 'move-item', 'get-childitem'])
// True when bash, zsh and PowerShell all split src as the parser does: one line of printable ASCII (bash joins a line
// ending in a backslash, PowerShell one ending in a backtick, and PowerShell reads curly quotes as quotes); outside
// quotes no character any of them reads specially (backticks, parentheses, braces, globs, comments, $); inside double
// quotes no $ or backtick; and no backslash before a quote, which only bash reads as an escape.
function plainText(src) {
  if (/[^\x20-\x7e]/.test(src) || /\\['"]/.test(src)) return false
  let quote = null
  for (const ch of src) {
    if (quote === "'") quote = ch === "'" ? null : quote
    else if (quote === '"') {
      if (ch === '"') quote = null
      else if (ch === '$' || ch === '`') return false
    } else if (ch === "'" || ch === '"') quote = ch
    else if (!/[\w ./\\:=,@%+&>|;-]/.test(ch)) return false
  }
  return quote === null
}

// The folders each command of a list may run in, from those in start (Issue #53). A command joined by && to a cd that
// surely moved the shell runs only there, so a write into another repository is not judged as one into this one;
// after any other separator a command may run in any folder seen so far. A cd moves the shell for sure only when the
// shell runs it itself, not in a pipeline or behind ||, to a fixed folder: a relative one may start from a folder a
// cd the hook cannot place picked, and $CDPATH, ~, - and variables are settings. Not in cmd, whose cd keeps the
// drive, nor when narrow is false. Anything else that may change the folder leaves every folder seen.
function cwdsAlong(cmds, start, narrow) {
  const unique = a => [...new Set(a)]
  let here = start
  let seen = start
  const each = cmds.map(cmd => {
    if (!(cmd.seps.length === 1 && cmd.seps[0] === '&&')) here = seen
    const at = here
    const names = cmd.words.map(w => baseName(w.raw))
    const to = cmd.words[1]
    if (cdLike(cmd) && !to.dynamic && !/^[-~]/.test(to.text)) {
      const readings = pathsOf(to)
      const moved = here.flatMap(c => readings.map(t => path.resolve(c, nativePath(t))))
      const sure = narrow && plainCd(cmd) && !cmd.seps.some(s => s === '||' || s === '|') && readings.every(fixedFolder)
      here = unique(sure ? moved : [...moved, ...seen])
    } else if (CWD_CHANGERS.has(names[leadOf(cmd.words, names)])) here = seen
    seen = unique([...seen, ...here])
    return at
  })
  return { each, seen }
}

// ctx.cwds holds the folders the command being checked may run in; text it runs (a script, a substitution) starts there.
function analyze(src, ctx, depth = 0, cmdShell = false, powershell = false) {
  if (!src) return null
  if (depth > MAX_DEPTH) return 'command nested too deeply to check'
  if (HTTP_ISSUES.test(src) && HTTP_WRITE.test(src)) return 'direct GitHub API Issue write'
  if (HTTP_GRAPHQL.test(src) && /\bmutation\b/i.test(src)) return 'direct GitHub GraphQL mutation'
  // Shell-specific quotes and comments can hide writes from the other reading. PowerShell block comments end at
  // the first #>, and its single quotes do not use ANSI-C backslash escapes. Keep the Bash reading too.
  if (!powershell && (src.includes('<#') || src.includes("$'"))) {
    const hit = analyze(src, ctx, depth, cmdShell, true)
    if (hit) return hit
  }
  const { cmds, nested } = parse(src, powershell)
  const outer = ctx.cwds
  // Anything else turns narrowing off for the rest of the command, the text it runs included: a definition there may
  // be exported to it, and a substitution is read after the list's folders are worked out. A program counts by its
  // bare name (a path or an extension may name a script that moves the shell), and a PowerShell function: or alias:
  // drive path may define one.
  const known = c => plainCd(c) ||
    (c.words.length > 0 && /^[A-Za-z][\w-]*$/.test(c.words[0].raw) && KEEPS_FOLDER.has(c.words[0].raw.toLowerCase()))
  // Checked on each word as the shell reads it: quotes inside a word (fun'ction:x') join up.
  const provider = cmds.some(c => c.words.some(w => /(function|alias):/i.test(w.text)) || c.redirects.some(p => /(function|alias):/i.test(p)))
  if (cmdShell || nested.length || !plainText(src) || provider || !cmds.every(known)) ctx.unsure = true
  const { each, seen } = cwdsAlong(cmds, outer || [ctx.cwd], !ctx.unsure)
  try {
    // A substitution's place in the list is not kept, so it may run in any of the folders.
    ctx.cwds = seen
    for (const s of nested) {
      const r = analyze(s, ctx, depth + 1, cmdShell)
      if (r) return r
    }
    for (const [i, cmd] of cmds.entries()) {
      ctx.cwds = each[i]
      const r = checkCommand(cmd, ctx, depth)
      if (r) return r
    }
    return null
  } finally {
    ctx.cwds = outer
  }
}

// Returns what kind of Issue write the shell command makes, or null. It follows what the text runs: separators,
// substitutions, shells given a script, eval, piped or heredoc input to a shell, script files and gh aliases.
// A guardrail, not a sandbox: words built from variables, encodings it does not decode, or HTTP from other
// languages get past it; a narrow gh token limits where those reach (docs/specs/issues.md, Issue 입출력).
// With protect (files => the first protected one, or null), a write to a protected path counts as well.
function issueWrite(command, { cwd = process.cwd(), env = state.realEnv, protect = null,
  deadline = performance.now() + ANALYSIS_TIMEOUT_MS - 1000 } = {}) {
  // Leave a second for the child to return before the outer deadline, including after a slow alias lookup.
  const ctx = { cwd, env, protect, aliasMap: undefined, deadline }
  if (Array.isArray(command)) return checkCommand({ words: command.map(word), stdin: [], redirects: [], pipedFrom: null }, ctx, 0)
  return analyze(String(command || ''), ctx)
}

// The paths a simple command writes, each marked deep when the command can change everything under it (rm -rf,
// chmod -R, git clean) rather than write one file there. A guardrail like the rest: a write made by a program it does
// not know about, or after a cd it does not follow, gets past it.
function writeTargets(cmd, names) {
  const targets = cmd.redirects.map(p => ({ path: p, deep: false }))
  const lead = leadOf(cmd.words, names)
  if (lead < 0) return targets
  const n = names[lead]
  const rest = cmd.words.slice(lead + 1)
  const operandWords = rest.filter(w => !w.dynamic && !w.text.startsWith('-'))
  const operands = operandWords.flatMap(pathsOf)
  const add = (paths, deep) => targets.push(...paths.map(p => ({ path: p, deep })))
  if (CONTENT_WRITES.has(n)) {
    // Content and option values are data. Unknown parameters retain the conservative operand check.
    const positional = [], named = []
    let unknown = false
    for (let i = 0; i < rest.length; i++) {
      const w = rest[i]
      if (/^-(literalpath|path|filepath)$/i.test(w.text)) { if (rest[i + 1]) named.push(rest[++i]); }
      else if (/^-(value|encoding|filter|include|exclude|stream|credential|delimiter)$/i.test(w.text)) i++
      else if (/^-(force|nonewline|asbytestream|passthru|whatif|confirm|verbose|debug)$/i.test(w.text)) {}
      else if (w.text.startsWith('-')) unknown = true
      else positional.push(w)
    }
    const paths = named.length ? named : unknown ? positional : positional.slice(0, 1)
    add(paths.filter(w => !w.dynamic).flatMap(pathsOf), false)
  } else if (WRITE_ALL.has(n) || (n === 'sed' && rest.some(w => /^(-i|--in-place)/.test(w.text)))) add(operands, WRITE_DEEP.has(n))
  else if (WRITE_LAST.has(n) && operandWords.length) add(pathsOf(operandWords.at(-1)), false)
  else if (n === 'find' && rest.some(w => w.text === '-delete')) {
    const starts = []
    for (const w of rest) {
      if (/^[-(!]/.test(w.text)) break
      starts.push(...pathsOf(w))
    }
    add(starts.length ? starts : ['.'], true)
  } else if (n === 'git') {
    // Past git's own options, some of which take a value: -C <dir>, -c <name=value>, --git-dir <dir>.
    let i = 0
    while (i < rest.length && rest[i].text.startsWith('-')) i += /^(-C|-c|--git-dir|--work-tree|--namespace)$/.test(rest[i].text) ? 2 : 1
    const sub = rest[i] ? rest[i].text.toLowerCase() : ''
    const paths = rest.slice(i + 1).filter(w => !w.dynamic && !w.text.startsWith('-')).flatMap(pathsOf)
    if (GIT_WRITES.has(sub)) add(paths.length ? paths : sub === 'clean' ? ['.'] : [], true)
  }
  return targets
}

// GitHub MCP tools that write Issues: issue_write, sub_issue_write, add_issue_comment, assign_copilot_to_issue, ...
function mcpIssueWrite(tool) {
  const cut = tool.lastIndexOf('__')
  const server = tool.slice(5, cut)
  const name = tool.slice(cut + 2).toLowerCase()
  if (!/github/i.test(server) || !/issue/.test(name)) return null
  return /^(get|list|search)_|_read$/.test(name) ? null : `GitHub MCP Issue write (${name})`
}

// The nearest folder at or above dir with a .devflow.json, or null.
function devflowRoot(dir) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    try { fs.lstatSync(path.join(d, '.devflow.json')); return d } catch {}
    if (path.dirname(d) === d) return null
  }
}

const EDIT_TOOLS = /^(Edit|Write|NotebookEdit|apply_patch)$/
const INSTRUCTION_FILE = /(^|\/)(AGENTS\.md|CLAUDE\.md|CLAUDE\.local\.md|SKILL\.md)$|^agents\/[^/]+\.md$/

// Files an edit tool touches: Claude's file_path or notebook_path, or the file headers of a Codex apply_patch.
function editedFiles(toolInput) {
  const t = toolInput || {}
  if (t.file_path || t.notebook_path) return [t.file_path || t.notebook_path]
  const patch = Array.isArray(t.command) ? t.command.join('\n') : String(t.command || t.patch || t.input || '')
  return [...patch.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm)].map(m => m[1].trim())
}

const globToRegExp = g => new RegExp('^' + g.split('**').map(part => part.split('*').map(s => s.replace(/[.+^${}()|[\]\\?]/g, '\\$&')).join('[^/]*')).join('.*') + '$')
const matchesGlob = (file, glob) => (path.posix.matchesGlob ? path.posix.matchesGlob(file, glob) : globToRegExp(glob).test(file))

// Paths relative to the devflow root, in forward slashes; files outside it are left out.
// Git Bash and Cygwin write a drive path as /d/x or /cygdrive/d/x. Windows also names local files through the long-path
// and device prefixes (\\?\ and \\.\ before a drive), \\?\UNC\host\share\x, and this machine's admin share of a drive
// (\\localhost\<drive>$\x). On Windows these are the same files, so compare them as such (Issue #48 review).
const nativePath = f => (process.platform !== 'win32' ? f : f
  .replace(/^\/(?:cygdrive\/)?([a-zA-Z])(?=\/|$)/, '$1:')
  .replace(/^[\\/]{2}[?.][\\/]UNC[\\/]/i, '//')
  .replace(/^[\\/]{2}[?.][\\/](?=[a-zA-Z]:)/, '')
  .replace(/^[\\/]{2}(?:localhost|127\.0\.0\.1)[\\/]([a-zA-Z])\$(?=[\\/]|$)/i, '$1:'))

function relativeTo(root, cwd, files, { keepRoot = false } = {}) {
  return files.map(f => path.relative(root, path.resolve(cwd, nativePath(f))))
    // On Windows a path on another drive or share comes back absolute: it is outside the root too.
    .filter(r => !path.isAbsolute(r)).map(r => r.split(path.sep).join('/'))
    .map(r => (keepRoot && r === '' ? '.' : r)).filter(r => r && !r.startsWith('..'))
}

// targets => the first protected path or the unreadable-profile marker, or null. An unreadable profile permits only
// its own repair. A target counts when it matches a protected glob, is the protected folder itself, or - for a
// deep write - contains it or is a pattern that names it (rm -rf _ref, rm -rf ., rm -rf *). Windows and macOS file
// systems ignore case, so _REF/x must match _ref/** there.
function protectionFor(root, cwd, extra = []) {
  const fold = /^(win32|darwin)$/.test(process.platform) ? s => s.toLowerCase() : s => s
  let globs
  try {
    const profile = JSON.parse(smallFile(path.join(root, '.devflow.json'), MAX_SCRIPT_BYTES))
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('invalid profile')
    globs = profile.protected === undefined ? [] : profile.protected
    if (!Array.isArray(globs) || globs.some(g => typeof g !== 'string')) throw new Error('invalid protected paths')
    globs = [...globs, ...extra]
  } catch {
    return targets => relativeTo(root, cwd, targets.map(t => t.path), { keepRoot: true })
      .some(r => fold(r) !== '.devflow.json') ? PROFILE_UNREADABLE : null
  }
  const bases = globs.map(g => fold(g).split(/[*?[{]/)[0].replace(/\/+$/, '')).filter(Boolean)
  return targets => {
    for (const t of targets) {
      const [r] = relativeTo(root, cwd, [t.path], { keepRoot: true })
      if (r === undefined) continue
      const f = fold(r)
      const hit = globs.some(g => matchesGlob(f, fold(g))) || bases.includes(f) ||
        (t.deep && bases.some(b => f === '.' || b.startsWith(f + '/') || (/[*?[]/.test(f) && matchesGlob(b, f))))
      if (hit) return r
    }
    return null
  }
}

// The .devflow.json "tests" globs, and the ledger itself, while the Issue's ledger has the tests locked (Issue #20), else
// none. The Issue comes from git's files as for the guard log, without spawning git on every tool call. A ledger that
// cannot be read counts as locked: breaking it must not lift the lock.
function lockedTests(root) {
  let globs
  try {
    globs = JSON.parse(smallFile(path.join(root, '.devflow.json'), MAX_SCRIPT_BYTES)).tests
  } catch {
    return []
  }
  if (!Array.isArray(globs) || !globs.length || globs.some(g => typeof g !== 'string' || !g)) return []
  const t = guardTarget(root)
  if (!t) return []
  const ledgerAbs = path.join(t.root, '.work', 'devflow', `i${t.issue}`, 'ledger.json')
  const ledgerFile = path.relative(root, ledgerAbs).split(path.sep).join('/')
  // The profile is locked with them: dropping its "tests" key would lift the lock (Issue #52).
  const locked = [...globs, '.devflow.json', ...(ledgerFile.startsWith('..') ? [] : [ledgerFile])]
  // From a linked worktree the ledger lies outside the root, where the path globs do not reach; edit tools check it here.
  locked.ledger = ledgerAbs
  try {
    const ledger = state.readLedger(t.root, t.issue)
    return ledger && ledger.testsLocked ? locked : []
  } catch {
    return locked
  }
}
const testLocked = (root, r) => blocked(root, 'test-locked', r === '.devflow.json'
  ? 'devflow: .devflow.json is locked with the tests for this fix. To change it, say why and unlock first: devflow-state ' +
    'tests <issue> unlock < reason.'
  : `devflow: ${r} is a test file, locked for this fix. Fix the code, not the test. If the test itself is wrong, say why ` +
    'and unlock it: devflow-state tests <issue> unlock < reason.')

const PROTECTED = 'write to protected path '
const PROFILE_UNREADABLE = 'unreadable profile'

// Edit tools write files; an unreadable profile leaves only the profile itself editable, so it can be repaired.
function protectedEdit(root, cwd, toolInput, tests = []) {
  const protect = protectionFor(root, cwd, tests)
  const files = editedFiles(toolInput)
  const hit = protect(files.map(p => ({ path: p, deep: false })))
  return hit === PROFILE_UNREADABLE ? { unreadable: true } : hit ? { path: hit } : null
}

// After an instruction file changes, report what doctor finds about it; nothing when it finds nothing.
function auditEdit(root, cwd, toolInput) {
  const edited = relativeTo(root, cwd, editedFiles(toolInput)).filter(r => INSTRUCTION_FILE.test(r))
  if (!edited.length) return ''
  const { doctor } = require('../bin/devflow-doctor')
  // Only the edited files and the instruction-file rules: a full repository scan on every edit costs too much.
  const lines = doctor(root, { only: edited }).lines.filter(l => /^(FAIL|WARN) /.test(l) &&
    (edited.some(r => l.includes(r)) || /^(FAIL|WARN) (agents-md|instructions):/.test(l)))
  if (!lines.length) return ''
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse',
    additionalContext: `devflow-doctor after editing ${edited.join(', ')}:\n${lines.join('\n')}` } })
}

// Autonomous work continues while a task is open and nothing waits on a person; at most twice per task.
const MAX_CONTINUES = 2
function continueWork(env, cwd) {
  const ctx = state.repoContext(env, cwd)
  if (!ctx || !ctx.issue || state.legacyOf(ctx, ctx.issue)) return ''
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
  // Use the guard's local metadata proof: a slow git process used to leave the main tree's session behind (#47).
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

const deny = reason => JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
})

// git metadata the hook reads only when it is a small regular file on a local path. A link, FIFO, device, network
// path or large file could make the read wait past the hook's timeout, and a timed-out hook does not block.
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

// The branch named by a HEAD file; null for a detached HEAD or anything unreadable.
function headBranch(gitDir) {
  const m = /^ref: refs\/heads\/(\S+)/.exec(smallFile(path.join(gitDir, 'HEAD')) || '')
  return m ? m[1] : null
}

// Local git directories shared by guard logging and session cleanup. A main tree is returned only with its back-link
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

// Where a block is logged: the Issue of this branch, or the main tree's Issue for an M3 task branch.
function guardTarget(root) {
  try {
    const issueOf = b => { const m = /^[^/]+\/(\d+)-/.exec(b || ''); return m ? Number(m[1]) : null }
    const location = gitLocation(root)
    if (!location) return null
    const { own, common, main: proven } = location
    const issue = issueOf(headBranch(own))
    if (issue) return { root: proven || root, issue }
    if (proven) {
      const main = issueOf(headBranch(common))
      return main ? { root: proven, issue: main } : null
    }
    // Only a worktree nested in the main work tree (M3's) logs there, so a crafted commondir cannot place the log
    // outside the folders above this one.
    const mainRoot = path.dirname(common)
    const key = p => (process.platform === 'win32' ? p.toLowerCase() : p) + path.sep
    if (common === own || !key(root).startsWith(key(mainRoot))) return null
    const main = issueOf(headBranch(common))
    return main ? { root: mainRoot, issue: main } : null
  } catch {
    return null
  }
}

// The main work tree of linked worktree root, or null unless git's own records prove the worktree belongs to it
// (Issue #14): the common dir is a real folder named .git, the worktree's gitdir sits
// right under <common>/worktrees, and git's back link there names this worktree's .git. A .git file from an extracted
// archive cannot write into another repository's worktrees folder, so it cannot send a log line there.
function provenMain(root, own, common) {
  try {
    // Spellings only, never fs.realpath: a junction could lead the lookup to a network path past the hook timeout. A
    // worktree opened through subst or a junction fails the proof and is logged as before.
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

// Logs the block for the cycle's metrics (docs/specs/metrics.md), then returns the same decision it would without it.
function blocked(root, guard, reason) {
  try {
    const t = root && guardTarget(root)
    if (t) state.logGuard(t.root, t.issue, guard)
  } catch {}
  return deny(reason)
}

// Returns the hook's stdout. PreToolUse fails closed: input it cannot read is denied.
function handle(raw, env = state.realEnv, deadline = performance.now() + ANALYSIS_TIMEOUT_MS - 1000) {
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return deny('devflow: the hook input could not be read, so the command was not checked for Issue writes.')
  }
  const cwd = input.cwd || process.cwd()
  if (input.hook_event_name === 'SessionStart') {
    shareSessionId(env.vars || {}, cwd, input.session_id)
    let card
    try {
      card = state.card(env, cwd, { sessionId: input.session_id })
    } catch (e) {
      card = `[devflow] resume card failed: ${e.message}`
    }
    return card ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: card } }) : ''
  }
  if (input.hook_event_name === 'SessionEnd') {
    try {
      releaseEverywhere(cwd, input.session_id)
    } catch {}
    return '' // SessionEnd cannot block, and its output is dropped
  }
  if (input.hook_event_name === 'PostToolUse') {
    try {
      const root = devflowRoot(cwd)
      return root && EDIT_TOOLS.test(String(input.tool_name || '')) ? auditEdit(root, cwd, input.tool_input) : ''
    } catch {
      return '' // a notice, not a guard: a failed audit stays silent rather than blocking the session
    }
  }
  if (input.hook_event_name === 'Stop') {
    try {
      return continueWork(env, cwd)
    } catch {
      return '' // blocking Stop on an error would loop
    }
  }
  if (input.hook_event_name === 'PreToolUse') {
    let root = null
    try {
      root = devflowRoot(cwd)
      if (!root) return ''
      const tool = String(input.tool_name || '')
      const tests = lockedTests(root)
      // A hit the profile's own protected paths do not cover is the test lock's.
      const byLock = hit => tests.length > 0 && !protectionFor(root, cwd)([{ path: path.join(root, hit), deep: true }])
      if (EDIT_TOOLS.test(tool)) {
        const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b)
        if (tests.ledger && editedFiles(input.tool_input).some(f => same(path.resolve(cwd, nativePath(f)), path.resolve(tests.ledger)))) {
          return testLocked(root, 'the Issue ledger')
        }
        const hit = protectedEdit(root, cwd, input.tool_input, tests)
        if (!hit) return ''
        if (hit.path && byLock(hit.path)) return testLocked(root, hit.path)
        return hit.unreadable
          ? blocked(root, 'profile-unreadable', 'devflow: .devflow.json does not parse, so its protected paths are unknown; fix .devflow.json first.')
          : blocked(root, 'protected-path', `devflow: ${hit.path} is a protected path in .devflow.json; leave it as it is.`)
      }
      const kind = tool.startsWith('mcp__') ? mcpIssueWrite(tool)
        : issueWrite(input.tool_input && input.tool_input.command, { cwd, env, protect: protectionFor(root, cwd, tests), deadline })
      if (!kind) return ''
      if (kind === PROTECTED + PROFILE_UNREADABLE) {
        return blocked(root, 'profile-unreadable', 'devflow: .devflow.json cannot be read, so its protected paths are unknown; fix .devflow.json first.')
      }
      if (kind.startsWith(PROTECTED) && kind !== PROTECTED + PROFILE_UNREADABLE && byLock(kind.slice(PROTECTED.length))) {
        return testLocked(root, kind.slice(PROTECTED.length))
      }
      if (kind.startsWith(PROTECTED)) {
        return blocked(root, 'protected-path', `devflow: ${kind.slice(PROTECTED.length)} is a protected path in .devflow.json; leave it as it is.`)
      }
      return blocked(root, 'issue-write', `devflow: Issue writes go through devflow-state (${[...state.WRITE_OPS].join(', ')}), which filters ` +
        `paths, secrets and length before posting. Blocked: ${kind}.`)
    } catch (e) {
      return blocked(root, 'hook-check-failed', `devflow: the check failed (${e.message}), so the tool call was blocked.`)
    }
  }
  return ''
}

// With DEVFLOW_HOOK_TIMING set, each phase of the PreToolUse path goes to stderr in milliseconds since the hook started,
// to find where a slow platform spends the deadline (Issue #37).
const started = performance.now()
const timing = (phase, extra = '') => {
  if (process.env.DEVFLOW_HOOK_TIMING) process.stderr.write(`devflow-timing ${phase} ${Math.round(performance.now() - started)}${extra}\n`)
}

// Hook input arrives on stdin through a pipe. A synchronous read of fd 0 sometimes never returned on macOS (Issue #37:
// 3 of 80 runs on Node 22, with the machine itself running), before any deadline could act, and the same fast path
// mishandles large piped input (nodejs/node#66341). The stream read runs on the event loop under its own limit; input
// that has not finished arriving by then is denied unless what did arrive names another event: a guard fails closed.
const STDIN_TIMEOUT_MS = 3000
const INPUT_LATE = 'devflow: the hook input did not finish arriving within 3 seconds, so the tool call was blocked.'
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

// Outside a devflow repository the analysis allows everything, so the hook neither starts it nor denies for its own
// reasons there: no deadline or late-input denial in a project that does not use devflow (Issue #52). A folder spelled
// as a share (\\host or //host) is left to the bounded analyzer. A share mounted as a drive or a path looks local: if it
// stops answering, this lookup waits until the host's timeout and the host lets the call through, a recorded limit
// (docs/specs/repository.md, the owner's decision).
const outsideDevflow = cwd => typeof cwd === 'string' && cwd !== '' && localPath(cwd) && !devflowRoot(cwd)
// The session's folder from input that stopped arriving: the top-level "cwd", which both hosts send before the tool
// input. A "cwd" inside the tool input names nothing about the session, so one seen after "tool_input" is not used.
function arrivedCwd(raw) {
  const m = /[{,]\s*"cwd"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(raw)
  const tool = raw.indexOf('"tool_input"')
  if (!m || (tool >= 0 && tool < m.index)) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

// Output is written synchronously before exiting: the process exits on purpose while stdin may still be open.
const emit = text => { if (text) fs.writeSync(1, text + '\n') }

async function main(inProcess = false) {
  if (!inProcess) timing('loaded', ` uptime=${Math.round(process.uptime() * 1000)}`)
  const { raw, complete } = await readStdin()
  if (!inProcess) timing('stdin', ` bytes=${raw.length} complete=${complete}`)
  if (!complete) {
    // The analyzer and the logger exit non-zero, so the parent falls back to its own denial.
    if (inProcess) process.exit(1)
    if (!/"hook_event_name"\s*:\s*"(?!PreToolUse")[A-Za-z]+"/.test(raw) && !outsideDevflow(arrivedCwd(raw))) emit(deny(INPUT_LATE))
    process.exit(0)
  }
  let out
  let input
  try { input = JSON.parse(raw) } catch {}
  if (typeof inProcess === 'string' && ANALYSIS_FAILURES[inProcess]) {
    out = blocked(devflowRoot(input?.cwd || process.cwd()), inProcess, ANALYSIS_FAILURES[inProcess])
  } else if (input?.hook_event_name === 'PreToolUse' && !inProcess && outsideDevflow(input.cwd || process.cwd())) {
    out = ''
  } else if (input?.hook_event_name === 'PreToolUse' && !inProcess) {
    // A timer in the analyzer cannot interrupt synchronous parsing or a blocked file read. Keep those in a child
    // with a deadline shorter than the host's: a killed or failed analyzer produces a denial, never an empty result.
    timing('analyzer-start')
    const r = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main(true)', __filename], {
      input: raw, encoding: 'utf8', timeout: ANALYSIS_TIMEOUT_MS, windowsHide: true,
    })
    timing('analyzer-done', ` error=${r.error?.code || ''} signal=${r.signal || ''} status=${r.status}`)
    const guard = r.error?.code === 'ETIMEDOUT' ? 'analysis-deadline' : r.status !== 0 ? 'hook-check-failed' : null
    if (guard) {
      // Logging reads repository metadata too. Bound it separately, so even a broken log path cannot delay denial.
      const log = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main(process.argv[2])', __filename, guard], {
        input: raw, encoding: 'utf8', timeout: Math.max(1, Math.floor(HOOK_BUDGET_MS - (performance.now() - started))), windowsHide: true,
      })
      timing('log-done', ` error=${log.error?.code || ''} status=${log.status}`)
      out = log.status === 0 && log.stdout.trim() ? log.stdout.trim() : deny(ANALYSIS_FAILURES[guard])
    } else out = r.stdout.trim()
  } else out = handle(raw)
  emit(out)
  timing('out')
  process.exit(0)
}

module.exports = { handle, issueWrite, mcpIssueWrite, localPath, main }
