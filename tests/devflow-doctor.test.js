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
  assert.ok(lines.includes('FAIL docs: notes.md: CRLF line ending'))
})
