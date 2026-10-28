'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const ev = require('../bin/devflow-behavior-eval')
const { loadCases, treeHash, treeDiff, schedule, claudeAttribution, codexTrace, codexAttribution, classify, adopt, upperBound, claudeArgs, reserve, parseArgs, requiredPairs, checkCalibration, RULES } = ev
const tmpdir = require('./tmpdir')
const ROOT = path.resolve(__dirname, '..')
const CASES = path.join(ROOT, 'evals', 'behavior')
// Synthetic paths are assembled so the public-text check never sees a literal local path.
const C = ['C', ''].join(':')
const PROGRAMS = (process.env.ProgramFiles || [C, 'Program Files'].join('/')).replaceAll(String.fromCharCode(92), '/')
const SKILL = 'plugin/skills/pr-review-workflow/SKILL.md'

test('every behavior case has metadata, a task grader, a proposition and a fixture holding exactly its listed inputs', () => {
  const cases = loadCases()
  assert.ok(cases.length >= 8)
  const scaffold = fs.readFileSync(path.join(CASES, cases[0].id, 'scaffold.sh'), 'utf8')
  for (const c of cases) {
    const dir = path.join(CASES, c.id)
    assert.equal(fs.readFileSync(path.join(dir, 'scaffold.sh'), 'utf8'), scaffold, c.id + ' scaffold')
    assert.equal(fs.readFileSync(path.join(dir, 'case.yaml'), 'utf8'), `schema_version: "1.1"\nname: ${c.id}\ncontext:\n  scaffold_script: scaffold.sh\n`)
    if (!c.inputs.length) continue
    const files = Object.keys(treeHash(path.join(dir, 'fixture', 'project')).files).filter(f => !f.endsWith('/')).sort()
    assert.deepEqual(files, [...c.inputs].sort(), c.id + ' fixture differs from the prompt list')
  }
})

test('every fixture file is tracked with the bytes on disk, even where the fixture project ignores it', () => {
  const r = spawnSync('git', ['ls-files', '-s', '--', 'evals/behavior'], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(r.status, 0, 'git ls-files failed')
  const index = new Map(r.stdout.split('\n').filter(Boolean).map(l => { const [meta, file] = l.split('\t'); return [file, meta.split(' ')[1]] }))
  const disk = Object.keys(treeHash(CASES).files).filter(f => !f.endsWith('/')).map(f => 'evals/behavior/' + f)
  assert.ok(disk.length > 0)
  const blobs = spawnSync('git', ['hash-object', '--stdin-paths'], { cwd: ROOT, encoding: 'utf8', input: disk.join('\n') + '\n' })
  assert.equal(blobs.status, 0)
  blobs.stdout.trim().split('\n').forEach((blob, i) => assert.equal(index.get(disk[i]), blob, 'not tracked as on disk: ' + disk[i]))
})

test('the count counter-condition differs from its source case only by the request line', () => {
  const b4 = fs.readFileSync(path.join(CASES, 'b4-03b', 'prompt.md'), 'utf8').replace(/tags: \[[^\]]+\]/, '')
  const k1 = fs.readFileSync(path.join(CASES, 'k1-count', 'prompt.md'), 'utf8').replace(/tags: \[[^\]]+\]/, '')
  assert.equal(k1.replace('\nIn your report, state how many project inputs you read.', ''), b4)
  assert.equal(treeHash(path.join(CASES, 'k1-count', 'fixture')).hash, treeHash(path.join(CASES, 'b4-03b', 'fixture')).hash)
})

test('schedule interleaves arms ABBA and gives each arm 14 slots per case', () => {
  const slots = schedule([{ id: 'x1-a', host: 'claude' }])
  assert.equal(slots.length, 28)
  assert.equal(slots.slice(0, 8).map(s => s.arm).join(''), 'ABBAABBA')
  for (const arm of ['A', 'B']) assert.equal(new Set(slots.filter(s => s.arm === arm).map(s => s.slot)).size, 14)
})

test('tree hashes cover hidden files and empty folders and report changed paths; links are refused', () => {
  const a = tmpdir('bt-'), b = tmpdir('bt-')
  for (const d of [a, b]) { fs.mkdirSync(path.join(d, '.work'), { recursive: true }); fs.writeFileSync(path.join(d, '.work', 'plan.md'), 'x\n') }
  assert.equal(treeHash(a).hash, treeHash(b).hash)
  fs.mkdirSync(path.join(b, 'empty'))
  assert.deepEqual(treeDiff(treeHash(a), treeHash(b)), ['empty/'])
  fs.writeFileSync(path.join(b, '.work', 'plan.md'), 'y\n')
  assert.deepEqual(treeDiff(treeHash(a), treeHash(b)), ['.work/plan.md', 'empty/'])
  try { fs.symlinkSync(a, path.join(b, 'link'), 'junction') } catch { return }
  assert.throws(() => treeHash(b), /Link or special file/)
})

test('the Claude call always carries the run, budget, publication and ablation flags', () => {
  const args = claudeArgs('shim', 'b1-07a', 1.234, 'out.json')
  for (const flag of ['--ablation', '--no-publish', '--scaffold', '--keep-temp', '--max-cost-usd', '--model', '--judge-model', '--runs', '--case', '--json']) assert.ok(args.includes(flag), flag)
  assert.equal(args[args.indexOf('--ablation') + 1], 'none')
  assert.equal(args[args.indexOf('--runs') + 1], '1')
  assert.equal(args[args.indexOf('--max-cost-usd') + 1], '1.23')
})

const use = (name, input, id) => JSON.stringify({ message: { content: [{ type: 'tool_use', id, name, input }] } })
const ok = (id, error) => JSON.stringify({ message: { content: [{ type: 'tool_result', tool_use_id: id, ...(error ? { is_error: true } : {}), content: 'x' }] } })

test('Claude attribution needs successful full reads of the skill and every listed input, and nothing outside the run folder', () => {
  const cwd = C + '/tmp/claude-eval-x/home/cwd'
  const skill = [use('Read', { file_path: cwd + '/' + SKILL }, '1'), ok('1')]
  assert.equal(claudeAttribution(skill.join('\n'), cwd).ok, true)
  assert.equal(claudeAttribution([use('Read', { file_path: SKILL }, '1'), ok('1')].join('\n'), cwd).ok, true)
  assert.match(claudeAttribution(use('Read', { file_path: cwd + '/' + SKILL }, '1'), cwd).reason, /no full read/)
  assert.match(claudeAttribution([use('Read', { file_path: cwd + '/' + SKILL }, '1'), ok('1', true)].join('\n'), cwd).reason, /no full read/)
  assert.match(claudeAttribution([use('Read', { file_path: cwd + '/' + SKILL, offset: 1, limit: 5 }, '1'), ok('1')].join('\n'), cwd).reason, /no full read/)
  assert.match(claudeAttribution([...skill, use('Read', { file_path: cwd + '/../../../other/SKILL.md' }, '2'), ok('2')].join('\n'), cwd).reason, /outside/)
  assert.match(claudeAttribution([...skill, use('Glob', { pattern: C + '/elsewhere/**/*.md' }, '3')].join('\n'), cwd).reason, /outside/)
  assert.match(claudeAttribution([...skill, use('Glob', { pattern: '**/*', path: C + '/elsewhere/.claude' }, '3')].join('\n'), cwd).reason, /outside/)
  assert.match(claudeAttribution([...skill, use('Bash', { command: 'ls' }, '4')].join('\n'), cwd).reason, /unexpected tool/)
  assert.match(claudeAttribution(skill.join('\n'), cwd, ['POLICY.md']).reason, /not all read/)
  assert.equal(claudeAttribution([...skill, use('Read', { file_path: 'project/POLICY.md' }, '5'), ok('5')].join('\n'), cwd, ['POLICY.md']).ok, true)
  assert.match(claudeAttribution('{broken', cwd).reason, /unreadable/)
})

test('Codex attribution counts a read only when the command output is the full file, and refuses unprovable targets', () => {
  const cwd = C + '/Temp/cxb-1/s'
  const contents = { [SKILL]: '# PR workflow\nbody\n', 'project/POLICY.md': 'policy\n' }
  const pw = cmd => '"' + PROGRAMS + '/PowerShell/7/pwsh.exe" -Command "' + cmd + '"'
  const read = { command: pw('Get-Content -LiteralPath ./' + SKILL + ' -Raw -Encoding utf8 | ConvertTo-Json -Compress'), exitCode: 0, output: JSON.stringify(contents[SKILL]) + '\n' }
  assert.equal(codexAttribution([read], cwd, contents).ok, true)
  assert.equal(codexAttribution([{ ...read, output: contents[SKILL] }], cwd, contents).ok, true)
  assert.match(codexAttribution([{ ...read, exitCode: 1 }], cwd, contents).reason, /no full read/)
  assert.match(codexAttribution([{ ...read, command: pw('Get-Content ./' + SKILL + ' -TotalCount 1'), output: '# PR workflow' }], cwd, contents).reason, /no full read/)
  assert.match(codexAttribution([{ command: 'Get-Content ./project/POLICY.md; Write-Output ./' + SKILL, exitCode: 0, output: 'policy\n./' + SKILL }], cwd, contents).reason, /no full read/)
  assert.match(codexAttribution([read, { command: 'Get-Content ~/.agents/skills/x/SKILL.md', exitCode: 0, output: '' }], cwd, contents).reason, /not provable/)
  assert.match(codexAttribution([read, { command: 'Get-Content //server/share/SKILL.md', exitCode: 0, output: '' }], cwd, contents).reason, /not provable/)
  assert.match(codexAttribution([read, { command: 'Get-Content ' + C + '/elsewhere/.codex/plugins/cache/devflow/SKILL.md', exitCode: 0, output: '' }], cwd, contents).reason, /outside|leaves/)
  assert.match(codexAttribution([read, { command: 'Get-Content ../other/SKILL.md', exitCode: 0, output: '' }], cwd, contents).reason, /leaves/)
  assert.match(codexAttribution([read, { command: '$p = "plugin"; Get-Content "$p/x"', exitCode: 0, output: '' }], cwd, contents).reason, /not provable/)
  assert.match(codexAttribution([read, { command: 'Set-Location ' + C + '/elsewhere; Get-Content x', exitCode: 0, output: '' }], cwd, contents).reason, /not provable|outside/)
  assert.match(codexAttribution([read], cwd, contents, ['POLICY.md']).reason, /not all read/)
  assert.equal(codexAttribution([read, { command: 'Get-Content -LiteralPath ./project/POLICY.md -Raw', exitCode: 0, output: 'policy' }], cwd, contents, ['POLICY.md']).ok, true)
})

test('Codex stdout gives the last message, usage without double-counted cache, command output and validity', () => {
  const lines = [
    { type: 'thread.started' },
    { type: 'item.completed', item: { id: 'c1', type: 'command_execution', command: 'Get-Content a', exit_code: 0, aggregated_output: 'a\n' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'first' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'final' } },
    { type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 10 } },
  ].map(JSON.stringify).join('\n')
  const t = codexTrace(lines)
  assert.equal(t.valid, true)
  assert.equal(t.message, 'final')
  assert.equal(t.tokens, 110)
  assert.deepEqual(t.commands, [{ command: 'Get-Content a', exitCode: 0, output: 'a\n' }])
  assert.equal(codexTrace(lines.replace(/.*turn.completed.*/, '')).valid, false)
  assert.equal(codexTrace(lines.replace(/.*turn.completed.*/, '')).tokens, null)
})

test('slot classes: task failure is invalid, a missing task or proposition verdict is undetermined', () => {
  const g = [{ name: 'task' }, { name: 'd1' }]
  assert.deepEqual(classify({ graders: g, verdicts: { task: 'PASS', d1: 'FAIL' } }), { d1: 'positive' })
  assert.deepEqual(classify({ graders: g, verdicts: { task: 'PASS', d1: 'PASS' } }), { d1: 'negative' })
  assert.deepEqual(classify({ graders: g, verdicts: { task: 'FAIL', d1: 'PASS' } }), { d1: 'invalid' })
  assert.deepEqual(classify({ graders: g, verdicts: { task: null, d1: 'PASS' } }), { d1: 'undetermined' })
  assert.deepEqual(classify({ graders: g, verdicts: { task: 'PASS', d1: null } }), { d1: 'undetermined' })
  assert.deepEqual(classify({ graders: g, invalid: 'run error' }), { d1: 'invalid' })
})

test('adoption needs every required cell complete and decidable, a lower fixed total and no regression with missing slots counted against the candidate', () => {
  const k = (positive, extra = {}) => ({ positive, negative: 14 - positive - (extra.invalid || 0) - (extra.undetermined || 0), invalid: 0, undetermined: 0, slots: 14, ...extra })
  const rules = { slots: 14, counterMax: 2, fixed: [['f', 'd1']], counter: [['k', 'c']], regression: [['r', 'd6']] }
  const required = [['f', 'd1'], ['k', 'c'], ['r', 'd6']]
  const base = { f: { d1: { A: k(9), B: k(1) } }, k: { c: { A: k(0), B: k(0) } }, r: { d6: { A: k(0), B: k(0) } } }
  assert.deepEqual(adopt(base, rules, required), { adopted: true, reasons: [] })
  assert.equal(adopt(base, rules, [...required, ['h1c', 'd1']]).adopted, false)
  const { k: _drop, ...noCounter } = base
  assert.equal(adopt(noCounter, rules, required).adopted, false)
  assert.equal(adopt({ ...base, f: { d1: { A: k(9), B: k(0, { invalid: 14 }) } } }, rules, required).adopted, false)
  assert.equal(adopt({ ...base, r: { d6: { A: k(0), B: k(0, { undetermined: 1 }) } } }, rules, required).adopted, false)
  assert.equal(adopt({ ...base, r: { d6: { A: k(0, { invalid: 14 }), B: k(0) } } }, rules, required).adopted, true)
  assert.equal(adopt({ ...base, f: { d1: { A: k(2), B: k(2) } } }, rules, required).adopted, false)
  assert.equal(adopt({ ...base, k: { c: { A: k(3), B: k(3) } } }, rules, required).adopted, false)
  assert.equal(adopt({ ...base, r: { d6: { A: k(0), B: { ...k(0), slots: 13 } } } }, rules, required).adopted, false)
})

test('the required list names every design cell and marks a missing holdout case', () => {
  const pairs = requiredPairs({}).map(p => p.join('/'))
  for (const p of [...RULES.fixed, ...RULES.counter, ...RULES.regression]) assert.ok(pairs.includes(p.join('/')))
  assert.ok(pairs.includes('h1c/(missing case)') && pairs.includes('h1x/(missing case)'))
})

test('calibration must cover every grader by hash with enough samples and passing rates', () => {
  const cases = [{ id: 'b1', graders: [{ name: 'task', hash: 't' }, { name: 'd1', hash: 'h' }] }]
  const good = { hash: 'h', positives: 5, negatives: 6, sensitivity: 0.8, specificity: 1 }
  assert.deepEqual(checkCalibration({ graders: { 'b1/task': { ...good, hash: 't' }, 'b1/d1': good } }, cases), [])
  assert.deepEqual(checkCalibration({ graders: { 'b1/task': { ...good, hash: 't' }, 'b1/d1': { ...good, hash: 'old' } } }, cases), ['b1/d1'])
  assert.deepEqual(checkCalibration({ graders: { 'b1/task': { ...good, hash: 't', negatives: 4 } } }, cases), ['b1/task', 'b1/d1'])
})

test('one budget group accumulates across runs with fixed caps, and unknown usage turns it unknown', () => {
  const group = 'test-' + process.pid + '-' + Date.now()
  const file = path.join(ROOT, '.work', 'behavior-eval', 'budgets', group + '.json')
  try {
    assert.throws(() => ev.openBudget(group, { usd: 3 }), /both/)
    ev.openBudget(group, { usd: 3, tokens: 400000 })
    assert.throws(() => ev.openBudget(group, { usd: 5 }), /other caps/)
    ev.charge(group, { run: 'r1', slot: 's1', usd: 0.4 })
    ev.charge(group, { run: 'r2', slot: 's2', tokens: 70000 })
    let b = ev.openBudget(group, {})
    assert.equal(b.claudeUsd, 0.4)
    assert.equal(b.codexTokens, 70000)
    assert.equal(b.known, true)
    ev.charge(group, { run: 'r2', slot: 's3', tokens: null })
    b = ev.openBudget(group, {})
    assert.equal(b.known, false)
  } finally { fs.rmSync(file, { force: true }) }
})

test('upper bound, budget reserve and argument checks', () => {
  assert.equal(upperBound(14).toFixed(3), '0.193')
  assert.equal(upperBound(0), null)
  assert.equal(reserve({ entries: [] }, 'claude'), 1)
  assert.equal(reserve({ entries: [{ usd: 0.9 }] }, 'claude'), 1.8)
  assert.equal(reserve({ entries: [{ slot: 'a', tokens: 70000 }, { slot: 'a', tokens: 90000 }, { slot: 'b', tokens: 10000 }] }, 'codex'), 320000)
  assert.throws(() => parseArgs(['run', '--run', 'x', '--host', 'claude']), /usage/)
  assert.throws(() => parseArgs(['prepare', '--run', 'x', '--arm', 'A=1']), /usage/)
  assert.equal(parseArgs(['run', '--run', 'x', '--host', 'codex', '--budget', 'pilot']).budget, 'pilot')
})
