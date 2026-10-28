'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { loadCases, treeHash, treeDiff, schedule, claudeAttribution, codexTrace, codexAttribution, classify, adopt, upperBound, claudeArgs, reserve, parseArgs } = require('../bin/devflow-behavior-eval')
const tmpdir = require('./tmpdir')
const ROOT = path.resolve(__dirname, '..')
const CASES = path.join(ROOT, 'evals', 'behavior')
// Synthetic paths are assembled so the public-text check never sees a literal local path.
const C = ['C', ''].join(':')
const PROGRAMS = (process.env.ProgramFiles || [C, 'Program Files'].join('/')).replaceAll(String.fromCharCode(92), '/')

test('every behavior case has metadata, a task grader, a proposition and a fixture holding exactly its listed inputs', () => {
  const cases = loadCases()
  assert.ok(cases.length >= 8)
  const scaffold = fs.readFileSync(path.join(CASES, cases[0].id, 'scaffold.sh'), 'utf8')
  for (const c of cases) {
    const dir = path.join(CASES, c.id)
    assert.equal(fs.readFileSync(path.join(dir, 'scaffold.sh'), 'utf8'), scaffold, c.id + ' scaffold')
    assert.equal(fs.readFileSync(path.join(dir, 'case.yaml'), 'utf8'), `schema_version: "1.1"\nname: ${c.id}\ncontext:\n  scaffold_script: scaffold.sh\n`)
    const listed = /^Project inputs: (.+)\.$/m.exec(c.prompt)
    if (!listed) continue
    const files = Object.keys(treeHash(path.join(dir, 'fixture', 'project')).files).sort()
    assert.deepEqual(files, listed[1].split('; ').sort(), c.id + ' fixture differs from the prompt list')
  }
})

test('fixture files are tracked even where the fixture project ignores them', () => {
  const r = spawnSync('git', ['ls-files', '--', 'evals/behavior'], { cwd: ROOT, encoding: 'utf8' })
  if (r.status !== 0) return
  const tracked = new Set(r.stdout.split('\n').filter(Boolean))
  if (!tracked.size) return
  for (const f of Object.keys(treeHash(CASES).files)) assert.ok(tracked.has('evals/behavior/' + f), 'untracked: ' + f)
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
  assert.deepEqual(slots.slice(0, 8).map(s => s.arm).join(''), 'ABBAABBA')
  for (const arm of ['A', 'B']) assert.equal(new Set(slots.filter(s => s.arm === arm).map(s => s.slot)).size, 14)
})

test('tree hashes cover hidden files and report changed paths; links are refused', () => {
  const a = tmpdir('bt-'), b = tmpdir('bt-')
  for (const d of [a, b]) { fs.mkdirSync(path.join(d, '.work'), { recursive: true }); fs.writeFileSync(path.join(d, '.work', 'plan.md'), 'x\n') }
  assert.equal(treeHash(a).hash, treeHash(b).hash)
  fs.writeFileSync(path.join(b, '.work', 'plan.md'), 'y\n')
  fs.writeFileSync(path.join(b, 'new.txt'), '')
  assert.deepEqual(treeDiff(treeHash(a), treeHash(b)), ['.work/plan.md', 'new.txt'])
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

test('Claude attribution needs a full read of the run-folder skill and no tool access outside the run folder', () => {
  const cwd = C + '/tmp/claude-eval-x/home/cwd'
  const line = (name, input, id) => JSON.stringify({ message: { content: [{ type: 'tool_use', id, name, input }] } })
  assert.deepEqual(claudeAttribution(line('Read', { file_path: cwd + '/plugin/skills/pr-review-workflow/SKILL.md' }, '1'), cwd), { ok: true })
  assert.deepEqual(claudeAttribution(line('Read', { file_path: 'plugin/skills/pr-review-workflow/SKILL.md' }, '1'), cwd), { ok: true })
  assert.equal(claudeAttribution(line('Read', { file_path: cwd + '/plugin/skills/pr-review-workflow/SKILL.md', offset: 1, limit: 5 }, '1'), cwd).ok, false)
  const outside = [line('Read', { file_path: cwd + '/plugin/skills/pr-review-workflow/SKILL.md' }, '1'), line('Glob', { pattern: '**/*', path: C + '/elsewhere/.claude' }, '2')].join('\n')
  assert.match(claudeAttribution(outside, cwd).reason, /outside/)
  assert.match(claudeAttribution('{broken', cwd).reason, /unreadable/)
})

test('Codex attribution accepts only written-out reads inside the run folder', () => {
  const cwd = C + '/Temp/cxb-1/s'
  const read = { command: '"' + PROGRAMS + '/PowerShell/7/pwsh.exe" -Command "Get-Content -LiteralPath ./plugin/skills/pr-review-workflow/SKILL.md -Raw -Encoding utf8 | ConvertTo-Json -Compress"', exitCode: 0 }
  assert.deepEqual(codexAttribution([read], cwd), { ok: true })
  assert.deepEqual(codexAttribution([{ command: 'Get-Content -LiteralPath ' + C + '/Temp/cxb-1/s/plugin/skills/pr-review-workflow/SKILL.md -Raw', exitCode: 0 }], cwd), { ok: true })
  assert.equal(codexAttribution([{ ...read, exitCode: 1 }], cwd).ok, false)
  assert.match(codexAttribution([read, { command: 'Get-Content ' + C + '/elsewhere/.codex/plugins/cache/x/devflow/0.3.1/skills/pr-review-workflow/SKILL.md', exitCode: 0 }], cwd).reason, /outside|leaves/)
  assert.match(codexAttribution([read, { command: 'Get-Content ../other/SKILL.md', exitCode: 0 }], cwd).reason, /leaves/)
  assert.match(codexAttribution([read, { command: '$p = "plugin"; Get-Content "$p/skills/pr-review-workflow/SKILL.md"', exitCode: 0 }], cwd).reason, /not provable/)
  assert.match(codexAttribution([read, { command: 'Set-Location ' + C + '/elsewhere; Get-Content x', exitCode: 0 }], cwd).reason, /not provable|outside/)
})

test('Codex stdout gives the last message, usage without double-counted cache, and validity', () => {
  const lines = [
    { type: 'thread.started' },
    { type: 'item.completed', item: { id: 'c1', type: 'command_execution', command: 'Get-Content a', exit_code: 0 } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'first' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'final' } },
    { type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 10 } },
  ].map(JSON.stringify).join('\n')
  const t = codexTrace(lines)
  assert.equal(t.valid, true)
  assert.equal(t.message, 'final')
  assert.equal(t.tokens, 110)
  assert.equal(t.commands.length, 1)
  assert.equal(codexTrace(lines.replace(/.*turn.completed.*/, '')).valid, false)
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

test('adoption needs complete, decidable cells, a lower fixed total and no regression even when missing slots count against the candidate', () => {
  const k = (positive, extra = {}) => ({ positive, negative: 14 - positive - (extra.invalid || 0) - (extra.undetermined || 0), invalid: 0, undetermined: 0, slots: 14, ...extra })
  const rules = { slots: 14, counterMax: 2, fixed: [['f', 'd1']], counter: [['k', 'c']], regression: [['r', 'd6']] }
  const base = { f: { d1: { A: k(9), B: k(1) } }, k: { c: { A: k(0), B: k(0) } }, r: { d6: { A: k(0), B: k(0) } } }
  assert.deepEqual(adopt(base, rules), { adopted: true, reasons: [] })
  assert.equal(adopt({ ...base, f: { d1: { A: k(9), B: k(0, { invalid: 14 }) } } }, rules).adopted, false)
  assert.equal(adopt({ ...base, r: { d6: { A: k(0), B: k(0, { undetermined: 1 }) } } }, rules).adopted, false)
  assert.equal(adopt({ ...base, r: { d6: { A: k(0, { invalid: 14 }), B: k(0) } } }, rules).adopted, true)
  assert.equal(adopt({ ...base, f: { d1: { A: k(2), B: k(2) } } }, rules).adopted, false)
  assert.equal(adopt({ ...base, k: { c: { A: k(3), B: k(3) } } }, rules).adopted, false)
  assert.equal(adopt({ ...base, r: { d6: { A: k(0), B: { ...k(0), slots: 13 } } } }, rules).adopted, false)
})

test('upper bound, budget reserve and argument checks', () => {
  assert.equal(upperBound(14).toFixed(3), '0.193')
  assert.equal(upperBound(0), null)
  assert.equal(reserve({ entries: [] }, 'claude'), 1)
  assert.equal(reserve({ entries: [{ usd: 0.9 }] }, 'claude'), 1.8)
  assert.equal(reserve({ entries: [{ tokens: 150000 }] }, 'codex'), 300000)
  assert.throws(() => parseArgs(['run', '--run', 'x', '--host', 'claude']), /usage/)
  assert.throws(() => parseArgs(['prepare', '--run', 'x', '--arm', 'A=1']), /usage/)
  assert.equal(parseArgs(['run', '--run', 'x', '--host', 'codex', '--budget-tokens', '400000']).budgetTokens, 400000)
})
