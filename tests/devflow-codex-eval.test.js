'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { parseTrace, loadCases, score, parseArgs, summarize, continuation, execute, cleanEnv } = require('../bin/devflow-codex-eval')
const tmpdir = require('./tmpdir')
const skillRoot = ['C:', 'eval', 'home', 'skills'].join('/')
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/codex-eval', name + '.jsonl'), 'utf8').replaceAll('EVAL_SKILLS', skillRoot)
const event = command => JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command } }) + '\n'

test('saved CLI stdout detects a read once and counts cached input once', () => {
  const result = parseTrace(fixture('read'), skillRoot)
  assert.deepEqual(result.detectedSkills, ['grilling'])
  assert.deepEqual(result.usage, { input_tokens: 1234, cached_input_tokens: 1000, output_tokens: 56, total_tokens: 1290 })
  assert.equal(result.valid, true)
})

test('messages, command output, listings and echo do not count as reads', () => {
  const text = fixture('quiet') + event(`echo '${skillRoot}/grilling/SKILL.md'`) + event(`echo "cat ${skillRoot}/grilling/SKILL.md"`) + event(`rg --files ${skillRoot}/grilling/SKILL.md`) +
    JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'pwd', aggregated_output: skillRoot + '/grilling/SKILL.md' } })
  assert.deepEqual(parseTrace(text, skillRoot).detectedSkills, [])
  assert.deepEqual(parseTrace(fixture('quiet') + event(`Get-Content 'ordinary.txt'; echo "cat '${skillRoot}/grilling/SKILL.md'"`), skillRoot).detectedSkills, [])
  assert.deepEqual(parseTrace(fixture('quiet') + event(`Get-Content 'ordinary.txt' "cat '${skillRoot}/grilling/SKILL.md'"`), skillRoot).detectedSkills, [])
})

test('unknown usage types do not turn an incomplete run into a neutral success', () => {
  const text = '{"type":"thread.started","thread_id":"sample"}\n{"type":"token_usage_record","total_tokens":123}\n'
  const result = parseTrace(text, skillRoot)
  assert.equal(result.valid, false)
  assert.equal(result.usage, null)
})

test('literal Windows and POSIX reads count; another plugin with the same name does not', () => {
  const winFile = (skillRoot + '/writing-for-agents/SKILL.md').replaceAll('/', String.fromCharCode(92))
  const other = ['C:', 'other', 'skills', 'grilling', 'SKILL.md'].join('/')
  const text = fixture('quiet') + event(`Get-Content "${winFile}"`) + event(`cat '${other}'`)
  assert.deepEqual(parseTrace(text, skillRoot).detectedSkills, ['writing-for-agents'])
  assert.deepEqual(parseTrace(fixture('quiet') + event(`Get-Content '${skillRoot}/GRILLING/SKILL.md'`), skillRoot).detectedSkills, ['grilling'])
  assert.deepEqual(parseTrace(fixture('quiet') + event("sed -n '1,80p' '/eval/home/skills/grilling/SKILL.md'"), '/eval/home/skills').detectedSkills, ['grilling'])
})

test('failed read attempts retain trigger evidence, as in spike #36', () => {
  const text = fixture('quiet') + event(`cat '${skillRoot}/grilling/SKILL.md'`).replace('"command":', '"exit_code":1,"command":')
  assert.deepEqual(parseTrace(text, skillRoot).detectedSkills, ['grilling'])
})

test('missing completion, usage, malformed JSON and failed turns are invalid', () => {
  for (const text of ['', '{broken}\n', fixture('read').replace(/.*turn.completed.*\n/, ''), fixture('quiet') + '{"type":"turn.failed"}\n', fixture('quiet').replace('"input_tokens":100', '"input_tokens":-1')]) {
    assert.equal(parseTrace(text, skillRoot).valid, false)
  }
})

test('multiple turns add usage without adding cached input to the total', () => {
  const result = parseTrace(fixture('quiet') + '{"type":"turn.completed","usage":{"input_tokens":200,"cached_input_tokens":150,"output_tokens":20}}\n', skillRoot)
  assert.equal(result.usage.total_tokens, 328)
  assert.equal(result.usage.cached_input_tokens, 150)
})

test('all 24 Claude cases keep body and positive, targeted negative, none policies', () => {
  const cases = loadCases(path.join(__dirname, '..', 'evals', 'trigger'))
  assert.equal(cases.length, 24)
  assert.equal(cases.filter(c => c.policy === 'required').length, 14)
  assert.equal(cases.filter(c => c.policy === 'none').length, 2)
  const negative = cases.find(c => c.id === 'pr-review-workflow--start-request')
  assert.equal(score(negative, { valid: true, detectedSkills: ['development-start'] }), 'pass')
  assert.equal(score(negative, { valid: true, detectedSkills: ['pr-review-workflow'] }), 'fail')
  assert.equal(score(cases.find(c => c.policy === 'none'), { valid: true, detectedSkills: ['grilling'] }), 'fail')
  assert.equal(score(cases[0], { valid: false, detectedSkills: [] }), 'invalid')
  assert.ok(!cases[0].prompt.startsWith('---'))
})

test('no budget or ambiguous mode fails before any model process can start', () => {
  for (const args of [[], ['--full'], ['--full', '--budget-tokens', '0'], ['--full', '--smoke', '--budget-tokens', '1000'], ['--unknown']]) assert.throws(() => parseArgs(args))
  assert.equal(parseArgs(['--full', '--budget-tokens', '1000000']).budgetTokens, 1000000)
})

test('invalid runs stay visible and are excluded from rates', () => {
  const result = summarize([
    { policy: 'required', result: 'pass', tokens: { total_tokens: 10 } },
    { policy: 'required', result: 'invalid', tokens: null },
    { policy: 'none', result: 'fail', tokens: { total_tokens: 20 } },
  ])
  assert.equal(result.invalid, 1)
  assert.equal(result.triggerRate, 1)
  assert.equal(result.falsePositiveRate, 1)
  assert.equal(result.totalTokens, 30)
  assert.equal(result.usageKnown, false)
})

test('explicit budget continuation preserves the charged prefix and rejects changed or repeated cases', () => {
  const cases = loadCases(path.join(__dirname, '..', 'evals', 'trigger'))
  const old = { ...cases[0], result: 'pass', guardMissing: false, spawnFailed: false, tokens: { total_tokens: 100 } }
  const report = { mode: 'full', complete: false, stoppedReason: 'budget', model: 'gpt-6.1-sol', effort: 'high', timeoutSeconds: 300, priorTokens: 50, cases: [old], summary: { usageKnown: true, totalTokens: 100 }, sourceHash: 'public-snapshot' }
  assert.deepEqual(continuation(report, cases), { cases: [old], priorTokens: 50, sourceHash: 'public-snapshot' })
  for (const change of [{ stoppedReason: 'unknown-usage' }, { complete: true }, { summary: { usageKnown: true, totalTokens: 101 } }, { cases: [{ ...old, promptHash: 'changed' }] }, { cases: [old, old] }, { cases: [{ ...old, guardMissing: true }] }]) assert.throws(() => continuation({ ...report, ...change }, cases))
  assert.throws(() => parseArgs(['--smoke', '--continue-from', 'result.json', '--budget-tokens', '1000']))
  assert.throws(() => parseArgs(['--full', '--continue-from', 'result.json', '--prior-results', 'smoke.json', '--budget-tokens', '1000']))
  assert.throws(() => parseArgs(['--full', '--budget-tokens', '1000', '--continue-from']))
  assert.throws(() => parseArgs(['--full', '--budget-tokens', '1000', '--prior-results']))
})

test('a real silent child is stopped on timeout and returns invalid with no known usage', async () => {
  const home = tmpdir('codex-eval-child-')
  // Execute a task-local Node copy, never Codex or a model. The process lifetime is the behavior under test.
  const executable = path.join(home, process.platform === 'win32' ? 'codex-test.exe' : 'codex-test')
  fs.copyFileSync(process.execPath, executable)
  if (process.platform !== 'win32') fs.chmodSync(executable, 0o700)
  fs.writeFileSync(path.join(home, 'exec'), 'setInterval(() => {}, 1000)\n')
  fs.writeFileSync(path.join(home, 'eval-public-root.json'), JSON.stringify({ root: home }))
  const result = await execute({ id: 'none--silent', expectedSkill: null, policy: 'none', prompt: '' }, home, home, cleanEnv(home), { executable, timeoutMs: 200 })
  assert.equal(result.timedOut, true)
  assert.equal(result.result, 'invalid')
  assert.equal(result.tokens, null)
  assert.equal(result.processStopUnconfirmed, false)
  assert.ok(result.durationMs < 10000)
})
