'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const tmpdir = require('./tmpdir')
const { spawnSync } = require('child_process')
const { doctor } = require('../bin/devflow-doctor')

const IGNORE = ['# >>> devflow (managed)', '/docs/prompts/', '/docs/plans/', '/artifacts/', '/.work/', '/_ref/',
  '/.claude/worktrees/', '/.claude/settings.local.json', 'CLAUDE.local.md', '# <<< devflow', ''].join('\n')
const ATTRIBUTES = ['* text=auto eol=lf', '*.cmd text eol=crlf', '*.bat text eol=crlf', '*.png binary', '*.zip binary', ''].join('\n')
const GOOD = {
  'AGENTS.md': '# demo - what it is\n\n## Commands\n- `npm test`\n\n## Boundaries\n- push only on request\n',
  '.devflow.json': '{ "integration": "pr-ci" }\n',
  '.github/ISSUE_TEMPLATE/intent.md': '# intent\n',
  'docs/specs/a.md': '# a\n\n## Part one\n\nSee [b](../design/decisions/ADR-0001-b.md#why).\n',
  'docs/design/decisions/ADR-0001-b.md': '# b\n\n## Why\n',
  '.gitignore': IGNORE,
  '.gitattributes': ATTRIBUTES,
}

const git = (d, ...args) => spawnSync('git', ['-C', d, '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8' })

function repo(files = GOOD, { add = true } = {}) {
  const d = tmpdir('devflow-doctor-')
  git(d, 'init', '-q')
  for (const [f, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true })
    fs.writeFileSync(path.join(d, f), body)
  }
  if (add) git(d, 'add', '-A')
  return d
}

// Findings about this repository; a CLAUDE.md above the temporary folder belongs to the machine, not the fixture.
const findings = d => doctor(d).lines.filter(l => !(l.startsWith('FAIL instructions') && !l.includes(path.basename(d))))
const has = (d, re) => findings(d).some(l => re.test(l))

// Issue #23: doctor on a repository other than devflow (the Clauduct pilot) could not reach ok.
const failures = d => findings(d).filter(l => l.startsWith('FAIL'))

test('a test changed since the lock fails the gate on the Issue branch, by commit, edit or new file (#20)', () => {
  const d = repo({ ...GOOD, '.devflow.json': '{ "tests": ["tests/**"] }\n', 'tests/a.test.js': 'ok\n' })
  git(d, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'a')
  git(d, 'switch', '-q', '-c', 'fix/5-x')
  const at = git(d, 'rev-parse', '--short', 'HEAD').stdout.trim()
  const ledger = path.join(d, '.work/devflow/i5/ledger.json')
  fs.mkdirSync(path.dirname(ledger), { recursive: true })
  fs.writeFileSync(ledger, JSON.stringify({ testsLocked: { at } }))
  assert.deepEqual(failures(d), [], 'nothing changed since the lock')
  fs.writeFileSync(path.join(d, 'tests/a.test.js'), 'changed\n')
  fs.writeFileSync(path.join(d, 'tests/b.test.js'), 'new\n')
  fs.writeFileSync(path.join(d, 'src.js'), 'code\n')
  assert.deepEqual(failures(d), [
    `FAIL tests: tests/a.test.js changed while tests are locked (since ${at})`,
    `FAIL tests: tests/b.test.js changed while tests are locked (since ${at})`])
  git(d, 'add', '-A')
  git(d, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'b')
  assert.equal(failures(d).length, 2, 'a commit does not hide the change')
  // A test renamed out of the globs is still reported, by its old name.
  git(d, 'mv', 'tests/a.test.js', 'lib.js')
  git(d, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'c')
  assert.ok(failures(d).includes(`FAIL tests: tests/a.test.js changed while tests are locked (since ${at})`))
  fs.writeFileSync(ledger, '{ broken')
  assert.ok(has(d, /^FAIL tests: the ledger of Issue #5 cannot be read/))
  fs.writeFileSync(ledger, JSON.stringify({}))
  assert.deepEqual(failures(d), [], 'unlocked')
  assert.ok(has(repo({ ...GOOD, '.devflow.json': '{ "tests": "tests/**" }\n' }), /^FAIL profile: tests is a list of path globs$/))
})

test('a private AGENTS.md is not required, and must not be tracked (#23)', () => {
  const { 'AGENTS.md': agents, ...rest } = GOOD
  const profile = '{ "integration": "pr-ci", "agentsMd": "private" }\n'
  assert.deepEqual(failures(repo({ ...rest, '.devflow.json': profile })), [])
  assert.ok(has(repo({ ...rest }), /^FAIL folders: missing AGENTS\.md$/), 'still required without the setting')
  assert.ok(has(repo({ ...GOOD, '.devflow.json': profile }), /^FAIL agents-md: .*private.*tracked/))
})

test('CRLF only in the working tree is a warning; CRLF git stores is a failure (#23)', () => {
  const d = repo()
  fs.writeFileSync(path.join(d, 'docs/specs/a.md'), GOOD['docs/specs/a.md'].replace(/\n/g, '\r\n'))
  assert.deepEqual(failures(d), [])
  assert.ok(has(d, /^WARN docs: docs\/specs\/a\.md: CRLF in the working tree only/))
  const stored = repo({ ...GOOD, '.gitattributes': '', 'docs/specs/c.md': '# c\r\n' })
  assert.ok(has(stored, /^FAIL docs: docs\/specs\/c\.md: CRLF line ending$/))
})

test('local paths: a file listed in allowLocalPaths may name system paths, never a user home (#23)', () => {
  const sys = ['C', '\\Program Files\\Tool'].join(':')
  const home = ['C', '\\Users\\someone\\x'].join(':')
  const code = { ...GOOD, 'src/a.go': `const p = "${sys}"\n` }
  assert.ok(has(repo(code), /^FAIL docs: src\/a\.go:1: local absolute path$/))
  const allowed = { ...code, '.devflow.json': '{ "integration": "pr-ci", "allowLocalPaths": ["src/*.go"] }\n' }
  assert.deepEqual(failures(repo(allowed)), [])
  assert.ok(has(repo({ ...allowed, 'src/a.go': `const p = "${home}"\n` }), /^FAIL docs: src\/a\.go:1: local absolute path$/))
  assert.ok(has(repo({ ...code, '.devflow.json': '{ "integration": "pr-ci", "allowLocalPaths": "src" }\n' }), /^FAIL profile: allowLocalPaths/))
})

test('contracts and decisions may live in other folders the profile names (#23)', () => {
  const { 'docs/specs/a.md': spec, 'docs/design/decisions/ADR-0001-b.md': adr, ...rest } = GOOD
  const moved = {
    ...rest,
    '.devflow.json': '{ "integration": "pr-ci", "specs": "docs/v2", "decisions": "docs/v2/decisions" }\n',
    'docs/v2/a.md': '# a\n',
    'docs/v2/decisions/ADR-0001-b.md': '# b\n',
  }
  assert.deepEqual(failures(repo(moved)), [])
  assert.ok(has(repo({ ...moved, '.devflow.json': '{ "specs": "../outside" }\n' }), /^FAIL profile: specs/))
  // The spec budget follows the folder the profile names.
  assert.ok(has(repo({ ...moved, 'docs/v2/big.md': '가'.repeat(5200) + '\n' }), /^FAIL docs: docs\/v2\/big\.md: ~\d+ tokens, budget 5000$/))
  // false: the project keeps no devflow-style contract or decision folder, so neither is required nor budgeted.
  const none = { ...rest, '.devflow.json': '{ "integration": "pr-ci", "specs": false, "decisions": false }\n', 'docs/v2/big.md': '가'.repeat(5200) + '\n' }
  assert.deepEqual(failures(repo(none)), [])
})

test('#23 review: folder values are normalised, instruction files take no exception, user homes stay caught', () => {
  const { 'docs/specs/a.md': spec, 'docs/design/decisions/ADR-0001-b.md': adr, ...rest } = GOOD
  const big = '가'.repeat(5200) + '\n'
  // A trailing slash still names the folder, and its budget still applies.
  const slash = { ...GOOD, '.devflow.json': '{ "specs": "docs/specs/" }\n', 'docs/specs/big.md': big }
  assert.ok(has(repo(slash), /^FAIL docs: docs\/specs\/big\.md: ~\d+ tokens, budget 5000$/))
  for (const v of ['"./docs/specs"', '"docs\\\\specs"', '"."']) {
    assert.ok(has(repo({ ...rest, '.devflow.json': `{ "specs": ${v} }\n` }), /^FAIL profile: specs/), v)
  }
  assert.ok(has(repo({ ...GOOD, '.devflow.json': '{ "specs": "AGENTS.md" }\n' }), /^FAIL folders: missing AGENTS\.md \(not a folder\)|^FAIL folders: .*AGENTS\.md/))
  // allowLocalPaths does not reach instruction files.
  const sys = ['C', '\\Program Files\\Tool'].join(':')
  const agents = { ...GOOD, 'AGENTS.md': GOOD['AGENTS.md'] + `- tool: ${sys}\n`, '.devflow.json': '{ "allowLocalPaths": ["**"] }\n' }
  assert.ok(has(repo(agents), /^FAIL docs: AGENTS\.md:\d+: local absolute path$/))
  // User homes without a trailing slash, and WSL forms, are caught in a listed file.
  const listed = '{ "allowLocalPaths": ["src/*"] }\n'
  const sl = (...parts) => parts.join('/')
  for (const p of [sl('', 'home', 'alice', ''), 'HOME=' + sl('', 'Users', 'alice', 'x'), sl('', 'mnt', 'c', 'Users', 'alice'),
    sl('', '', 'wsl.localhost', 'Ubuntu', 'home', 'alice'), ['\\\\wsl$', 'Ubuntu', 'home', 'alice'].join('\\')]) {
    assert.ok(has(repo({ ...GOOD, '.devflow.json': listed, 'src/a.txt': `p = ${p}\n` }), /^FAIL docs: src\/a\.txt:1: local absolute path$/), p)
  }
})

test('#23 re-review: budget case, agent folders, and user homes in unlisted files', () => {
  const big = '가'.repeat(5200) + '\n'
  if (process.platform === 'win32' || process.platform === 'darwin') {
    const caseOff = { ...GOOD, '.devflow.json': '{ "specs": "Docs/Specs" }\n', 'docs/specs/big.md': big }
    assert.ok(has(repo(caseOff), /^FAIL docs: docs\/specs\/big\.md: ~\d+ tokens, budget 5000$/), 'a case-folded folder keeps its budget')
  }
  const sys = ['C', '\\Program Files\\Tool'].join(':')
  for (const f of ['.claude/agents/x.md', '.codex/agents/x.toml', 'plugin/agents/y.md', 'agents/review/z.md', '.claude/rules/r.md', 'AGENTS.override.md']) {
    const d = repo({ ...GOOD, '.devflow.json': '{ "allowLocalPaths": ["**"] }\n', [f]: `p = ${sys}\n` })
    assert.ok(has(d, new RegExp(`^FAIL docs: ${f.replace(/\./g, '\\.')}:1: local absolute path$`)), f)
  }
  const bs = '\\'
  const sl = (...parts) => parts.join('/')
  for (const p of [sl('', 'home', 'alice', ''), sl('', 'mnt', 'c', 'Users', 'alice'), sl('', '', 'wsl$', 'Ubuntu', 'home', 'alice'), [bs + bs + 'wsl.localhost', 'Ubuntu', 'home', 'alice'].join(bs)]) {
    assert.ok(has(repo({ ...GOOD, 'docs/b.md': `p = ${p}\n` }), /^FAIL docs: docs\/b\.md:1: local absolute path$/), p)
  }
})

test('#23 re-review: web routes are not user homes', () => {
  // A route names no user; LOCAL_PATH never caught these, and allowLocalPaths could not have turned them off.
  const routes = 'GET `/users/{id}` and `router.get(\'/users/:id\')` and `fetch("/home/feed")`\n'
  assert.deepEqual(failures(repo({ ...GOOD, 'docs/api.md': routes })), [])
  assert.deepEqual(failures(repo({ ...GOOD, '.devflow.json': '{ "allowLocalPaths": ["docs/*"] }\n', 'docs/api.md': routes })), [])
  // Nor is a folder named home or Users in the middle of a relative path.
  const rel = "import Nav from './pages/home/components/Nav'\nimport Row from './components/Users/List/Row'\n"
  assert.deepEqual(failures(repo({ ...GOOD, 'src/a.ts': rel })), [])
  assert.deepEqual(failures(repo({ ...GOOD, '.devflow.json': '{ "allowLocalPaths": ["src/*"] }\n', 'src/a.ts': rel })), [])
})

test('#23 review: working-tree CRLF is only a warning when git will store LF, and a tracked Agents.md is caught', () => {
  // No normalising attribute and core.autocrlf=false: the CRLF edit would be committed as is.
  const d = repo({ ...GOOD, '.gitattributes': '*.png binary\n' })
  git(d, 'config', 'core.autocrlf', 'false')
  fs.writeFileSync(path.join(d, 'docs/specs/a.md'), GOOD['docs/specs/a.md'].replace(/\n/g, '\r\n'))
  assert.ok(has(d, /^FAIL docs: docs\/specs\/a\.md: CRLF line ending$/))
  const { 'AGENTS.md': agents, ...rest } = GOOD
  const e = repo({ ...rest, 'Agents.md': agents, '.devflow.json': '{ "agentsMd": "private" }\n' })
  assert.ok(has(e, /^FAIL agents-md: .*private.*tracked/))
})

test('a repository that follows the standard is ok', () => {
  const lines = findings(repo())
  assert.deepEqual(lines.filter(l => /^(FAIL|WARN)/.test(l)), [])
})

test('folders and the profile', () => {
  const { 'docs/specs/a.md': spec, ...rest } = GOOD
  const d = repo({ ...rest, '.devflow.json': '{ nope' })
  assert.ok(has(d, /^FAIL folders: missing docs\/specs$/))
  assert.ok(has(d, /^FAIL profile: \.devflow\.json does not parse/))
})

test('the .gitignore block and tracked private paths', () => {
  const d = repo({ ...GOOD, '.gitignore': 'node_modules/\n' })
  assert.ok(has(d, /^FAIL gitignore: no "# >>> devflow \(managed\)"/))
  const e = repo()
  fs.mkdirSync(path.join(e, 'docs/plans'), { recursive: true })
  fs.writeFileSync(path.join(e, 'docs/plans/x.md'), 'x\n')
  git(e, 'add', '-f', 'docs/plans/x.md')
  assert.ok(has(e, /^FAIL gitignore: private paths are tracked: docs\/plans\/x\.md$/))
})

test('.gitattributes lines and files stored with CRLF', () => {
  const { '.gitattributes': attributes, ...rest } = GOOD
  const d = repo({ ...rest, 'notes.txt': 'a\r\nb\r\n' })
  fs.writeFileSync(path.join(d, '.gitattributes'), '* text=auto eol=lf\n')
  assert.ok(has(d, /^FAIL gitattributes: lacks \*\.cmd text eol=crlf/))
  assert.ok(has(d, /^FAIL gitattributes: notes\.txt is stored with CRLF$/))
  assert.ok(has(d, /^FAIL docs: notes\.txt: CRLF line ending$/))
})

test('AGENTS.md sections and style', () => {
  const d = repo({ ...GOOD, 'AGENTS.md': '# demo\n\n## Commands\nYou MUST read these files first.\nStatus 2026-10-01: in progress.\n' })
  assert.ok(has(d, /^FAIL agents-md: no "## Boundaries" section$/))
  assert.ok(has(d, /^WARN agents-md: emphasis words \(MUST\)/))
  assert.ok(has(d, /^WARN agents-md: a fixed always-read list/))
  assert.ok(has(d, /^WARN agents-md: a date or progress note/))
})

test('local-merge repositories need the pre-push gate', () => {
  const d = repo({ ...GOOD, '.devflow.json': '{ "integration": "local-merge" }\n' })
  assert.ok(has(d, /^FAIL git-hooks: core\.hooksPath is not \.githooks$/))
  assert.ok(has(d, /^FAIL git-hooks: no \.githooks\/pre-push$/))
})

test('a CLAUDE.local.md makes Claude Code skip AGENTS.md even when git ignores it', () => {
  const d = repo()
  fs.writeFileSync(path.join(d, 'CLAUDE.local.md'), 'local notes\n')
  assert.ok(doctor(d).lines.some(l => /^FAIL instructions: .*CLAUDE\.local\.md makes Claude Code skip AGENTS\.md$/.test(l)))
})

test('document rules: links, anchors, hidden characters, local paths', () => {
  const hidden = String.fromCodePoint(0x200b)
  const drive = ['C:', 'Users', 'me', 'x'].join(String.fromCharCode(92))
  const d = repo({ ...GOOD, 'docs/specs/a.md': `# a\n\n[gone](missing.md) [no anchor](../design/decisions/ADR-0001-b.md#nope)\nzero${hidden}width\nsee ${drive}\n` })
  assert.ok(has(d, /^FAIL docs: docs\/specs\/a\.md: missing link target missing\.md$/))
  assert.ok(has(d, /^FAIL docs: docs\/specs\/a\.md: missing anchor .*#nope$/))
  assert.ok(has(d, /^FAIL docs: docs\/specs\/a\.md:4: invisible character$/))
  assert.ok(has(d, /^FAIL docs: docs\/specs\/a\.md:5: local absolute path$/))
})

test('private working documents follow the naming the card looks for', () => {
  const d = repo()
  fs.mkdirSync(path.join(d, 'docs/plans'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs/plans/2026-10-01-i3-thing-plan.md'), 'x\n')
  fs.writeFileSync(path.join(d, 'docs/plans/notes.md'), 'x\n')
  const lines = findings(d)
  assert.ok(lines.some(l => /^WARN local-docs: docs\/plans\/notes\.md/.test(l)))
  assert.ok(!lines.some(l => /i3-thing-plan/.test(l)))
  assert.match(lines.at(-1), /^ok \(1 warnings\)$/)
})

test('a folder outside git is reported, not crashed on', () => {
  const d = tmpdir('devflow-doctor-nogit-')
  assert.match(doctor(d).lines[0], /^FAIL repository: .* is not a git work tree$/)
})

test('document rules skip private paths and binary files, and cap repeats per file', () => {
  const drive = ['C:', 'Users', 'me', 'x'].join(String.fromCharCode(92))
  const d = repo({ ...GOOD, '.gitignore': 'node_modules/\n', 'artifacts/run.log': `${drive}\n`,
    'blob.bin': Buffer.from([0, 1, 2, 0x20, 0x0d, 0x0a, 0xe2, 0x80, 0x8b]),
    'docs/many.md': Array.from({ length: 5 }, () => `see ${drive}`).join('\n') + '\n' })
  const lines = findings(d)
  assert.ok(!lines.some(l => l.startsWith('FAIL docs: artifacts/run.log')), 'document rules skip private paths')
  assert.ok(lines.some(l => /^FAIL gitignore: private paths are tracked: .*artifacts\/run\.log/.test(l)), 'the .gitignore check reports it')
  assert.ok(!lines.some(l => l.startsWith('FAIL docs: blob.bin')), 'binary content is not text')
  assert.ok(lines.includes('WARN gitattributes: blob.bin is binary but not marked binary'))
  assert.equal(lines.filter(l => /^FAIL docs: docs\/many\.md:\d+: local absolute path$/.test(l)).length, 3)
  assert.ok(lines.includes('FAIL docs: docs/many.md: local absolute path on 2 more lines'))
})

test('the 2026-10-01 review: names, text detection, anchors, gitlinks, profile, prompts, only', () => {
  const drive = ['C:', 'Users', 'me', 'x'].join(String.fromCharCode(92))
  const d = repo({ ...GOOD, '.devflow.json': '{ "integration": "pr" }\n', 'docs/한글.md': `see ${drive}\n`,
    'docs/lone.md': `a\rb\nsee ${drive}\n`, 'docs/bad.md': '[x](../AGENTS.md#100%)\n' })
  const nested = path.join(d, 'vendor', 'lib')
  fs.mkdirSync(nested, { recursive: true })
  spawnSync('git', ['-C', nested, 'init', '-q'])
  fs.writeFileSync(path.join(nested, 'f.txt'), 'x\n')
  spawnSync('git', ['-C', nested, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'add', '.'])
  spawnSync('git', ['-C', nested, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'x'])
  git(d, 'add', 'vendor/lib')
  fs.mkdirSync(path.join(d, 'docs/prompts'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs/prompts/2026-10-01-i1-long-prompt.md'), 'word '.repeat(600))
  const lines = findings(d)
  assert.ok(lines.includes('FAIL docs: docs/한글.md:1: local absolute path'), 'non-ASCII names are checked')
  assert.ok(lines.includes('FAIL docs: docs/lone.md:2: local absolute path'), 'a lone CR does not make text binary')
  assert.ok(lines.includes('FAIL docs: docs/bad.md: malformed anchor ../AGENTS.md#100%'))
  assert.ok(lines.some(l => /^FAIL profile: integration is "pr"/.test(l)))
  assert.ok(lines.some(l => /^WARN local-docs: docs\/prompts\/2026-10-01-i1-long-prompt\.md: ~\d+ tokens, prompt budget 500$/.test(l)))
  const only = doctor(d, { only: ['docs/한글.md'] }).lines
  assert.ok(only.includes('FAIL docs: docs/한글.md:1: local absolute path'))
  assert.ok(!only.some(l => /docs\/lone\.md|gitignore|folders/.test(l)), 'only checks what it is given')
})

test('files .gitattributes keeps as CRLF are not CRLF findings', () => {
  const d = repo({ ...GOOD, 'run.cmd': 'echo a\r\necho b\r\n', 'notes.md': 'a\r\n' })
  const lines = findings(d)
  assert.ok(!lines.some(l => l.includes('run.cmd')), 'eol=crlf files are meant to be CRLF')
  // eol=lf stores notes.md with LF; the CRLF left in the working tree is a warning since #23.
  assert.ok(lines.some(l => l.startsWith('WARN docs: notes.md: CRLF in the working tree only')))
})
