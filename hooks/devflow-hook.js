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
const GIT_WRITES = new Set(['rm', 'mv', 'checkout', 'restore', 'clean'])
const SCRIPT_FLAG =/^(-[A-Za-z]*c[A-Za-z]*|-com\w*|-e|-ec|-en\w*|\/[ck])$/i
const HTTP_GRAPHQL = /api\.github\.com\/graphql/i
const ALIAS_TIMEOUT_MS = 3000
const MAX_DEPTH = 6
const MAX_SCRIPT_BYTES = 256 * 1024

const word = text => ({ text, raw: text, dynamic: /[$`]/.test(text) })
const baseName = raw => raw.replace(/^["']|["']$/g, '').split(/[\\/]/).pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '')
const flatten = ws => ws.flatMap(w => (w.dynamic ? [w] : w.text.split(/\s+/).filter(Boolean).map(word)))

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
function parse(src) {
  const cmds = []
  const nested = []
  const docs = []
  const newCmd = pipedFrom => ({ words: [], stdin: [], redirects: [], pipedFrom })
  let cur = newCmd(null)
  let w = null
  let into = 'words' // where the next word goes: words, stdin (here-string) or redirects (a redirect target)
  const start = () => (w ??= { text: '', raw: '', dynamic: false })
  const push = () => {
    if (w && into === 'words') cur.words.push(w)
    else if (w && into === 'stdin') cur.stdin.push(w.text)
    else if (w && into === 'redirects' && !w.text.startsWith('&')) cur.redirects.push(w.text)
    if (w) into = 'words'
    w = null
  }
  const end = pipe => {
    push()
    const done = cur
    if (done.words.length || done.stdin.length || done.redirects.length) cmds.push(done)
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
        // An unquoted delimiter means the shell expands the body, running any $(...) or `...` in it.
        if (!doc.quoted) nested.push(...substitutions(body.join('\n')))
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

const isFile = p => {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
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
    const r = ctx.env.run('gh', ['alias', 'list'], { cwd: ctx.cwd, timeout: ALIAS_TIMEOUT_MS })
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
  const texts = from => args.slice(from).map(a => a.text).join(' ')
  // Every script the command could run is checked: the -c/-Command text wherever it sits and the first operand when
  // it names a file. Telling an option's value from the script operand needs each shell's option table; checking all
  // candidates needs none, and a later "-c" or an unknown option cannot hide either one.
  const scripts = []
  const files = []
  if (EVALS.has(name)) scripts.push(texts(0))
  else if (name === 'cmd') {
    const j = args.findIndex(a => /^\/[ck]$/i.test(a.text))
    if (j >= 0) scripts.push(texts(j + 1))
  } else if (SOURCERS.has(name)) {
    if (args[0]) files.push(args[0].text)
  } else if (PWSH.has(name)) {
    let bare = null
    args.forEach((a, i) => {
      const t = a.text
      if (/^-(c|com\w*)$/i.test(t)) scripts.push(texts(i + 1))
      else if (/^-(e|ec|en\w*)$/i.test(t) && args[i + 1]) scripts.push(Buffer.from(args[i + 1].text, 'base64').toString('utf16le'))
      else if (/^-f(ile)?$/i.test(t) && args[i + 1]) files.push(args[i + 1].text)
      else if (bare === null && !t.startsWith('-') && (name === 'powershell' || isFile(path.resolve(ctx.cwd, t)))) bare = i
    })
    // Windows PowerShell 5.1 reads a bare argument as -Command; PowerShell 7 reads it as -File.
    if (bare !== null) name === 'powershell' ? scripts.push(texts(bare)) : files.push(args[bare].text)
  } else {
    args.forEach((a, i) => {
      if (/^-[A-Za-z]*c[A-Za-z]*$/.test(a.text) && args[i + 1]) scripts.push(args[i + 1].text)
    })
    // The first operand that is a file: an option's value (-o pipefail, --rcfile x) is passed over unless it is one.
    const operand = args.find(a => !/^[-+]/.test(a.text) && isFile(path.resolve(ctx.cwd, a.text)))
    if (operand) files.push(operand.text)
  }
  const stdinScript = scripts.some(s => s === '-')
  for (const s of scripts.filter(s => s !== '-')) {
    const r = analyze(s, ctx, depth + 1)
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
    ? from.words.slice(1).filter(a => !a.text.startsWith('-')).map(a => readScript(ctx.cwd, a.text))
    : []
  const input = [...cmd.stdin, ...(from ? [...from.stdin, from.words.slice(1).map(a => a.text).join(' '), ...fromFiles] : [])]
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
  if (ctx.protect) {
    const hit = ctx.protect(writeTargets(cmd, names))
    if (hit) return PROTECTED + hit
  }
  // env -S splits its argument into a command line of its own.
  const split = words.findIndex((w, k) => names[k - 1] === 'env' && /^(-S|--split-string)/.test(w.text))
  if (split >= 0) {
    const inline = words[split].text.replace(/^(-S|--split-string=?)/, '')
    const r = analyze([inline, ...words.slice(split + 1).map(w => w.text)].join(' ').trim(), ctx, depth + 1)
    if (r) return r
  }
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
  if (HTTP_GRAPHQL.test(src) && /\bmutation\b/i.test(src)) return 'direct GitHub GraphQL mutation'
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
// With protect (files => the first protected one, or null), a write to a protected path counts as well.
function issueWrite(command, { cwd = process.cwd(), env = state.realEnv, protect = null } = {}) {
  const ctx = { cwd, env, protect, aliasMap: undefined }
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
  const operands = rest.filter(w => !w.dynamic && !w.text.startsWith('-')).map(w => w.text)
  const add = (paths, deep) => targets.push(...paths.map(p => ({ path: p, deep })))
  if (WRITE_ALL.has(n) || (n === 'sed' && rest.some(w => /^(-i|--in-place)/.test(w.text)))) add(operands, WRITE_DEEP.has(n))
  else if (WRITE_LAST.has(n) && operands.length) add([operands.at(-1)], false)
  else if (n === 'find' && rest.some(w => w.text === '-delete')) {
    const starts = []
    for (const w of rest) {
      if (/^[-(!]/.test(w.text)) break
      starts.push(w.text)
    }
    add(starts.length ? starts : ['.'], true)
  } else if (n === 'git') {
    // Past git's own options, some of which take a value: -C <dir>, -c <name=value>, --git-dir <dir>.
    let i = 0
    while (i < rest.length && rest[i].text.startsWith('-')) i += /^(-C|-c|--git-dir|--work-tree|--namespace)$/.test(rest[i].text) ? 2 : 1
    const sub = rest[i] ? rest[i].text.toLowerCase() : ''
    const paths = rest.slice(i + 1).filter(w => !w.dynamic && !w.text.startsWith('-')).map(w => w.text)
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
    if (fs.existsSync(path.join(d, '.devflow.json'))) return d
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
// Git Bash and Cygwin write a drive path as /d/x or /cygdrive/d/x; on Windows that is the same file, so compare it as such.
const nativePath = f => (process.platform === 'win32' ? f.replace(/^\/(?:cygdrive\/)?([a-zA-Z])(?=\/|$)/, '$1:') : f)

function relativeTo(root, cwd, files, { keepRoot = false } = {}) {
  return files.map(f => path.relative(root, path.resolve(cwd, nativePath(f))).split(path.sep).join('/'))
    .map(r => (keepRoot && r === '' ? '.' : r)).filter(r => r && !r.startsWith('..'))
}

// targets => the first one that writes a .devflow.json protected path, or null; null in place of the function when the
// profile cannot be read. A target counts when it matches a protected glob, is the protected folder itself, or - for a
// deep write - contains it or is a pattern that names it (rm -rf _ref, rm -rf ., rm -rf *). Windows and macOS file
// systems ignore case, so _REF/x must match _ref/** there.
function protectionFor(root, cwd) {
  let globs
  try {
    globs = JSON.parse(fs.readFileSync(path.join(root, '.devflow.json'), 'utf8')).protected || []
  } catch {
    return null
  }
  const fold = /^(win32|darwin)$/.test(process.platform) ? s => s.toLowerCase() : s => s
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

const PROTECTED = 'write to protected path '

// Edit tools write files; an unreadable profile leaves only the profile itself editable, so it can be repaired.
function protectedEdit(root, cwd, toolInput) {
  const protect = protectionFor(root, cwd)
  const files = editedFiles(toolInput)
  if (!protect) {
    const others = relativeTo(root, cwd, files).filter(r => r !== '.devflow.json')
    return others.length ? { unreadable: true } : null
  }
  const hit = protect(files.map(p => ({ path: p, deep: false })))
  return hit ? { path: hit } : null
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
  if (!ctx || !ctx.issue) return ''
  const ledger = state.readLedger(ctx.root, ctx.issue)
  if (!ledger) return ''
  // Unattended means the ledger says so: approval settings such as bypass or yolo say nothing about who is present.
  const task = ledger.task || {}
  const open = ['build', 'verify'].includes(ledger.stage) && task.current <= task.total
  const waiting = ledger.blocked || (ledger.decisions || []).length || (ledger.running || []).length
  if (ledger.mode !== 'autonomous' || !open || waiting) return ''
  const key = String(task.current)
  const counts = { ...(ledger.counts || {}) }
  const mine = { ...(counts[key] || {}) }
  if ((mine.continue || 0) >= MAX_CONTINUES) return ''
  mine.continue = (mine.continue || 0) + 1
  counts[key] = mine
  state.writeLedger(ctx.root, ctx.issue, { ...ledger, counts })
  return JSON.stringify({ decision: 'block', reason: `devflow: task ${task.current}/${task.total} is open (${ledger.stage}) in ` +
    'autonomous mode. Continue it: finish the stage, commit, update the ledger. ' +
    `Stop only for a blocker or a decision for the user, recorded in the ledger as blocked or decisions.` })
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
    try {
      const root = devflowRoot(cwd)
      if (!root) return ''
      const tool = String(input.tool_name || '')
      if (EDIT_TOOLS.test(tool)) {
        const hit = protectedEdit(root, cwd, input.tool_input)
        if (!hit) return ''
        return deny(hit.unreadable ? 'devflow: .devflow.json does not parse, so its protected paths are unknown; fix .devflow.json first.'
          : `devflow: ${hit.path} is a protected path in .devflow.json; leave it as it is.`)
      }
      const kind = tool.startsWith('mcp__') ? mcpIssueWrite(tool)
        : issueWrite(input.tool_input && input.tool_input.command, { cwd, env, protect: protectionFor(root, cwd) })
      if (!kind) return ''
      if (kind.startsWith(PROTECTED)) return deny(`devflow: ${kind.slice(PROTECTED.length)} is a protected path in .devflow.json; leave it as it is.`)
      return deny(`devflow: Issue writes go through devflow-state (state, comment, check, close, reopen, create), which filters ` +
        `paths, secrets and length before posting. Blocked: ${kind}.`)
    } catch (e) {
      return deny(`devflow: the check failed (${e.message}), so the tool call was blocked.`)
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
