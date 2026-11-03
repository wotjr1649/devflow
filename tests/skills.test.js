'use strict'
// Independent skills ship with the plugin but stay outside the lifecycle (docs/design/current-decisions.md, Independent skills):
// the lifecycle never names them and they never mention devflow, so either side can change without the other (#124).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const INDEPENDENT = ['agent-instruction-design', 'audit-prompts', 'decision-interview', 'write-prompts']
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8')
const files = dir => fs.readdirSync(path.join(root, dir), { recursive: true })
  .map(f => path.join(dir, f)).filter(f => f.endsWith('.md'))

test('every skill names itself after its folder', () => {
  for (const name of fs.readdirSync(path.join(root, 'skills'))) {
    const front = read(`skills/${name}/SKILL.md`).split('---')[1]
    assert.match(front, new RegExp(`^name: ${name}$`, 'm'), name)
    assert.match(front, /^description: \S/m, name)
  }
})

test('independent skills ship as SKILL.md and agents/openai.yaml without mentioning devflow', () => {
  for (const name of INDEPENDENT) {
    const entries = fs.readdirSync(path.join(root, 'skills', name), { recursive: true }).map(f => f.replace(/\\/g, '/'))
    assert.deepEqual(entries.sort(), ['SKILL.md', 'agents', 'agents/openai.yaml'], name)
    for (const rel of [`skills/${name}/SKILL.md`, `skills/${name}/agents/openai.yaml`])
      assert.doesNotMatch(read(rel), /devflow|\.devflow\.json|\.\.\//i, rel)
  }
})

test('the lifecycle references and specs do not name the independent skills', () => {
  const lifecycle = [...files('docs/specs'), ...files('skills/devflow')]
  for (const rel of lifecycle)
    for (const name of INDEPENDENT) assert.ok(!read(rel).includes(name), `${rel} names ${name}`)
})

// Structure rules of docs/specs/documents.md (Skill descriptions, Skill references, Size budgets) and the values
// shared between the specs and the devflow skill. Each test ends with a counterexample the check must reject.
const SKILL = 'skills/devflow'
const REFS = `${SKILL}/references`
const refNames = () => fs.readdirSync(path.join(root, REFS)).filter(f => f.endsWith('.md'))
const skillFiles = () => [`${SKILL}/SKILL.md`, ...refNames().map(n => `${REFS}/${n}`)]
const lines = text => text.split('\n')
// Markdown link targets: the part inside (...) of [text](...), without title text.
const linkTargets = text => [...text.matchAll(/\]\(([^)\s]+)[^)]*\)/g)].map(m => m[1])
const refLinks = text => linkTargets(text).filter(t => /(^|\/)references\//.test(t)).map(t => t.split('#')[0])
const descriptionOf = text => text.split('---')[1].match(/^description: (.*)$/m)[1]
const tokens = text => text.length / 4
// Sentence ends are ". " and a final ".".
const sentenceCount = d => (d.match(/\. /g) || []).length + (d.endsWith('.') ? 1 : 0)
// An unquoted ": " breaks a YAML plain scalar; backtick spans are not scanned and a quoted value is a different scalar.
const plainColon = d => !/^["']/.test(d) && /: /.test(d.replace(/`[^`]*`/g, ''))
const doneWhenOk = text => {
  const ls = lines(text)
  const i = ls.findIndex(l => l.startsWith('# '))
  const next = ls.slice(i + 1).find(l => l.trim() !== '')
  return i >= 0 && next !== undefined && next.startsWith('Done when')
}
const contentsOk = text => {
  const ls = lines(text)
  return ls.length <= 100 || ls.slice(0, 12).some(l => l.startsWith('Contents'))
}
const isReferenceOrAgentsLink = t => /^(\.\/)?[\w-]+\.md(#|$)/.test(t) || /(^|\/)references\//.test(t) || /(^|\/)agents\//.test(t)

test('devflow: SKILL.md links every reference, every link names a file, and only references/ sits beside SKILL.md', () => {
  const names = refNames()
  const linked = refLinks(read(`${SKILL}/SKILL.md`))
  const missing = ls => ls.filter(l => !names.includes(l.replace(/^.*references\//, '')))
  for (const n of names) assert.ok(linked.includes(`references/${n}`), `SKILL.md does not link references/${n}`)
  assert.deepEqual(missing(linked), [], 'SKILL.md links a reference that does not exist')
  assert.deepEqual(fs.readdirSync(path.join(root, SKILL)).sort(), ['SKILL.md', 'references'])
  assert.deepEqual(missing(['references/gone.md']), ['references/gone.md'], 'counterexample')
})

test('devflow: a reference links no other reference and no agents/ file', () => {
  for (const n of refNames())
    assert.deepEqual(linkTargets(read(`${REFS}/${n}`)).filter(isReferenceOrAgentsLink), [], `${n} links a reference or agents/`)
  assert.ok(['other.md', 'references/x.md', '../agents/a.yaml', 'b.md#c'].every(isReferenceOrAgentsLink), 'counterexample')
  assert.ok(!['#anchor', 'https://example.com/a.md'].some(isReferenceOrAgentsLink), 'allowed targets')
})

// The skill works from its own folder (#138): every local link resolves inside skills/devflow, and no sentence cites a
// plugin spec by file name. The user's own docs/design/current-decisions.md is a project path, not a plugin file. The
// card's bin/devflow-state and the agents/*.md bodies Codex briefs carry are runtime parts named in prose, not links.
const SPEC_NAME = /\b(lifecycle|orchestration|ledger|issues|repository|documents|eval|hooks|credentials|host-facts|sources|overview)\.md\b/
const localTargets = text => [
  ...[...text.matchAll(/\]\(\s*<([^>]*)>/g)].map(m => m[1]),
  ...linkTargets(text).filter(t => !t.startsWith('<')),
  ...[...text.matchAll(/^\s*\[[^\]]+\]:\s*<?([^\s>]+)/gm)].map(m => m[1]),
// A URL scheme has two or more letters; a drive letter (C:) or file: is a local path and is checked.
].filter(t => !(/^[a-z][a-z+.-]+:/i.test(t) && !/^file:/i.test(t)) && !t.startsWith('#'))
const escapes = (rel, target) => {
  let t
  try { t = decodeURIComponent(target.split('#')[0]) } catch { return true }
  if (t.includes('\\')) return true
  const abs = path.resolve(path.dirname(path.join(root, rel)), t)
  return !abs.startsWith(path.join(root, SKILL) + path.sep) || !fs.existsSync(abs)
}

test('devflow: every local link stays inside skills/devflow and no text cites a plugin spec by name', () => {
  for (const rel of skillFiles()) {
    const text = read(rel)
    for (const t of localTargets(text)) assert.ok(!escapes(rel, t), `${rel} links ${t} outside the skill or to nothing`)
    assert.doesNotMatch(text, SPEC_NAME, `${rel} cites a plugin spec`)
  }
  const from = `${SKILL}/SKILL.md`
  const bad = ['../../docs/specs/lifecycle.md', 'references\\start.md', 'references/gone.md', '%2E%2E/%2E%2E/README.md',
    'C:\\repo\\agents\\reviewer.md', 'C:/repo/agents/reviewer.md', 'file:///repo/agents/reviewer.md']
  assert.deepEqual(localTargets('[w](C:/x.md) [f](file:///x.md) [u](https://e.org)'), ['C:/x.md', 'file:///x.md'])
  for (const t of bad) assert.ok(escapes(from, t), `counterexample: ${t}`)
  assert.deepEqual(localTargets('[a](<../x.md>) [c](https://e.org/z.md) [d](#e)\n[b]: ../y.md'), ['../x.md', '../y.md'])
  assert.ok(!escapes(from, 'references/start.md#checklist'), 'a reference with an anchor is inside')
  assert.match('see lifecycle.md', SPEC_NAME, 'counterexample: prose citation')
  assert.doesNotMatch("the project's docs/design/current-decisions.md", SPEC_NAME, 'a project path is allowed')
})

test('devflow: a reference opens with "Done when" and a long one has Contents in its first 12 lines', () => {
  for (const n of refNames()) {
    const text = read(`${REFS}/${n}`)
    assert.ok(doneWhenOk(text), `${n}: the first line after the title must start with "Done when"`)
    assert.ok(contentsOk(text), `${n}: over 100 lines needs a "Contents" line within the first 12`)
  }
  assert.ok(!doneWhenOk('# T\n\nIntro\n'), 'counterexample: no Done when')
  assert.ok(!contentsOk('# T\n' + 'x\n'.repeat(120)), 'counterexample: no Contents')
})

test('size budgets: SKILL.md under 500 lines; SKILL.md, references and specs under 5,000 tokens (characters / 4)', () => {
  assert.ok(lines(read(`${SKILL}/SKILL.md`)).length < 500, 'SKILL.md has 500 lines or more')
  for (const rel of [...skillFiles(), ...files('docs/specs')])
    assert.ok(tokens(read(rel)) < 5000, `${rel} is over 5,000 tokens (characters / 4)`)
  assert.ok(tokens('x'.repeat(20000)) >= 5000, 'counterexample')
})

test('skill descriptions: devflow has at most two sentences and names no independent skill; no plain scalar has ": "', () => {
  const d = descriptionOf(read(`${SKILL}/SKILL.md`))
  assert.ok(sentenceCount(d) <= 2, `devflow description has ${sentenceCount(d)} sentences`)
  for (const name of INDEPENDENT) assert.ok(!d.includes(name), `devflow description names ${name}`)
  for (const name of fs.readdirSync(path.join(root, 'skills')))
    assert.ok(!plainColon(descriptionOf(read(`skills/${name}/SKILL.md`))), `${name}: unquoted ": " in description`)
  assert.equal(sentenceCount('A. B. C.'), 3, 'counterexample: sentences')
  assert.ok(plainColon('Does x: and y.'), 'counterexample: colon')
  assert.ok(!plainColon('Does `x: y` well.'), 'a colon inside backticks is fine')
})

test('devflow: the stage and session references are the expected eleven', () => {
  const expected = ['build', 'cleanup', 'design', 'discover', 'learn', 'plan', 'review', 'sessions', 'ship', 'start', 'verify']
  assert.deepEqual(refNames().map(n => n.replace(/\.md$/, '')).sort(), expected)
  assert.notDeepEqual(expected.slice(1), expected, 'counterexample: a missing reference')
})

// A quoted label: Korean words, optionally ending in an ASCII part after a slash (`브랜치/PR`).
const LABEL = /[가-힣][가-힣/ ]*(?:[가-힣]|\/[A-Za-z]+):|[가-힣]:/g

test('issues spec: the state-block and checkpoint labels are the ones the references quote', () => {
  const issues = read('docs/specs/issues.md')
  const template = ['단계', '브랜치/PR', '완료', '다음 행동', '막힘', '최신 체크포인트', '변경', '검증', '결정', '다음']
  for (const l of template) assert.ok(issues.includes(`- ${l}:`), `issues.md lacks "- ${l}:"`)
  assert.ok(issues.includes('남음:'), 'issues.md lacks 남음:')
  const allowed = new Set([...template, '남음'])
  const quoted = skillFiles().flatMap(rel =>
    [...read(rel).matchAll(LABEL)].map(m => [rel, m[0].slice(0, -1)]))
  assert.ok(quoted.length >= 5, 'expected the references to quote labels')
  const router = read(`${SKILL}/SKILL.md`)
  for (const l of template) assert.ok(router.includes(`- ${l}:`), `SKILL.md lacks "- ${l}:"`)
  for (const [rel, l] of quoted) assert.ok(allowed.has(l), `${rel} quotes "${l}:" which issues.md does not define`)
  assert.ok(!allowed.has('상태'), 'counterexample')
  const labelsIn = text => [...text.matchAll(LABEL)].map(m => m[0].slice(0, -1))
  assert.deepEqual(labelsIn('- 브랜치/PR: main'), ['브랜치/PR'], 'the branch label is matched whole')
  assert.ok(!allowed.has(labelsIn('- 브랜치/MR: main')[0]), 'counterexample: a wrong branch label')
})

test('devflow-state: every command a reference or SKILL.md names appears in the usage text', () => {
  const run = spawnSync('node', [path.join(root, 'bin/devflow-state')], { encoding: 'utf8', env: { PATH: process.env.PATH } })
  const usage = run.stdout + run.stderr
  assert.match(usage, /usage: devflow-state/, 'usage text not printed')
  // A command starts a usage line (two spaces) or follows "| "; prose such as "never read as state" does not count.
  const inUsage = c => new RegExp(`(^ {2}|\\| )${c.replace(/ /g, '\\s+')}([^\\w-]|$)`, 'm').test(usage)
  const named = new Map()
  for (const rel of skillFiles())
    for (const [, span] of read(rel).matchAll(/`([^`\n]+)`/g)) {
      const m = span.match(/^devflow-state ([a-z][a-z-]*(?: (?:add|list))?)/) ||
        span.match(/^([a-z][a-z-]*(?: (?:add|list))?) <(?:n|issue|parent)>/)
      if (m) named.set(m[1], rel)
    }
  for (const c of ['running', 'mode', 'release', 'read', 'intent', 'sub-issue add'])
    assert.ok(named.has(c), `expected the skill text to name ${c} with an Issue argument or devflow-state`)
  for (const [c, rel] of named) assert.ok(inUsage(c), `${rel} names "${c}", which the usage text lacks`)
  assert.ok(!inUsage('frobnicate'), 'counterexample')
  assert.ok(!inUsage('never'), 'a prose word is not a command')
})

// SKILL.md owns the mode and role tables (#138). A Claude cell names its agent and shows that agent's own model or
// effort in parentheses, which must match the agent definition's frontmatter.
const tableRows = (text, heading) => {
  const ls = lines(text)
  const i = ls.findIndex(l => l === heading)
  assert.ok(i >= 0, `missing heading ${heading}`)
  const start = ls.findIndex((l, j) => j > i && l.startsWith('|'))
  const end = ls.findIndex((l, j) => j > start && !l.startsWith('|'))
  return ls.slice(start + 2, end).map(l => l.split('|').slice(1, -1).map(c => c.trim()))
}
const ROLES = ['Exploration', 'Test and log summary', 'Failure root-cause analysis', 'Mechanical implementation',
  'Implementation needing judgment', 'Design alternatives, plan validation', 'Execution verification', 'Per-task review',
  'Final review', 'Security and high-risk review']

const frontmatter = name => {
  const block = read(`agents/${name}.md`).split('---')[1]
  return Object.fromEntries([...block.matchAll(/^(model|effort):\s*(\S+)$/gm)].map(m => [m[1], m[2]]))
}
const defaultsMismatch = cell => {
  const agent = (cell.match(/`(explorer|reviewer|implementer)`/) || [])[1]
  const shown = [...((cell.match(/\(([^)]*)\)\s*$/) || [])[1] || '').matchAll(/`([\w.-]+)`/g)].map(m => m[1])
  if (!agent || !shown.length) return `no agent or defaults in "${cell}"`
  const own = Object.values(frontmatter(agent))
  return shown.filter(v => !own.includes(v)).map(v => `${agent} default ${v}`).join(', ')
}

test("router tables: Roles lists the roles with their agents' defaults, Execution modes names M0 to M3", () => {
  const router = read(`${SKILL}/SKILL.md`)
  const roles = tableRows(router, '### Roles')
  assert.deepEqual(roles.map(r => r[0]), ROLES, 'the router lists the roles the references use')
  for (const row of roles) assert.equal(defaultsMismatch(row[1]), '', `router Roles row ${row[0]}`)
  const modes = rows => rows.map(r => (r[0].match(/^\**(M\d)\b/) || [, r[0]])[1])
  assert.deepEqual(modes(tableRows(router, '### Execution modes')), ['M0', 'M1', 'M2', 'M3'])
  assert.notEqual(defaultsMismatch('`explorer` + `model: haiku` (`low`)'), '', 'counterexample: a wrong default')
})
