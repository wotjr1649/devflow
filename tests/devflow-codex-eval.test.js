'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { parseTrace, loadCases, score, parseArgs, summarize, continuation, execute, cleanEnv, writeEvalConfig, configArgs, expandCases, retainGlobalInstructions, checkGlobalInstructions } = require('../bin/devflow-codex-eval')
const tmpdir = require('./tmpdir')
const skillRoot = ['C:', 'eval', 'home', 'skills'].join('/')
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/codex-eval', name + '.jsonl'), 'utf8').replaceAll('EVAL_SKILLS', skillRoot)
const event = command => JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command } }) + '\n'

test('dedicated home config preserves plugin activation and later hook trust while restricting reads', () => {
  const home = tmpdir('codex-eval-config-')
  const file = path.join(home, 'config.toml')
  const plugin = '[plugins."devflow@devflow"]\nenabled = true\n'
  fs.writeFileSync(file, plugin)
  writeEvalConfig(home)
  fs.appendFileSync(file, '\n[hooks.state."sample"]\ntrusted_hash = "sha256:sample"\n')
  const config = fs.readFileSync(file, 'utf8')
  assert.ok(config.endsWith(plugin + '\n[hooks.state."sample"]\ntrusted_hash = "sha256:sample"\n'))
  assert.match(config, /^model="gpt-6\.1-sol"$/m)
  assert.match(config, /^model_reasoning_effort="high"$/m)
  assert.match(config, /^default_permissions="eval"$/m)
  assert.match(config, /^permissions\.eval\.network\.enabled=false$/m)
  assert.match(config, /^permissions\.eval\.filesystem=\{":minimal"="read",/m)
  assert.ok(!config.includes('":root"'))
  assert.ok(config.includes(JSON.stringify(path.join(home, 'plugins/cache/devflow/devflow/0.1.0/skills').replaceAll(String.fromCharCode(92), '/')) + '="read"'))
  assert.ok(config.indexOf('default_permissions=') < config.indexOf('[plugins.'))
  assert.deepEqual(configArgs(), ['--strict-config'])
})

test('retained global instructions stay unchanged and add only the selected file to the read profile', () => {
  const sourceHome = tmpdir('codex-eval-instructions-source-')
  const home = tmpdir('codex-eval-instructions-target-')
  const source = path.join(sourceHome, 'AGENTS.md')
  const body = '# Global Agent Operating Contract\nFixture instructions only.\n'
  fs.writeFileSync(source, body)
  const metadata = retainGlobalInstructions(sourceHome, home)
  assert.match(metadata.hash, /^[a-f0-9]{64}$/)
  assert.equal(fs.readFileSync(path.join(home, 'AGENTS.md'), 'utf8'), body)
  writeEvalConfig(home, { retainGlobalInstructions: true })
  const config = fs.readFileSync(path.join(home, 'config.toml'), 'utf8')
  assert.ok(config.includes(JSON.stringify(source.replaceAll(String.fromCharCode(92), '/')) + '="read"'))
  assert.ok(!config.includes('":root"'))
  assert.ok(!config.includes(body))
  assert.equal(fs.readFileSync(source, 'utf8'), body)
  assert.deepEqual(checkGlobalInstructions(home), { hash: metadata.hash, text: body })
  fs.writeFileSync(source, body + 'Changed instructions.\n')
  assert.throws(() => checkGlobalInstructions(home), /Global instructions changed/)
  fs.writeFileSync(source, body)
  fs.unlinkSync(path.join(home, 'AGENTS.md'))
  assert.equal(fs.readFileSync(source, 'utf8'), body)
  assert.throws(() => retainGlobalInstructions(tmpdir('codex-eval-instructions-missing-'), home))
  assert.equal(parseArgs(['--full', '--retain-global-instructions', '--budget-tokens', '1000']).retainGlobalInstructions, true)
  assert.equal(parseArgs(['--full', '--budget-tokens', '1000']).retainGlobalInstructions, false)
})

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

test('240 trials preserve all 24 prompts and identify ten distinct attempts per case', () => {
  const cases = loadCases(path.join(__dirname, '..', 'evals', 'trigger'))
  const opts = parseArgs(['--full', '--repetitions', '10', '--budget-tokens', '100000000'])
  assert.equal(opts.repetitions, 10)
  const trials = expandCases(cases, opts.repetitions)
  assert.equal(trials.length, 240)
  for (const c of cases) {
    const attempts = trials.filter(trial => trial.id === c.id)
    assert.deepEqual(attempts.map(trial => trial.repetition), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    assert.ok(attempts.every(trial => trial.prompt === c.prompt && trial.promptHash === c.promptHash && trial.policy === c.policy))
  }
  assert.equal(parseArgs(['--full', '--budget-tokens', '1000']).repetitions, 1)
  for (const args of [['--full', '--repetitions', '0'], ['--full', '--repetitions', '1.5'], ['--full', '--repetitions', '1001'], ['--smoke', '--repetitions', '10']]) {
    assert.throws(() => parseArgs([...args, '--budget-tokens', '1000']))
  }
})

test('repeated-run continuation resumes after the recorded prefix without replacing invalid attempts', () => {
  const cases = loadCases(path.join(__dirname, '..', 'evals', 'trigger'))
  const trials = expandCases(cases, 10)
  const recorded = trials.slice(0, 25).map(c => ({ ...c, result: c.repetition === 2 ? 'invalid' : 'pass', tokens: { total_tokens: 10 }, guardMissing: false, spawnFailed: false }))
  const prior = { mode: 'full', repetitions: 10, complete: false, stoppedReason: 'budget', model: 'gpt-6.1-sol', effort: 'high', timeoutSeconds: 300, priorTokens: 0, cases: recorded, summary: { usageKnown: true, totalTokens: 250 }, sourceHash: 'public-snapshot' }
  assert.equal(continuation(prior, trials, 10).cases.length, 25)
  assert.equal(trials[25].repetition, 2)
  assert.notEqual(trials[25].id, trials[24].id)
  assert.throws(() => continuation(prior, trials, 1))
  assert.throws(() => continuation({ ...prior, cases: [...recorded.slice(0, 24), { ...recorded[24], repetition: 1 }] }, trials, 10))
  assert.throws(() => continuation({ ...prior, globalInstructionsRetained: true }, trials, 10, false))
  assert.equal(continuation({ ...prior, globalInstructionsRetained: true }, trials, 10, true).cases.length, 25)
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
