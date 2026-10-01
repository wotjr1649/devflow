'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-doctor-'))
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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-doctor-nogit-'))
  assert.match(doctor(d).lines[0], /^FAIL repository: .* is not a git work tree$/)
})
