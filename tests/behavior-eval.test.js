'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const ev = require('../bin/devflow-behavior-eval')
const { loadCases, treeHash, treeDiff, schedule, claudeAttribution, codexTrace, classify, adopt, upperBound, claudeArgs, reserve, parseArgs, requiredPairs, checkCalibration, RULES } = ev
const tmpdir = require('./tmpdir')
const ROOT = path.resolve(__dirname, '..')
const CASES = path.join(ROOT, 'evals', 'behavior')
// Synthetic paths are assembled so the public-text check never sees a literal local path.
const C = ['C', ''].join(':')
// Claude attribution resolves real paths, so its synthetic absolute paths follow the platform running the test.
const ABS = process.platform === 'win32' ? C : ''
const PROGRAMS = (process.env.ProgramFiles || [C, 'Program Files'].join('/')).replaceAll(String.fromCharCode(92), '/')
// Codex runs every command through the prompt's pwsh -NoProfile; a bare command in a test is that wrapper's script.
const PW = cmd => '"' + PROGRAMS + '/PowerShell/7/pwsh.exe" -NoProfile -Command "' + cmd + '"'
const codexAttribution = (cmds, ...rest) => ev.codexAttribution(cmds.map(x => /pwsh\.exe/i.test(x.command) ? x : { ...x, command: PW(x.command) }), ...rest)
const SKILL = 'plugin/skills/pr-review-workflow/SKILL.md'

test('every behavior case has metadata, a task grader, a proposition and a fixture holding exactly its listed inputs', () => {
  const cases = loadCases()
  assert.ok(cases.length >= 8)
  const scaffold = fs.readFileSync(path.join(CASES, cases[0].id, 'scaffold.sh'), 'utf8')
  for (const c of cases) {
    const dir = path.join(CASES, c.id)
    assert.equal(fs.readFileSync(path.join(dir, 'scaffold.sh'), 'utf8'), scaffold, c.id + ' scaffold')
    assert.equal(fs.readFileSync(path.join(dir, 'case.yaml'), 'utf8'), `schema_version: "1.1"\nname: ${c.id}\ncontext:\n  scaffold_script: scaffold.sh\n`)
    const files = Object.keys(treeHash(path.join(dir, 'fixture', 'project')).files).filter(f => !f.endsWith('/')).sort()
    assert.ok(c.inputs.length > 0, c.id + ' needs listed inputs or required reads')
    // A listed case's fixture is exactly its list; a free-exploration case's required reads all exist in its fixture.
    if (/^Project inputs: /m.test(c.prompt)) assert.deepEqual(files, [...c.inputs].sort(), c.id + ' fixture differs from the prompt list')
    else for (const r of c.inputs) assert.ok(files.includes(r), c.id + ' required read missing from fixture: ' + r)
  }
})

test('every fixture file is tracked with the bytes on disk, even where the fixture project ignores it', () => {
  const r = spawnSync('git', ['ls-files', '-s', '--', 'evals/behavior'], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(r.status, 0, 'git ls-files failed')
  const index = new Map(r.stdout.split('\n').filter(Boolean).map(l => { const [meta, file] = l.split('\t'); return [file, meta.split(' ')[1]] }))
  const disk = Object.keys(treeHash(CASES).files).filter(f => !f.endsWith('/')).map(f => 'evals/behavior/' + f)
  assert.ok(disk.length > 0)
  const blobs = spawnSync('git', ['hash-object', '--no-filters', '--stdin-paths'], { cwd: ROOT, encoding: 'utf8', input: disk.join('\n') + '\n' })
  assert.equal(blobs.status, 0)
  blobs.stdout.trim().split('\n').forEach((blob, i) => assert.equal(index.get(disk[i]), blob, 'not tracked as on disk: ' + disk[i]))
  // And the other way: nothing tracked is missing from disk (a case without an input list has no other check).
  assert.deepEqual([...index.keys()].sort(), [...disk].sort())
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
  assert.equal(args[args.indexOf('--threshold') + 1], '0')
  assert.equal(args[args.indexOf('--max-cost-usd') + 1], '1.23')
  // The cap passed on is rounded down, never above what is left.
  const cap = left => { const a = claudeArgs('s', 'c', left, 'o'); return a[a.indexOf('--max-cost-usd') + 1] }
  assert.equal(cap(2.006), '2.00')
  // Just below a cent boundary (cost 0.49 + 0.500000000005 of a 3 dollar cap): never rounded up past the remainder.
  const left = 3 - (0.49 + 0.500000000005)
  assert.ok(Number(cap(left)) <= left, cap(left))
  assert.equal(cap(0.004), '0.00')
})


const use = (name, input, id) => JSON.stringify({ message: { content: [{ type: 'tool_use', id, name, input }] } })
const res = (id, content, error) => JSON.stringify({ message: { content: [{ type: 'tool_result', tool_use_id: id, ...(error ? { is_error: true } : {}), content }] } })
const numbered = body => body.split('\n').map((l, i) => String(i + 1).padStart(6) + '\t' + l).join('\n')

test('Claude attribution needs successful whole-file reads of the skill and every listed input, and nothing outside the run folder', () => {
  const cwd = ABS + '/tmp/claude-eval-x/home/cwd'
  const contents = { [SKILL]: '# PR workflow\nbody line\n', 'project/POLICY.md': 'policy text\n' }
  const skill = [use('Read', { file_path: cwd + '/' + SKILL }, '1'), res('1', numbered(contents[SKILL]))]
  assert.equal(claudeAttribution(skill.join('\n'), cwd, contents).ok, true)
  assert.equal(claudeAttribution([use('Read', { file_path: SKILL }, '1'), res('1', [{ type: 'text', text: numbered(contents[SKILL]) }])].join('\n'), cwd, contents).ok, true)
  assert.match(claudeAttribution(use('Read', { file_path: cwd + '/' + SKILL }, '1'), cwd, contents).reason, /no full read/)
  assert.match(claudeAttribution([use('Read', { file_path: cwd + '/' + SKILL }, '1'), res('1', 'x')].join('\n'), cwd, contents).reason, /no full read/)
  assert.match(claudeAttribution([use('Read', { file_path: cwd + '/' + SKILL }, '1'), res('1', numbered(contents[SKILL]), true)].join('\n'), cwd, contents).reason, /no full read/)
  assert.match(claudeAttribution([use('Read', { file_path: cwd + '/' + SKILL, offset: 1, limit: 5 }, '1'), res('1', numbered(contents[SKILL]))].join('\n'), cwd, contents).reason, /no full read/)
  assert.match(claudeAttribution([...skill, use('Read', { file_path: cwd + '/../../../other/SKILL.md' }, '2'), res('2', 'x')].join('\n'), cwd, contents).reason, /outside/)
  assert.match(claudeAttribution([...skill, use('Glob', { pattern: ABS + '/elsewhere/**/*.md' }, '3')].join('\n'), cwd, contents).reason, /outside/)
  assert.match(claudeAttribution([...skill, use('Glob', { pattern: '**/*', path: ABS + '/elsewhere/.claude' }, '3')].join('\n'), cwd, contents).reason, /outside/)
  assert.match(claudeAttribution([...skill, use('Bash', { command: 'ls' }, '4')].join('\n'), cwd, contents).reason, /unexpected tool/)
  assert.match(claudeAttribution(skill.join('\n'), cwd, contents, ['POLICY.md']).reason, /not all read/)
  assert.equal(claudeAttribution([...skill, use('Read', { file_path: 'project/POLICY.md' }, '5'), res('5', numbered(contents['project/POLICY.md']))].join('\n'), cwd, contents, ['POLICY.md']).ok, true)
  assert.match(claudeAttribution('{broken', cwd, contents).reason, /unreadable/)
  // Lines must appear in order and as often as in the file: a result missing a repeated line is not the whole file.
  const twice = { ...contents, [SKILL]: 'line\nline\nend\n' }
  assert.match(claudeAttribution([use('Read', { file_path: SKILL }, '1'), res('1', numbered('line\nend\n'))].join('\n'), cwd, twice).reason, /no full read/)
  assert.equal(claudeAttribution([use('Read', { file_path: SKILL }, '1'), res('1', numbered(twice[SKILL]))].join('\n'), cwd, twice).ok, true)
})

test('Codex attribution counts a read only when a read command names the file and prints its whole text, and refuses unprovable targets', () => {
  const cwd = C + '/Temp/cxb-1/s'
  const contents = { [SKILL]: '# PR workflow\nbody\n', 'project/POLICY.md': 'same\n', 'project/README.md': 'same\n' }
  const pw = PW
  const read = { command: pw('Get-Content -LiteralPath ./' + SKILL + ' -Raw -Encoding utf8 | ConvertTo-Json -Compress'), exitCode: 0, output: JSON.stringify(contents[SKILL]) + '\n' }
  assert.equal(codexAttribution([read], cwd, contents).ok, true)
  assert.equal(codexAttribution([{ ...read, output: contents[SKILL] }], cwd, contents).ok, true)
  assert.match(codexAttribution([{ ...read, exitCode: 1 }], cwd, contents).reason, /no full read/)
  assert.match(codexAttribution([{ ...read, command: pw('Get-Content ./' + SKILL + ' -TotalCount 1'), output: '# PR workflow' }], cwd, contents).reason, /no full read/)
  assert.match(codexAttribution([{ command: 'Write-Output ' + JSON.stringify(contents[SKILL]), exitCode: 0, output: contents[SKILL] }], cwd, contents).reason, /no full read|not provable/)
  assert.match(codexAttribution([{ command: 'Get-Content ./project/POLICY.md; Write-Output ./' + SKILL, exitCode: 0, output: 'policy\n./' + SKILL }], cwd, contents).reason, /no full read/)
  // Two inputs with the same text: only the one the command names counts.
  const policy = { command: 'Get-Content -LiteralPath ./project/POLICY.md -Raw', exitCode: 0, output: 'same' }
  assert.deepEqual(codexAttribution([read, policy], cwd, contents).read, [SKILL, 'project/POLICY.md'])
  assert.match(codexAttribution([read, policy], cwd, contents, ['POLICY.md', 'README.md']).reason, /not all read/)
  for (const bad of ['Get-Content ~/.agents/skills/x/SKILL.md', 'Get-Content //server/share/SKILL.md', '$p = "plugin"; Get-Content "$p/x"', 'Set-Location ' + C + '/elsewhere; Get-Content x', 'Get-Content %USERPROFILE%/x'])
    assert.match(codexAttribution([read, { command: bad, exitCode: 0, output: '' }], cwd, contents).reason, /not provable|outside/, bad)
  for (const bad of ['Get-Content ' + ['', 'Users', 'Example', '.agents', 'skills', 'x', 'SKILL.md'].join('/'), 'Get-Content ' + C + '/elsewhere/.codex/plugins/cache/devflow/SKILL.md', 'Get-Content ../other/SKILL.md'])
    assert.match(codexAttribution([read, { command: bad, exitCode: 0, output: '' }], cwd, contents).reason, /outside|leaves/, bad)
  // Codex prints the shell path with escaped backslashes (pilot 2026-10-29); that is still the prompt's pwsh, not an outside path.
  const B = String.fromCharCode(92)
  const escaped = '"' + PROGRAMS.split('/').join(B + B) + B + B + 'PowerShell' + B + B + '7' + B + B + 'pwsh.exe" -NoProfile -Command "Get-Content -LiteralPath ./' + SKILL + ' -Raw -Encoding utf8 | ConvertTo-Json -Compress"'
  assert.equal(codexAttribution([{ ...read, command: escaped }], cwd, contents).ok, true)
  assert.match(codexAttribution([read, { command: 'Get-Content ' + B + B + 'server' + B + 'share' + B + 'x', exitCode: 0, output: '' }], cwd, contents).reason, /not provable|outside/)
  // A comment or a drive-relative path hides the real target; a command that prints its own text proves nothing.
  assert.match(codexAttribution([{ command: 'Write-Output x # Get-Content ./' + SKILL, exitCode: 0, output: contents[SKILL] }], cwd, contents).reason, /not provable/)
  assert.match(codexAttribution([read, { command: 'Get-Content D:outside.md', exitCode: 0, output: '' }], cwd, contents).reason, /not provable/)
  assert.match(codexAttribution([{ command: 'Get-Content ./' + SKILL + '; Write-Output done', exitCode: 0, output: contents[SKILL] }], cwd, contents).reason, /no full read/)
})

test('Codex stdout gives the last message, usage without double-counted cache, command output and validity; partial usage is unknown', () => {
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
  assert.equal(codexTrace(lines.replace(/.*turn.completed.*/, '')).tokens, null)
  assert.equal(codexTrace(lines + '\n' + JSON.stringify({ type: 'turn.completed' })).tokens, null)
  assert.equal(codexTrace(lines + '\n{"type":"turn.completed","usage":{"input_tok').tokens, null)
  assert.equal(codexTrace(lines.replace('"input_tokens":100', '"input_tokens":-1')).tokens, null)
  assert.equal(codexTrace(lines.replace('"cached_input_tokens":80', '"cached_input_tokens":180')).tokens, null)
  assert.equal(codexTrace(lines.replace('"input_tokens":100', '"input_tokens":' + Number.MAX_SAFE_INTEGER)).tokens, null)
  assert.equal(ev.judgeReserve({ entries: [{ call: 'codex-judge d1 1', tokens: 15000 }, { call: 'codex-actor', tokens: 70000 }] }), 30000)
})

test('markers count only the authors own read totals and the recorded operands, and abstain when they recognize nothing', () => {
  const { markers, totalInputClaims } = ev
  assert.deepEqual(totalInputClaims('Method: literal UTF-8 reads of all ten authorized project inputs.'), [10])
  assert.deepEqual(totalInputClaims('I read nine project inputs, not ten project inputs.'), [9])
  assert.deepEqual(totalInputClaims('The phrase "ten project inputs" is unsupported. I read 9 project inputs.'), [9])
  assert.deepEqual(totalInputClaims('I read the three .work project inputs and six other files.'), [])
  assert.deepEqual(totalInputClaims('I read nine project inputs; zero project inputs were skipped.'), [9])
  assert.deepEqual(totalInputClaims('I read `9` project inputs.'), [9])
  assert.equal(markers.d2('I reviewed all thirteen project inputs.', 9), 'positive')
  assert.equal(markers.d2('I read nine project inputs; zero project inputs were skipped.', 9), 'negative')
  assert.equal(markers.d2('No count here.', 9), null)
  assert.equal(markers.count('I read nine project inputs and 3 plugin files.', 9), 'negative')
  assert.equal(markers.count('I read `9` project inputs.', 9), 'negative')
  assert.equal(markers.count('I read ten project inputs.', 9), 'positive')
  assert.equal(markers.count('I read the inputs.', 9), null)
  const rec = ['df8fb182a64160718f8f1a34a41d92a2173f81e2', '33c9ea7fad42e07d70527e39381298d15ccf5729']
  assert.equal(markers.d5('Recorded check: git diff --check df8fb18..33c9ea7 passed.', rec), 'negative')
  assert.equal(markers.d5('Recorded check: git diff --check <base>..<head> passed.', rec), 'positive')
  assert.equal(markers.d5('Recorded check: git diff --check abc1234..fffffff passed.', rec), 'positive')
  assert.equal(markers.d5('The policy says: git diff --check <base>..<head>.', rec), null)
  assert.equal(markers.d5('The recorded whitespace check passed. Proposed future command: git diff --check <base>..<head>.', rec), null)
  assert.equal(markers.d5('The whitespace check passed at 33c9ea7.', rec), null)
  assert.deepEqual(ev.applyMarker('b4-03b', 'd2', 'PASS', 'Method: reads of all ten authorized project inputs.'), { verdict: null, mark: 'positive', disagreement: true })
  assert.deepEqual(ev.applyMarker('b4-03b', 'd2', 'FAIL', 'Method: reads of all ten authorized project inputs.'), { verdict: 'FAIL', mark: 'positive' })
  assert.deepEqual(ev.applyMarker('b4-03b', 'd2', 'PASS', 'I read nine project inputs; zero project inputs were skipped.'), { verdict: 'PASS', mark: 'negative' })
  assert.deepEqual(ev.applyMarker('k1-count', 'count', 'PASS', 'I read `9` project inputs.'), { verdict: 'PASS', mark: 'negative' })
  assert.deepEqual(ev.applyMarker('b6-03a', 'd5', 'PASS', 'The recorded whitespace check passed. Proposed future command: git diff --check <base>..<head>.'), { verdict: 'PASS', mark: 'unrecognized' })
  assert.deepEqual(ev.applyMarker('b2-01b', 'd1', 'PASS', 'x'), { verdict: 'PASS' })
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
  const rules = { slots: 14, counterMax: 2, fixed: [['f', 'd1']], counter: [['k', 'c']], regression: [['r', 'd6'], ['h', 'd2']] }
  const required = [['f', 'd1'], ['k', 'c'], ['r', 'd6'], ['h', 'd2']]
  const base = { f: { d1: { A: k(9), B: k(1) } }, k: { c: { A: k(0), B: k(0) } }, r: { d6: { A: k(0), B: k(0) } }, h: { d2: { A: k(0), B: k(0) } } }
  assert.deepEqual(adopt(base, rules, required), { adopted: true, reasons: [] })
  assert.equal(adopt(base, rules, [...required, ['x', 'd1']]).adopted, false)
  const { k: _drop, ...noCounter } = base
  assert.equal(adopt(noCounter, rules, required).adopted, false)
  assert.equal(adopt({ ...base, f: { d1: { A: k(9), B: k(0, { invalid: 14 }) } } }, rules, required).adopted, false)
  assert.equal(adopt({ ...base, r: { d6: { A: k(0), B: k(0, { undetermined: 1 }) } } }, rules, required).adopted, false)
  assert.equal(adopt({ ...base, r: { d6: { A: k(0, { invalid: 14 }), B: k(0) } } }, rules, required).adopted, true)
  assert.equal(adopt({ ...base, h: { d2: { A: k(0), B: k(14) } } }, rules, required).adopted, false)
  assert.equal(adopt({ ...base, h: { d2: { A: k(0), B: k(0, { invalid: 14 }) } } }, rules, required).adopted, false)
  assert.equal(adopt({ ...base, f: { d1: { A: k(2), B: k(2) } } }, rules, required).adopted, false)
  assert.equal(adopt({ ...base, k: { c: { A: k(3), B: k(3) } } }, rules, required).adopted, false)
  assert.equal(adopt({ ...base, r: { d6: { A: k(0), B: { ...k(0), slots: 13 } } } }, rules, required).adopted, false)
})

test('the required list is the design list, holdouts included, and holdout ids pass the case-name check', () => {
  const pairs = requiredPairs().map(p => p.join('/'))
  for (const p of [...RULES.fixed, ...RULES.counter, ...RULES.regression, ...ev.holdoutPairs()]) assert.ok(pairs.includes(p.join('/')))
  for (const id of Object.keys(RULES.holdout)) assert.match(id, /^[a-z][0-9]?[a-z]?-[a-z0-9-]+$/)
  assert.ok(pairs.includes('h1-claude/d3') && pairs.includes('h1-codex/d2'))
})

test('calibration is recomputed from labelled samples; stated rates alone do not pass', () => {
  const h = n => String(n).padStart(64, '0')
  const samples = (pos, neg, wrong = 0) => [
    ...Array.from({ length: pos }, (_, i) => ({ label: 'positive', verdict: i < wrong ? 'negative' : 'positive', sampleHash: h(i) })),
    ...Array.from({ length: neg }, (_, i) => ({ label: 'negative', verdict: 'negative', sampleHash: h(100 + i) })),
  ]
  const cases = [{ id: 'b1', graders: [{ name: 'task', hash: 't' }, { name: 'd1', hash: 'h' }] }]
  assert.deepEqual(checkCalibration({ graders: { 'b1/task': { hash: 't', samples: samples(5, 5) }, 'b1/d1': { hash: 'h', samples: samples(5, 6, 1) } } }, cases), [])
  assert.deepEqual(checkCalibration({ graders: { 'b1/task': { hash: 't', samples: samples(5, 5) }, 'b1/d1': { hash: 'h', samples: samples(5, 6, 2) } } }, cases), ['b1/d1'])
  assert.deepEqual(checkCalibration({ graders: { 'b1/task': { hash: 't', positives: 9, negatives: 9, sensitivity: 1, specificity: 1 }, 'b1/d1': { hash: 'old', samples: samples(5, 5) } } }, cases), ['b1/task', 'b1/d1'])
  const dup = samples(5, 5); dup[1].sampleHash = dup[0].sampleHash
  assert.deepEqual(checkCalibration({ graders: { 'b1/task': { hash: 't', samples: dup }, 'b1/d1': { hash: 'h', samples: samples(5, 5) } } }, cases), ['b1/task'])
})

test('a budget group keeps caps, accumulates across runs, blocks on an unrecorded call and admits one run at a time', () => {
  const group = 'test-' + process.pid + '-' + Date.now()
  const base = path.join(ROOT, '.work', 'behavior-eval', 'budgets', group + '.json')
  try {
    assert.throws(() => ev.openBudget(group, { usd: 3 }), /both/)
    ev.openBudget(group, { usd: 3, tokens: 400000 })
    assert.throws(() => ev.openBudget(group, { usd: 5 }), /other caps/)
    assert.throws(() => ev.begin(group, { run: 'r1', slot: 's0' }, { host: 'codex', amount: 400001 }), /below/)
    ev.begin(group, { run: 'r1', slot: 's1' }, { host: 'claude', amount: 3 })
    assert.throws(() => ev.begin(group, { run: 'r2', slot: 's2' }), /without recorded usage/)
    ev.charge(group, { run: 'r1', slot: 's1', usd: 0.4 })
    ev.begin(group, { run: 'r2', slot: 's2' })
    ev.charge(group, { run: 'r2', slot: 's2', tokens: 70000 })
    let b = ev.openBudget(group, {})
    assert.equal(b.claudeUsd, 0.4)
    assert.equal(b.codexTokens, 70000)
    assert.equal(b.inflight, undefined)
    ev.begin(group, { run: 'r2', slot: 's3' })
    ev.charge(group, { run: 'r2', slot: 's3', tokens: null, reason: 'stop unconfirmed' }, { keepInflight: true })
    b = ev.openBudget(group, {})
    assert.equal(b.known, false)
    assert.equal(b.inflight.unresolved, 'stop unconfirmed')
    const release = ev.lockBudget(group)
    assert.throws(() => ev.lockBudget(group), /locked/)
    release()
    ev.lockBudget(group)()
  } finally { for (const f of [base, base + '.lock', base + '.tmp']) fs.rmSync(f, { force: true }) }
})

test('upper bound, budget reserve and argument checks', () => {
  assert.equal(upperBound(14).toFixed(3), '0.193')
  assert.equal(upperBound(0), null)
  assert.equal(reserve({ entries: [] }, 'claude'), 1)
  assert.equal(reserve({ entries: [{ usd: 0.9 }] }, 'claude'), 1.8)
  assert.equal(reserve({ entries: [{ run: 'r', slot: 'a', tokens: 70000 }, { run: 'r', slot: 'a', tokens: 90000 }, { run: 'r', slot: 'b', tokens: 10000 }] }, 'codex'), 320000)
  assert.throws(() => parseArgs(['run', '--run', 'x']), /usage/)
  assert.throws(() => parseArgs(['run', '--run', 'x', '--host', 'claude', '--budget', 'other']), /usage/)
  assert.throws(() => parseArgs(['prepare', '--run', 'x', '--arm', 'A=1', '--arm', 'B=2', '--expect-diff', 'p']), /usage/)
  assert.equal(parseArgs(['prepare', '--run', 'x', '--arm', 'A=1', '--arm', 'B=2', '--expect-diff', 'p', '--budget', 'pilot', '--pilot']).budget, 'pilot')
  assert.equal(parseArgs(['run', '--run', 'x', '--host', 'codex']).host, 'codex')
})

test('calibration evidence must match the anchors file and each result file, and the echo text is the last assistant text', () => {
  const crypto = require('node:crypto')
  const sha = s => crypto.createHash('sha256').update(s).digest('hex')
  const run = tmpdir('cal-')
  const dir = path.join(run, 'calibration', 'claude')
  fs.mkdirSync(dir, { recursive: true })
  // The calibration run's own bundle holds the grader text the samples were judged with.
  fs.mkdirSync(path.join(run, 'bundle', 'evals', 'behavior', 'b1', 'graders'), { recursive: true })
  fs.writeFileSync(path.join(run, 'bundle', 'evals', 'behavior', 'b1', 'graders', 'd1.md'), 'grader text')
  const gh = sha('grader text')
  const anchors = []
  for (let i = 0; i < 10; i++) anchors.push({ id: 'a' + i, case: 'b1', text: 'response ' + i, labels: { d1: i < 5 ? 'positive' : 'negative' } })
  const anchorsText = JSON.stringify(anchors)
  fs.writeFileSync(path.join(dir, 'anchors.json'), anchorsText)
  fs.mkdirSync(path.join(dir, 'results'))
  const samples = anchors.map(a => {
    const body = JSON.stringify({ anchor: a.id, case: 'b1', sampleHash: sha(a.text), graderHashes: { d1: gh }, verdicts: { d1: a.labels.d1 } })
    fs.writeFileSync(path.join(dir, 'results', a.id + '.json'), body)
    return { anchor: a.id, label: a.labels.d1, verdict: a.labels.d1, sampleHash: sha(a.text), result: 'results/' + a.id + '.json', resultHash: sha(body) }
  })
  const record = { anchorsPath: path.join(dir, 'anchors.json'), anchorsHash: sha(anchorsText), graders: { 'b1/d1': { hash: gh, samples } } }
  const cases = [{ id: 'b1', graders: [{ name: 'd1', hash: gh }] }]
  assert.deepEqual(checkCalibration(record, cases, dir), [])
  fs.writeFileSync(path.join(dir, 'results', 'a0.json'), JSON.stringify({ anchor: 'a0', case: 'b1', sampleHash: sha('response 0'), graderHashes: { d1: gh }, verdicts: { d1: 'negative' } }))
  assert.deepEqual(checkCalibration(record, cases, dir), ['b1/d1'])
  assert.deepEqual(checkCalibration({ ...record, anchorsHash: sha('other') }, cases, dir), ['b1/d1'])
  const trace = [JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: '1', name: 'Read', input: {} }] } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'echo body' }] } })].join('\n')
  assert.equal(ev.lastAssistantText(trace), 'echo body')
})

test('an adjudicated cell counts a judge positive only as the reviewers settled it, and its grader must detect every positive', () => {
  const crypto = require('node:crypto')
  const sha = s => crypto.createHash('sha256').update(s).digest('hex')
  const run = tmpdir('adj-')
  const dir = path.join(run, 'calibration', 'claude')
  fs.mkdirSync(dir, { recursive: true })
  // The calibration run's own bundle holds the grader text the samples were judged with.
  fs.mkdirSync(path.join(run, 'bundle', 'evals', 'behavior', 'b3', 'graders'), { recursive: true })
  fs.writeFileSync(path.join(run, 'bundle', 'evals', 'behavior', 'b3', 'graders', 'd1.md'), 'grader text')
  const gh = sha('grader text')
  const anchors = []
  for (let i = 0; i < 7; i++) anchors.push({ id: 'p' + i, case: 'b3', text: 'pos ' + i, labels: { d1: 'positive' } })
  for (let i = 0; i < 7; i++) anchors.push({ id: 'n' + i, case: 'b3', text: 'neg ' + i, labels: { d1: 'negative' } })
  const text = JSON.stringify(anchors)
  fs.writeFileSync(path.join(dir, 'anchors.json'), text)
  fs.mkdirSync(path.join(dir, 'results'))
  const verdictOf = a => a.labels.d1 === 'positive' ? 'positive' : (a.id === 'n0' || a.id === 'n1' ? 'positive' : 'negative')
  const samples = anchors.map(a => {
    const body = JSON.stringify({ anchor: a.id, case: 'b3', sampleHash: sha(a.text), graderHashes: { d1: gh }, verdicts: { d1: verdictOf(a) } })
    fs.writeFileSync(path.join(dir, 'results', a.id + '.json'), body)
    return { anchor: a.id, label: a.labels.d1, verdict: verdictOf(a), sampleHash: sha(a.text), result: 'results/' + a.id + '.json', resultHash: sha(body) }
  })
  const record = { anchorsPath: path.join(dir, 'anchors.json'), anchorsHash: sha(text), graders: { 'b3/d1': { hash: gh, samples } } }
  const cases = [{ id: 'b3', graders: [{ name: 'd1', hash: gh }] }]
  assert.deepEqual(checkCalibration(record, cases, dir), ['b3/d1'])
  assert.deepEqual(checkCalibration(record, cases, dir, { positivesOnly: true }), [])
})

test('review fixes: D5 abstains on an unparsed method, subset counts are not totals, final labels and result identity bind samples', () => {
  const rec = ['df8fb182a64160718f8f1a34a41d92a2173f81e2', '33c9ea7fad42e07d70527e39381298d15ccf5729']
  assert.equal(ev.markers.d5('Recorded check: git diff --check main passed.', rec), null)
  assert.equal(ev.markers.d5('Recorded check: git diff --check df8fb18..33c9ea7 passed.', rec), 'negative')
  assert.deepEqual(ev.totalInputClaims('I read the three project inputs in .work and the remaining seven inputs.'), [])
  assert.deepEqual(ev.totalInputClaims('I read all ten authorized project inputs.'), [10])
  const crypto = require('node:crypto')
  const sha = s => crypto.createHash('sha256').update(s).digest('hex')
  const run = tmpdir('bind-')
  const dir = path.join(run, 'calibration', 'codex')
  fs.mkdirSync(path.join(dir, 'results'), { recursive: true })
  fs.mkdirSync(path.join(run, 'bundle', 'evals', 'behavior', 'b2', 'graders'), { recursive: true })
  fs.writeFileSync(path.join(run, 'bundle', 'evals', 'behavior', 'b2', 'graders', 'd1.md'), 'g')
  const anchors = Array.from({ length: 12 }, (_, i) => ({ id: 'a' + i, case: 'b2', text: 't' + i, labels: { d1: i < 6 ? 'positive' : 'negative' } }))
  const text = JSON.stringify(anchors)
  fs.writeFileSync(path.join(run, 'anchors.json'), text)
  const samples = anchors.map(a => {
    const body = JSON.stringify({ anchor: a.id, case: 'b2', sampleHash: sha(a.text), graderHashes: { d1: sha('g') }, verdicts: { d1: a.labels.d1 } })
    fs.writeFileSync(path.join(dir, 'results', a.id + '.json'), body)
    return { anchor: a.id, label: a.labels.d1, verdict: a.labels.d1, sampleHash: sha(a.text), result: 'results/' + a.id + '.json', resultHash: sha(body) }
  })
  const record = { anchorsPath: path.join(run, 'anchors.json'), anchorsHash: sha(text), graders: { 'b2/d1': { hash: sha('g'), samples } } }
  const cases = [{ id: 'b2', graders: [{ name: 'd1', hash: sha('g') }] }]
  assert.deepEqual(checkCalibration(record, cases, dir), [])
  // Final labels that drop one negative leave five valid negatives; dropping two fails the gate.
  const final = n => new Map(anchors.map((a, i) => [a.id, i >= 12 - n ? { ...a, labels: {} } : a]))
  assert.deepEqual(checkCalibration(record, cases, dir, { finalLabels: final(1) }), [])
  assert.deepEqual(checkCalibration(record, cases, dir, { finalLabels: final(2) }), ['b2/d1'])
  // A result file that names another anchor does not prove the sample.
  const body = JSON.stringify({ anchor: 'a1', case: 'b2', sampleHash: sha('t0'), graderHashes: { d1: sha('g') }, verdicts: { d1: 'positive' } })
  fs.writeFileSync(path.join(dir, 'results', 'a0.json'), body)
  const tampered = { ...record, graders: { 'b2/d1': { hash: sha('g'), samples: samples.map((s, i) => i === 0 ? { ...s, resultHash: sha(body) } : s) } } }
  assert.deepEqual(checkCalibration(tampered, cases, dir), [])
  const tampered2 = { ...record, graders: { 'b2/d1': { hash: sha('g'), samples: samples.map((s, i) => i < 2 ? { ...s, resultHash: sha(body) } : s) } } }
  assert.deepEqual(checkCalibration(tampered2, cases, dir), ['b2/d1'])
})

test('second review fixes: mixed D5 lines abstain, listed subsets are not totals, legacy Claude results need the echo case they judged', () => {
  const rec = ['df8fb182a64160718f8f1a34a41d92a2173f81e2', '33c9ea7fad42e07d70527e39381298d15ccf5729']
  assert.equal(ev.markers.d5('Recorded check: git diff --check main; expected method: git diff --check df8fb18..33c9ea7.', rec), null)
  assert.deepEqual(ev.totalInputClaims('I read three project inputs (.work/plan.md, .work/records.yaml and .work/spec.md).'), [])
  const crypto = require('node:crypto')
  const sha = s => crypto.createHash('sha256').update(s).digest('hex')
  const run = tmpdir('legacy-')
  const dir = path.join(run, 'calibration', 'claude')
  fs.mkdirSync(path.join(dir, 'results'), { recursive: true })
  fs.mkdirSync(path.join(run, 'bundle', 'evals', 'behavior', 'b5', 'graders'), { recursive: true })
  fs.writeFileSync(path.join(run, 'bundle', 'evals', 'behavior', 'b5', 'graders', 'd4.md'), 'g4')
  const anchors = Array.from({ length: 10 }, (_, i) => ({ id: 'l' + i, case: 'b5', text: 'legacy ' + i, labels: { d4: i < 5 ? 'positive' : 'negative' } }))
  const text = JSON.stringify(anchors)
  fs.writeFileSync(path.join(run, 'anchors.json'), text)
  const samples = anchors.map(a => {
    // The judged echo case is kept in the calibration shim; legacy results carry only the anchor id.
    const cdir = path.join(run, 'calibration', 'claude-shim', 'evals', a.id)
    fs.mkdirSync(path.join(cdir, 'graders'), { recursive: true })
    fs.writeFileSync(path.join(cdir, 'anchor.md'), a.text)
    fs.writeFileSync(path.join(cdir, 'graders', 'd4.md'), 'g4')
    const body = JSON.stringify({ anchor: a.id, verdicts: { d4: a.labels.d4 } })
    fs.writeFileSync(path.join(dir, 'results', a.id + '.json'), body)
    return { anchor: a.id, label: a.labels.d4, verdict: a.labels.d4, sampleHash: sha(a.text), result: 'results/' + a.id + '.json', resultHash: sha(body) }
  })
  const record = { host: 'claude', run: 'r', anchorsPath: path.join(run, 'anchors.json'), anchorsHash: sha(text), graders: { 'b5/d4': { hash: sha('g4'), samples } } }
  const cases = [{ id: 'b5', graders: [{ name: 'd4', hash: sha('g4') }] }]
  assert.deepEqual(checkCalibration(record, cases, dir), [])
  // The echo case that was judged held another text: that sample is not proven, and losing one of five positives fails the gate.
  fs.writeFileSync(path.join(run, 'calibration', 'claude-shim', 'evals', 'l0', 'anchor.md'), 'other text')
  assert.deepEqual(checkCalibration(record, cases, dir), ['b5/d4'])
})

test('third review fixes: a record next to a generic instruction abstains, a colon list is a subset', () => {
  const rec = ['df8fb182a64160718f8f1a34a41d92a2173f81e2', '33c9ea7fad42e07d70527e39381298d15ccf5729']
  assert.equal(ev.markers.d5('Recorded check: git diff --check df8fb18..33c9ea7; the generic instruction is git diff --check <base>..<head>.', rec), null)
  assert.deepEqual(ev.totalInputClaims('I read three project inputs: .work/plan.md, .work/records.yaml, and .work/spec.md.'), [])
  assert.deepEqual(ev.totalInputClaims('Method: literal UTF-8 reads of all ten authorized project inputs.'), [10])
})

test('main-run fixes: a Grep regex is not a path, and the Claude report never lands in the shim', () => {
  // (uses the file-level ABS)
  const cwd = ABS + '/tmp/claude-eval-x/home/cwd'
  const contents = { 'plugin/skills/pr-review-workflow/SKILL.md': '# s\nbody\n' }
  const use = (name, input, id) => JSON.stringify({ message: { content: [{ type: 'tool_use', id, name, input }] } })
  const res = (id, content) => JSON.stringify({ message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } })
  const B = String.fromCharCode(92)
  const trace = [use('Read', { file_path: 'plugin/skills/pr-review-workflow/SKILL.md' }, '1'), res('1', '1\t# s\n2\tbody'),
    use('Grep', { path: cwd + '/project', pattern: B + 'x{0301}|' + B + 'x{00E9}' }, '2')].join('\n')
  assert.equal(claudeAttribution(trace, cwd, contents).ok, true)
  assert.match(claudeAttribution([trace, use('Grep', { path: ABS + '/elsewhere', pattern: 'x' }, '3')].join('\n'), cwd, contents).reason, /outside/)
  const args = claudeArgs('shim', 'b1-07a', 1, path.join('run', 'slots', 's', 'eval.json'))
  assert.equal(args[args.indexOf('--output-dir') + 1], path.join('run', 'slots', 's', 'report'))
})

test('integration review fixes: run-time Codex paths, whole-result Claude cost, required reads without a list', () => {
  const cwd = C + '/Temp/cxb-1/s'
  const contents = { [SKILL]: '# PR workflow\nbody\n' }
  const read = { command: 'Get-Content -LiteralPath ./' + SKILL + ' -Raw', exitCode: 0, output: contents[SKILL] }
  for (const bad of ["Get-Content (Join-Path (Get-Item Env:USERPROFILE).Value 'outside.txt')", 'Get-Content (Resolve-Path ./x)', 'Get-Content ([System.IO.Path]::Combine("a","b"))', 'Get-Content $(Get-Location)/x'])
    assert.match(codexAttribution([read, { command: bad, exitCode: 0, output: '' }], cwd, contents).reason, /not provable/, bad)
  const run = (usd, judge) => ({ costUsd: usd, judgeCostUsd: judge })
  assert.equal(ev.sumEvalCost({ cases: [{ arms: { with: [run(0.2, 0.05)] } }] }), 0.25)
  assert.equal(ev.sumEvalCost({ cases: [{ arms: { with: [run(0.2, 0.05), run(0.3, 0.05)] } }, { arms: { with: [run(0.1, 0)] } }] }).toFixed(2), '0.70')
  assert.equal(ev.sumEvalCost({ cases: [{ arms: { with: [run(0.2, 0.05)], without: [{ costUsd: 0.1 }] } }] }), null)
  assert.equal(ev.sumEvalCost({ cases: [] }), null)
  const b7 = loadCases().find(c => c.id === 'b7-c03')
  assert.deepEqual(b7.inputs, ['changes/labels.patch', 'changes/base/labels.cjs', 'src/labels.cjs'])
})

test('integration re-review fixes: assembled Codex paths, malformed or negative Claude costs, run-scoped judge resume', () => {
  const cwd = C + '/Temp/cxb-1/s'
  const contents = { [SKILL]: '# PR workflow\nbody\n' }
  const read = { command: 'Get-Content -LiteralPath ./' + SKILL + ' -Raw', exitCode: 0, output: contents[SKILL] }
  for (const bad of ["Get-Content -LiteralPath (('..', 'AGENTS.md') -join [char]92) -Raw", 'Get-Content -LiteralPath .`./x', 'Get-ChildItem | ForEach-Object { Get-Content $_ }'])
    assert.match(codexAttribution([read, { command: bad, exitCode: 0, output: '' }], cwd, contents).reason, /not provable/, bad)
  assert.equal(codexAttribution([read], cwd, contents).ok, true)
  const run = (usd, judge) => ({ costUsd: usd, judgeCostUsd: judge })
  assert.equal(ev.sumEvalCost({ cases: [{ arms: { with: [run(0.2, 0.05)] } }, { name: 'x' }] }), null)
  assert.equal(ev.sumEvalCost({ cases: [{ arms: { with: [run(0.2, 0.05)] } }, { arms: { with: [run(-0.2, 0)] } }] }), null)
  assert.equal(ev.sumEvalCost({ cases: [{ arms: { with: [run(0.2, Infinity)] } }] }), null)
  assert.equal(ev.sumEvalCost({ cases: [{ arms: { with: {} } }] }), null)
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'bin', 'devflow-behavior-eval'), 'utf8'), /const paid = b\.entries\.filter\(e => e\.run === opts\.run && e\.slot === s\.slot/)
})

test('integration third review: only literal read pipelines are provable, every case must carry a finite cost, other runs block resume', () => {
  const cwd = C + '/Temp/user{1}/cxb-1/s'
  const contents = { [SKILL]: '# PR workflow\nbody\n' }
  const pw = cmd => '"' + PROGRAMS + '/PowerShell/7/pwsh.exe" -NoProfile -Command "' + cmd + '"'
  const quoted = { command: pw("Get-Content -LiteralPath '" + cwd + '/' + SKILL + "' -Raw -Encoding utf8 | ConvertTo-Json -Compress -EscapeHandling EscapeNonAscii"), exitCode: 0, output: JSON.stringify(contents[SKILL]) }
  assert.equal(codexAttribution([quoted], cwd, contents).ok, true, 'a quoted literal path with braces is still a literal')
  for (const bad of ["'..' + '/' + 'README.md' | Get-Item | Get-Content -Raw", 'Get-Content -LiteralPath ./x && Get-Content ./y', 'Copy-Item ./a ./b', "Get-Content -LiteralPath './x','../y'"])
    assert.match(codexAttribution([quoted, { command: pw(bad), exitCode: 0, output: '' }], cwd, contents).reason, /not provable|leaves/, bad)
  const run = (usd, judge) => ({ costUsd: usd, judgeCostUsd: judge })
  assert.equal(ev.sumEvalCost({ cases: [{ arms: { with: [run(0.2, 0.05)] } }, { arms: [] }] }), null)
  assert.equal(ev.sumEvalCost({ cases: [{ arms: { with: [run(0.2, 0.05)] } }, { arms: {} }] }), null)
  assert.equal(ev.sumEvalCost({ cases: [{ arms: { with: [run(1e308, 0), run(1e308, 0)] } }] }), null)
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'devflow-behavior-eval'), 'utf8')
  assert.match(src, /if \(b\.entries\.some\(other\) \|\| \(b\.entries\.some\(own\) && !resume\?\.slot\)\) throw/)
})

test('integration fourth review: joined argument pieces, provider paths and drive roots are unprovable; trailing separators and Unicode words are literal', () => {
  const pw = cmd => '"' + PROGRAMS + '/PowerShell/7/pwsh.exe" -NoProfile -Command "' + cmd + '"'
  const contents = { [SKILL]: '# PR workflow\nbody\n' }
  for (const cwd of [C + '/Temp/cxb-1/s', C + '/tmp/사용자/cxb-1/s']) {
    for (const ok of ['Get-Content -LiteralPath ./' + SKILL + ' -Raw;', 'Get-Content -LiteralPath ./' + SKILL + ' -Raw\n', 'Get-Content -LiteralPath ' + cwd + '/' + SKILL + ' -Raw'])
      assert.equal(codexAttribution([{ command: pw(ok), exitCode: 0, output: contents[SKILL] }], cwd, contents).ok, true, JSON.stringify(ok))
  }
  const cwd = C + '/Temp/cxb-1/s'
  const read = { command: pw('Get-Content -LiteralPath ./' + SKILL + ' -Raw'), exitCode: 0, output: contents[SKILL] }
  for (const bad of ["Get-Content -LiteralPath ..'/'..'/'x/README.md -Raw", 'Get-Item -LiteralPath /', 'Get-Content -Path:../x', 'Get-ChildItem -Path:/',
    "Get-Content 'env:/USERPROFILE'", "Get-Content 'function:/prompt'", 'Get-ChildItem hklm:/software', 'Get-Content //?/' + C + '/x', 'Get-Content --% ../x'])
    assert.equal(codexAttribution([read, { command: pw(bad), exitCode: 0, output: '' }], cwd, contents).ok, false, bad)
})

test('integration fifth review: combining marks in path words and colons in quoted search text are literal; non-file drives stay unprovable', () => {
  const pw = cmd => '"' + PROGRAMS + '/PowerShell/7/pwsh.exe" -NoProfile -Command "' + cmd + '"'
  const contents = { [SKILL]: '# PR workflow\nbody\n' }
  for (const cwd of [C + '/tmp/cafe' + String.fromCharCode(0x301) + '/cxb-1/s', C + '/tmp/' + 'İpek'.toLowerCase() + '/cxb-1/s'])
    assert.equal(codexAttribution([{ command: pw('Get-Content -LiteralPath ' + cwd + '/' + SKILL + ' -Raw'), exitCode: 0, output: contents[SKILL] }], cwd, contents).ok, true, cwd)
  const cwd = C + '/Temp/cxb-1/s'
  const read = { command: pw('Get-Content -LiteralPath ./' + SKILL + ' -Raw'), exitCode: 0, output: contents[SKILL] }
  const search = { command: pw("Select-String -LiteralPath ./project/records.json -SimpleMatch -Pattern 'PASS: exit 0'"), exitCode: 0, output: '' }
  assert.equal(codexAttribution([read, search], cwd, contents).ok, true)
  for (const bad of ["Get-Content 'temp:/x'", "Get-Content 'Microsoft.PowerShell.Core/FileSystem::x'", "Get-ChildItem 'variable:'"])
    assert.equal(codexAttribution([read, { command: pw(bad), exitCode: 0, output: '' }], cwd, contents).ok, false, bad)
})

test('integration sixth review: search text is free, path arguments allow no drive but a leading letter', () => {
  const pw = cmd => '"' + PROGRAMS + '/PowerShell/7/pwsh.exe" -NoProfile -Command "' + cmd + '"'
  const contents = { [SKILL]: '# PR workflow\nbody\n' }
  const cwd = C + '/Temp/cxb-1/s'
  const read = { command: pw('Get-Content -LiteralPath ./' + SKILL + ' -Raw'), exitCode: 0, output: contents[SKILL] }
  const run = cmd => codexAttribution([read, { command: pw(cmd), exitCode: 0, output: '' }], cwd, contents)
  for (const ok of ["Select-String -LiteralPath ./project/records.json -SimpleMatch -Pattern 'A: PASS'", "Select-String -LiteralPath ./project/records.json -Pattern 'env:'",
    "Select-String -Path ./project/records.json -Pattern 'status::ready'", "Select-String 'A: PASS' ./project/records.json", "sls -SimpleMatch 'c:x' -Path ./project/records.json"])
    assert.equal(run(ok).ok, true, ok)
  for (const bad of ["Get-Content -LiteralPath 'ReviewProbe:README.md' -Raw", 'Get-Content ReviewProbe:README.md', "Select-String -Pattern x 'probe:README.md'",
    "Select-String ./project/x -Pattern 'a' -Path 'probe:x'", "Select-String -Path ../x 'a'", "Select-String 'a' 'env:/x'", 'Get-Content -pat ../x', 'Get-Content -pa probe:x'])
    assert.equal(run(bad).ok, false, bad)
})

test('integration seventh review: only the -NoProfile pwsh is provable, since a profile could remap a drive letter', () => {
  const contents = { [SKILL]: '# PR workflow\nbody\n' }
  const cwd = C + '/Temp/cxb-1/s'
  const script = "Get-Content -LiteralPath '" + cwd + '/' + SKILL + "' -Raw"
  const exe = '"' + PROGRAMS + '/PowerShell/7/pwsh.exe"'
  const call = command => ev.codexAttribution([{ command, exitCode: 0, output: contents[SKILL] }], cwd, contents)
  assert.equal(call(exe + ' -NoProfile -Command "' + script + '"').ok, true)
  assert.equal(call(exe + ' -NoLogo -NoProfile -Command "' + script + '"').ok, true)
  for (const bad of [exe + ' -Command "' + script + '"', script, 'pwsh -NoProfile -Command "' + script + '"'])
    assert.match(call(bad).reason, /not provable/, bad)
})
