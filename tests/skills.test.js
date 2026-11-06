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
const refNames = () => fs.readdirSync(path.join(root, REFS), { recursive: true })
  .map(f => f.replace(/\\/g, '/')).filter(f => f.endsWith('.md'))
const skillFiles = () => [`${SKILL}/SKILL.md`, ...refNames().map(n => `${REFS}/${n}`)]
const lines = text => text.split('\n')
// Markdown link targets: the part inside (...) of [text](...), without title text.
const linkTargets = text => [...text.matchAll(/\]\(([^)\s]+)[^)]*\)/g)].map(m => m[1])
const refLinks = text => linkTargets(text).filter(t => /(^|\/)references\//.test(t)).map(t => t.split('#')[0])
const descriptionOf = text => text.split('---')[1].match(/^description: (.*)$/m)[1]
const bytes = text => Buffer.byteLength(text, 'utf8')
// Sentence ends are ". " and a final ".".
const sentenceCount = d => (d.match(/\. /g) || []).length + (d.endsWith('.') ? 1 : 0)
// An unquoted ": " breaks a YAML plain scalar; backtick spans are not scanned and a quoted value is a different scalar.
const plainColon = d => !/^["']/.test(d) && /: /.test(d.replace(/`[^`]*`/g, ''))
const exitFirst = text => {
  const ls = lines(text)
  const i = ls.findIndex(l => l.startsWith('# '))
  const next = ls.slice(i + 1).find(l => l.trim() !== '')
  return i >= 0 && next !== undefined && /^(Done when|\*\*Exit:\*\*|## (?:Resume )?[Ee]xit)/.test(next)
}
const contentsOk = text => {
  const ls = lines(text)
  return ls.length <= 100 || ls.slice(0, 12).some(l => l.startsWith('Contents'))
}
const isReferenceOrAgentsLink = t => !/^(?:[a-z][a-z+.-]+:|#)/i.test(t) &&
  (/\.md(#|$)/.test(t) || /(^|\/)references\//.test(t) || /(^|\/)agents\//.test(t))

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
  assert.ok(['other.md', 'roles/reviewer.md', '../contracts.md', 'references/x.md', '../agents/a.yaml', 'b.md#c'].every(isReferenceOrAgentsLink), 'counterexample')
  assert.ok(!['#anchor', 'https://example.com/a.md'].some(isReferenceOrAgentsLink), 'allowed targets')
})

// The skill works from its own folder (#138): every local link resolves inside skills/devflow, and no sentence cites a
// plugin spec by file name. The user's own docs/design/current-decisions.md is a project path, not a plugin file. The
// card's bin/devflow-state is a runtime part named in prose, not a link. Role text lives in the skill's roles reference
// (#157), and the plugin ships no agent definitions (#159).
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

test('devflow: procedures state their exit first and long references expose Contents', () => {
  const procedures = new Set(['start.md', 'discover.md', 'design.md', 'plan.md', 'build.md', 'verify.md',
    'review.md', 'ship.md', 'cleanup.md', 'learn.md', 'sessions.md', 'delegation.md'])
  for (const n of refNames()) {
    const text = read(`${REFS}/${n}`)
    if (procedures.has(n)) assert.ok(exitFirst(text), `${n}: put the exit condition before the procedure`)
    assert.ok(contentsOk(text), `${n}: over 100 lines needs a "Contents" line within the first 12`)
  }
  assert.ok(!exitFirst('# T\n\nIntro\n'), 'counterexample: no exit condition')
  assert.ok(exitFirst('# T\n\n**Exit:** observed acceptance\n'))
  assert.ok(!contentsOk('# T\n' + 'x\n'.repeat(120)), 'counterexample: no Contents')
})

test('size budgets: core at most 8,192 bytes and under 500 lines; references/specs under 20,000 bytes', () => {
  assert.ok(lines(read(`${SKILL}/SKILL.md`)).length < 500, 'SKILL.md has 500 lines or more')
  assert.ok(bytes(read(`${SKILL}/SKILL.md`)) <= 8192, 'SKILL.md exceeds the 8,192-byte core budget')
  for (const rel of [...skillFiles(), ...files('docs/specs')])
    assert.ok(bytes(read(rel)) < 20000, `${rel} is 20,000 UTF-8 bytes or more`)
  assert.equal(bytes('x'.repeat(20000)), 20000, 'counterexample')
  assert.equal(bytes('한'), 3, 'count encoded bytes, not JavaScript string length or estimated tokens')
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

// A quoted label: Korean words, optionally ending in an ASCII part after a slash (`브랜치/PR`).
const LABEL = /[가-힣][가-힣/ ]*(?:[가-힣]|\/[A-Za-z]+):|[가-힣]:/g

// The headings and labels devflow-state parses (#150): the interface the skill must keep, checked against the parsers
// themselves. Other template labels are the skill's to use or not, but any it quotes must be one issues.md defines.
const { PARSERS } = require(path.join(root, 'bin/devflow-state'))
const PARSED = [['## 현재 상태', PARSERS.STATE_HEADING, '## 현재 상태'], ['- 단계:', PARSERS.PROTECTED, '- 단계: build'],
  ['- 브랜치/PR:', PARSERS.BRANCH_LINE, '- 브랜치/PR: feat/1-x'], ['- 다음 행동:', PARSERS.PROTECTED, '- 다음 행동: x'],
  ['- 막힘:', PARSERS.PROTECTED, '- 막힘: 없음'], ['### Checkpoint', PARSERS.CHECKPOINT_HEAD, '### Checkpoint build — x']]

test('issues spec: helper templates retain parsed labels and the skill quotes only defined ones', () => {
  for (const [l, re, sample] of PARSED) assert.match(sample, re, `devflow-state no longer parses "${l}"; update PARSED`)
  assert.doesNotMatch('- 상태: x', PARSERS.PROTECTED, 'counterexample')
  const issues = read('docs/specs/issues.md')
  const template = ['단계', '브랜치/PR', '완료', '다음 행동', '막힘', '최신 체크포인트', '변경', '검증', '결정', '다음']
  for (const l of template) assert.ok(issues.includes(`- ${l}:`), `issues.md lacks "- ${l}:"`)
  assert.ok(issues.includes('남음:'), 'issues.md lacks 남음:')
  const allowed = new Set([...template, '남음'])
  // Exact templates belong to the helper/spec. The router need not repeat them on every invocation.
  const usage = spawnSync('node', [path.join(root, 'bin/devflow-state'), 'help', 'legacy'], { encoding: 'utf8', env: { PATH: process.env.PATH } })
  for (const [l] of PARSED) assert.ok((usage.stdout + usage.stderr).includes(l), `helper usage lacks parsed label "${l}"`)
  const quoted = skillFiles().flatMap(rel =>
    [...read(rel).matchAll(LABEL)].map(m => [rel, m[0].slice(0, -1)]))
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
  // A command starts a usage line or a compact pipe-delimited alternative; prose is not a command.
  const inUsage = c => new RegExp(`(^ {2}|\\|\\s*)${c.replace(/ /g, '\\s+')}([^\\w-]|$)`, 'm').test(usage)
  const named = new Map()
  for (const rel of skillFiles())
    for (const [, span] of read(rel).matchAll(/`([^`\n]+)`/g)) {
      const m = span.match(/^devflow-state ([a-z][a-z-]*(?: (?:add|list))?)/) ||
        span.match(/^([a-z][a-z-]*(?: (?:add|list))?) <(?:n|issue|parent)>/)
      if (m) named.set(m[1], rel)
    }
  // The tools rely on these two: the Stop hook waits while `running` lists work, and only `mode` makes a run unattended.
  for (const c of ['running', 'mode'])
    assert.ok(named.has(c), `expected the skill text to name ${c} with an Issue argument or devflow-state`)
  const spans = skillFiles().flatMap(rel => [...read(rel).matchAll(/`([^`\n]+)`/g)].map(m => m[1]))
  assert.ok(spans.some(x => /^running <(?:n|issue)> add\b/.test(x)), 'the skill must say to record background work with running <issue> add')
  // #150: the requested template help retains exact labels without repeating the whole template in routine usage.
  const templates = spawnSync('node', [path.join(root, 'bin/devflow-state'), 'help', 'legacy'],
    { encoding: 'utf8', env: { PATH: process.env.PATH } })
  for (const l of ['- 단계:', '- 브랜치/PR:', '- 완료:', '- 다음 행동:', '- 막힘:', '- 최신 체크포인트:', '- 변경:', '- 검증:', '- 결정:', '- 다음:'])
    assert.ok((templates.stdout + templates.stderr).includes(l), `template help lacks ${l}`)
  for (const [c, rel] of named) assert.ok(inUsage(c), `${rel} names "${c}", which the usage text lacks`)
  assert.ok(!inUsage('frobnicate'), 'counterexample')
  assert.ok(!inUsage('never'), 'a prose word is not a command')
})

// SKILL.md routes directly to each role and host adapter. Result vocabularies belong to the role, host arguments to
// the adapter; neither needs to be copied into every delegation paragraph.
const tableRows = (texts, header) => {
  for (const text of texts) {
    const ls = lines(text)
    const start = ls.findIndex(l => l.startsWith(header))
    if (start < 0) continue
    const end = ls.findIndex((l, j) => j > start && !l.startsWith('|'))
    return ls.slice(start + 2, end < 0 ? undefined : end).map(l => l.split('|').slice(1, -1).map(c => c.trim()))
  }
  return []
}
test('roles: separate files retain lifecycle and role-specific result vocabularies', () => {
  const vocabularies = {
    explorer: ['FOUND', 'PARTIAL', 'NOT_FOUND', 'ALL_PASSED', 'FAILURES', 'INCOMPLETE',
      'CAUSE_FOUND', 'LIKELY_CAUSE', 'ALL_VERIFIED', 'VERIFIED', 'FAILED', 'NOT_RUN'],
    reviewer: ['FINDINGS', 'NO_FINDINGS'],
    implementer: ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_DECISION', 'BLOCKED'],
  }
  for (const [role, words] of Object.entries(vocabularies)) {
    const text = read(`${REFS}/role-${role}.md`)
    assert.match(text, /lifecycle/i, `${role}: report lifecycle separately`)
    assert.match(text, /verdict/i, `${role}: identify the role's result`)
    for (const word of words) assert.match(text, new RegExp(`\\b${word}\\b`), `${role}: missing ${word}`)
    assert.ok(refLinks(read(`${SKILL}/SKILL.md`)).includes(`references/role-${role}.md`), `${role}: no direct route`)
  }
  assert.doesNotMatch(read(`${REFS}/delegation.md`), /(?:End with|Verdict is) DONE[, ]/, 'common brief must not impose implementer verdicts on other roles')
})

test('fresh-context delegation has a router rule, selected Codex mapping and spec contract', () => {
  assert.match(read(`${SKILL}/SKILL.md`), /fresh/i)
  assert.match(read(`${REFS}/host-codex.md`), /`fork_turns: "none"`/)
  assert.match(read('docs/specs/orchestration.md'), /fresh/i)
  assert.ok(refLinks(read(`${SKILL}/SKILL.md`)).includes('references/host-codex.md'))
})

test('router table preserves M0 through M3 as distinct execution modes', () => {
  const texts = skillFiles().map(read)
  const modes = tableRows(texts, '| Mode |').map(r => r[0].replace(/\*/g, '').split(' ')[0])
  assert.deepEqual(modes, ['M0', 'M1', 'M2', 'M3'])
  assert.deepEqual(tableRows(['x\n| Mode | When |\n|---|---|\n| M7 | y |\n'], '| Mode |'), [['M7', 'y']], 'a table is found by its header')
})
