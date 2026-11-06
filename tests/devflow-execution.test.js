'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const tmpdir = require('./tmpdir')
const { runJob, createRunner, isSettledResult, isNotStartedResult, isSettledSuccess } = require('../lib/devflow-execution')
const modulePath = path.resolve(__dirname, '../lib/devflow-execution')
const probe = runJob(process.execPath, ['-e', ''], { timeout: 3000 })
const unavailable = ['unsupported_platform', 'missing_supervisor', 'subreaper_unavailable'].includes(probe.job.reason)
const native = { skip: unavailable && `Native job adapter unavailable: ${probe.job.reason}` }
const gone = pid => assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, `PID ${pid} was reaped`)
const cleanup = result => { if (result.job.artifacts) fs.rmSync(result.job.artifacts.directory, { recursive: true, force: true }) }

// The independent review's minimal counterexamples are deliberately incomplete.
// The mutations below start from valid evidence so each contradiction is tested
// without an unrelated missing field masking it.
test('independent malformed metadata counterexamples cannot pass', () => {
  const cases = [
    { code: 0, job: { version: 1, state: 'settled', outputComplete: true, hasObservedFailure: false } },
    { code: 0, job: { version: 1, adapter: 'unsupported', state: 'settled', outputComplete: true,
      hasObservedFailure: false, launched: false, rootPid: null, rootExit: null } },
    { code: 0, job: { version: 1, adapter: 'linux-subreaper-v1', state: 'settled', outputComplete: true,
      hasObservedFailure: false, launched: true, rootPid: 123, rootExit: { exitCode: 9, signal: null } } },
    { code: 0, job: { version: 1, adapter: 'linux-subreaper-v1', state: 'settled', outputComplete: true,
      hasObservedFailure: false, launched: true, rootPid: 123,
      rootExit: { pid: 123, root: true, exitCode: 0, signal: null }, observedExitCount: 2,
      observedExits: [{ pid: 123, root: true, exitCode: 0, signal: null },
        { pid: 124, root: false, exitCode: 17, signal: null }] } },
  ]
  for (const [index, result] of cases.entries()) {
    assert.equal(isSettledSuccess(result), false, `Independent counterexample ${index + 1}`)
    assert.equal(isSettledResult(result), false, `Independent counterexample ${index + 1} is not a settled result`)
    assert.equal(isNotStartedResult(result), false, `Independent counterexample ${index + 1} is not a pre-launch result`)
  }
})

function successfulReport() {
  const root = { pid: 123, root: true, exitCode: 0, signal: null }
  return { code: 0, job: { version: 1, adapter: 'linux-subreaper-v1', state: 'settled', reason: 'completed',
    launched: true, rootPid: root.pid, rootExit: { ...root }, observedExits: [{ ...root }], observedExitCount: 1,
    outputComplete: true, hasObservedFailure: false } }
}


// Settlement is independent of command success. Check the unmodified root code
// and full lifecycle evidence instead of coercing failures into success inputs.
test('settled-result classification preserves nonzero, signal, descendant failure and output-limit evidence', () => {
  for (const code of [0, 4, 255, 'SIGTERM', 'SIG9']) {
    const result = successfulReport()
    for (const exit of [result.job.rootExit, result.job.observedExits[0]]) {
      exit.exitCode = typeof code === 'number' ? code : null
      exit.signal = typeof code === 'string' ? code : null
    }
    result.code = code
    result.job.hasObservedFailure = code !== 0
    assert.equal(isSettledResult(result), true, `Root result ${code} is finished`)
    assert.equal(isSettledSuccess(result), code === 0)
    assert.equal(isNotStartedResult(result), false)
    for (const mismatch of [undefined, null, 'unknown', code === 0 ? 4 : 0]) {
      assert.equal(isSettledResult({ ...result, code: mismatch }), false, `Root result ${code} cannot report ${mismatch}`)
    }
  }
  const childFailure = successfulReport()
  childFailure.job.observedExits.push({ pid: 124, root: false, exitCode: 17, signal: null })
  childFailure.job.observedExitCount = 2
  childFailure.job.hasObservedFailure = true
  assert.equal(isSettledResult(childFailure), true)
  assert.equal(isSettledSuccess(childFailure), false)

  const limited = successfulReport()
  limited.job.reason = 'output_limit'; limited.job.outputComplete = false
  assert.equal(isSettledResult(limited), true)
  assert.equal(isSettledSuccess(limited), false)
  const unknown = successfulReport()
  unknown.job.state = 'unknown'; unknown.job.reason = 'timeout'; unknown.job.outputComplete = false
  assert.equal(isSettledResult(unknown), false, 'A root exit does not prove descendant completion')
  assert.equal(isNotStartedResult(unknown), false)
  const contradicted = successfulReport()
  contradicted.job.errorCode = 'ENOENT'
  assert.equal(isSettledResult(contradicted), false, 'A finished root cannot also have a failed launch')
  assert.equal(isSettledSuccess(contradicted), false)
})

function notStartedReport(reason = 'launch_failed', code = 'ENOENT') {
  return { code, job: { version: 1, adapter: 'linux-subreaper-v1', state: 'not_started', reason,
    launched: false, rootPid: null, rootExit: null, observedExits: [], observedExitCount: 0,
    hasObservedFailure: false, outputComplete: false, errorCode: code } }
}

test('not-started classification requires complete refusal evidence and the exact error code', () => {
  for (const [reason, code] of [['launch_failed', 'ENOENT'], ['launch_failed', 'EACCES'],
    ['subreaper_unavailable', 'EPERM'], ['supervisor_error', 'ValueError']]) {
    const result = notStartedReport(reason, code)
    assert.equal(isNotStartedResult(result), true, reason)
    assert.equal(isSettledResult(result), false)
    assert.equal(isSettledSuccess(result), false)
  }
  for (const reason of ['missing_supervisor', 'invalid_limits']) {
    const result = notStartedReport(reason, 'NOT_VERIFIED')
    delete result.job.errorCode
    assert.equal(isNotStartedResult(result), true, reason)
  }
  for (const reason of ['unsupported_platform', 'invalid_command']) {
    const result = notStartedReport(reason, 'NOT_VERIFIED')
    result.job.adapter = 'unsupported'; delete result.job.errorCode
    assert.equal(isNotStartedResult(result), true, reason)
    assert.equal(isSettledResult(result), false)
    assert.equal(isSettledSuccess(result), false)
  }
  const mutations = [
    ['missing adapter', r => { delete r.job.adapter }],
    ['fixture adapter', r => { r.job.adapter = 'fixture' }],
    ['unsupported adapter launch error', r => { r.job.adapter = 'unsupported' }],
    ['unsupported protocol', r => { r.job.version = 2 }],
    ['settled state', r => { r.job.state = 'settled' }],
    ['unknown state', r => { r.job.state = 'unknown' }],
    ['launched command', r => { r.job.launched = true }],
    ['unknown launch', r => { r.job.launched = null }],
    ['missing launch', r => { delete r.job.launched }],
    ['root identity exists', r => { r.job.rootPid = 123 }],
    ['missing root identity', r => { delete r.job.rootPid }],
    ['root exit exists', r => { r.job.rootExit = { pid: 123, root: true, exitCode: 0, signal: null } }],
    ['missing root exit', r => { delete r.job.rootExit }],
    ['observed exit', r => { r.job.observedExits.push({ pid: 123, root: true, exitCode: 0, signal: null }); r.job.observedExitCount = 1 }],
    ['missing observations', r => { delete r.job.observedExits }],
    ['inconsistent count', r => { r.job.observedExitCount = 1 }],
    ['missing count', r => { delete r.job.observedExitCount }],
    ['observed failure', r => { r.job.hasObservedFailure = true }],
    ['output claimed complete', r => { r.job.outputComplete = true }],
    ['completed reason', r => { r.job.reason = 'completed' }],
    ['timeout reason', r => { r.job.reason = 'timeout' }],
    ['missing error code', r => { delete r.job.errorCode }],
    ['numeric error code', r => { r.job.errorCode = r.code = 0 }],
    ['empty error code', r => { r.job.errorCode = r.code = '' }],
    ['different result code', r => { r.code = 'EACCES' }],
    ['unknown result code', r => { r.code = 'unknown' }],
    ['zero result code', r => { r.code = 0 }],
    ['refusal with extra error', r => { r.job.reason = 'missing_supervisor'; r.code = 'NOT_VERIFIED' }],
  ]
  for (const [name, mutate] of mutations) {
    const result = notStartedReport()
    mutate(result)
    assert.equal(isNotStartedResult(result), false, name)
  }
  for (const result of [null, {}, { code: 'ENOENT', job: {} }]) assert.equal(isNotStartedResult(result), false)
})

test('pre-launch adapter preparation errors retain their exact code without executing the command', native, () => {
  const root = tmpdir('execution-preparation-'), marker = path.join(root, 'started')
  const result = runJob(process.execPath, ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'unsafe')`],
    { cwd: root, timeout: 3000, input: {} })
  assert.equal(result.job.state, 'not_started')
  assert.equal(result.job.reason, 'supervisor_error')
  assert.equal(result.code, 'ERR_INVALID_ARG_TYPE')
  assert.equal(result.job.errorCode, result.code)
  assert.equal(isNotStartedResult(result), true)
  assert.equal(isSettledResult(result), false)
  assert.equal(isSettledSuccess(result), false)
  assert.equal(fs.existsSync(marker), false)
  assert.equal(result.job.artifacts, undefined)
})

test('success requires consistent supported adapter, root identity and every reported exit', () => {
  const healthy = successfulReport()
  assert.equal(isSettledSuccess(healthy), true)
  healthy.job.observedExits.push({ pid: 124, root: false, exitCode: 0, signal: null })
  healthy.job.observedExitCount++
  assert.equal(isSettledSuccess(healthy), true)
  for (const malformed of [null, undefined, {}, { code: 0 }, { code: 0, job: null }, { code: 0, job: [] }]) {
    assert.equal(isSettledSuccess(malformed), false)
  }
  const cases = [
    ['wrong version', r => { r.job.version = 2 }],
    ['missing adapter', r => { delete r.job.adapter }],
    ['unsupported adapter', r => { r.job.adapter = 'fixture' }],
    ['unlaunched', r => { r.job.launched = false }],
    ['missing launch evidence', r => { delete r.job.launched }],
    ['unresolved state', r => { r.job.state = 'unknown' }],
    ['timeout contradicts settlement', r => { r.job.reason = 'timeout' }],
    ['missing reason', r => { delete r.job.reason }],
    ['invalid root PID', r => { r.job.rootPid = 0 }],
    ['fractional root PID', r => { r.job.rootPid = 123.5 }],
    ['missing root exit', r => { r.job.rootExit = null }],
    ['root exit PID mismatch', r => { r.job.rootExit.pid = 125 }],
    ['root exit role mismatch', r => { r.job.rootExit.root = false }],
    ['root observation mismatch', r => { r.job.observedExits[0].pid = 125 }],
    ['root observation missing', r => { r.job.observedExits.shift(); r.job.observedExitCount-- }],
    ['duplicate root observation', r => { r.job.observedExits.push({ ...r.job.rootExit }); r.job.observedExitCount++ }],
    ['child impersonates root', r => { r.job.observedExits[1].pid = r.job.rootPid }],
    ['invalid child PID', r => { r.job.observedExits[1].pid = -1 }],
    ['invalid child role', r => { r.job.observedExits[1].root = 0 }],
    ['failed root despite zero result', r => {
      r.job.rootExit.exitCode = r.job.observedExits[0].exitCode = 9; r.job.hasObservedFailure = true
    }],
    ['root failure flag contradicted', r => { r.job.rootExit.exitCode = r.job.observedExits[0].exitCode = 9 }],
    ['root signal and exit simultaneously', r => { r.job.rootExit.signal = r.job.observedExits[0].signal = 'SIGTERM' }],
    ['signalled root despite zero result', r => {
      r.job.rootExit.exitCode = r.job.observedExits[0].exitCode = null
      r.job.rootExit.signal = r.job.observedExits[0].signal = 'SIGTERM'; r.job.hasObservedFailure = true
    }],
    ['failed child flag contradicted', r => { r.job.observedExits[1].exitCode = 17 }],
    ['signalled child flag contradicted', r => {
      r.job.observedExits[1].exitCode = null; r.job.observedExits[1].signal = 'SIGTERM'
    }],
    ['observed failure', r => { r.job.observedExits[1].exitCode = 17; r.job.hasObservedFailure = true }],
    ['invalid child exit code', r => { r.job.observedExits[1].exitCode = 256 }],
    ['missing signal field', r => { delete r.job.observedExits[1].signal }],
    ['failure summary contradicts complete records', r => { r.job.hasObservedFailure = true }],
    ['missing failure summary', r => { delete r.job.hasObservedFailure }],
    ['missing observations', r => { delete r.job.observedExits }],
    ['empty observations', r => { r.job.observedExits = []; r.job.observedExitCount = 0 }],
    ['malformed observation', r => { r.job.observedExits[1] = null }],
    ['sparse observations', r => { delete r.job.observedExits[1] }],
    ['missing exit count', r => { delete r.job.observedExitCount }],
    ['exit count below observations', r => { r.job.observedExitCount = 1 }],
    ['missing exit below summary limit', r => { r.job.observedExitCount = 3 }],
    ['fractional exit count', r => { r.job.observedExitCount = 2.5 }],
    ['incomplete output', r => { r.job.outputComplete = false }],
    ['nonzero result code', r => { r.code = 9 }],
    ['coerced result code', r => { r.code = '0' }],
  ]
  for (const [label, mutate] of cases) {
    const result = structuredClone(healthy)
    mutate(result)
    assert.equal(isSettledSuccess(result), false, label)
  }
})

test('bounded exit summaries preserve late root evidence and the all-exits failure flag', () => {
  const result = successfulReport()
  result.job.observedExits = Array.from({ length: 4096 }, (_, index) => ({ pid: 1000 + index, root: false, exitCode: 0, signal: null }))
  result.job.observedExitCount = 4097
  // The root exited after the first 4096 exits; its separately recorded status
  // and the supervisor's all-exits failure summary remain required.
  assert.equal(isSettledSuccess(result), true)
  result.job.hasObservedFailure = true
  assert.equal(isSettledSuccess(result), false)
  result.job.hasObservedFailure = false
  result.job.observedExitCount = 4096
  assert.equal(isSettledSuccess(result), false, 'A complete summary must include the root exit')
  result.job.observedExitCount = 4097
  result.job.rootExit.exitCode = 9
  assert.equal(isSettledSuccess(result), false, 'An omitted failed root cannot be accepted')
})

test('healthy native supervisor evidence satisfies the success predicate', native, () => {
  assert.equal(probe.job.state, 'settled')
  assert.equal(isSettledSuccess(probe), true)
  assert.equal(isSettledResult(probe), true)
  assert.equal(isNotStartedResult(probe), false)
  assert.equal(probe.job.rootExit.pid, probe.job.rootPid)
  assert.deepEqual(probe.job.observedExits.find(exit => exit.root), probe.job.rootExit)
  gone(probe.job.rootPid)
})

for (const platform of ['win32', 'darwin', 'freebsd']) {
  test(`${platform} refuses before launch rather than accepting a parent-only exit`, () => {
    const root = tmpdir('execution-unavailable-'), marker = path.join(root, 'started')
    const result = createRunner({ platform })(process.execPath,
      ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'unsafe')`], { cwd: root })
    assert.equal(result.code, 'NOT_VERIFIED')
    assert.equal(result.job.state, 'not_started')
    assert.equal(result.job.reason, 'unsupported_platform')
    assert.equal(isNotStartedResult(result), true)
    assert.equal(isSettledResult(result), false)
    assert.equal(fs.existsSync(marker), false)
    assert.equal(isSettledSuccess(result), false)
  })
}

test('missing Python capability refuses before launch', () => {
  const result = createRunner({ platform: 'linux', pythonCandidates: [] })(process.execPath, ['-e', 'process.exit(0)'])
  assert.equal(result.code, 'NOT_VERIFIED')
  assert.equal(result.job.reason, 'missing_supervisor')
  assert.equal(isNotStartedResult(result), true)
  assert.equal(isSettledResult(result), false)
  assert.equal(result.job.state, 'not_started')
})

test('foreground completion keeps exact argv, cwd and binary stdout/stderr', native, () => {
  const root = tmpdir('execution argv ')
  const input = Buffer.from([0, 255, 13, 10, 65])
  const args = ['-e', `const fs=require('node:fs');process.stdout.write(fs.readFileSync(0));process.stderr.write(Buffer.from([254,0,13,10]));fs.writeFileSync('args.json',JSON.stringify(process.argv.slice(1)))`,
    'literal $(touch MUST_NOT_EXIST)', 'a;b', 'quote" newline\n tail']
  const result = runJob(process.execPath, args, { cwd: root, input, timeout: 3000 })
  assert.equal(result.code, 0)
  assert.equal(result.job.state, 'settled')
  assert.equal(isSettledSuccess(result), true)
  assert.deepEqual(result.job.command, { file: process.execPath, args, cwd: root })
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'args.json'))), args.slice(2))
  assert.equal(fs.existsSync(path.join(root, 'MUST_NOT_EXIST')), false)
  assert.deepEqual(Buffer.from(result.stdoutBase64, 'base64'), input)
  assert.deepEqual(Buffer.from(result.stderrBase64, 'base64'), Buffer.from([254, 0, 13, 10]))
  assert.equal(result.job.artifacts, undefined)
  gone(result.job.rootPid)
})

test('isolated supervisor ignores candidate Python modules while preserving command environment', native, () => {
  const root = tmpdir('execution-isolated-')
  fs.writeFileSync(path.join(root, 'ctypes.py'), 'raise RuntimeError("candidate module loaded")\n')
  const result = runJob(process.execPath, ['-e', 'process.stdout.write(process.env.DEVFLOW_EXECUTION_VALUE)'], {
    cwd: root, timeout: 3000, env: { ...process.env, PYTHONPATH: root, DEVFLOW_EXECUTION_VALUE: 'kept' },
  })
  assert.equal(isSettledSuccess(result), true)
  assert.equal(result.stdout, 'kept')
})

test('failed launch, finished nonzero and signalled root remain distinct', native, () => {
  const root = tmpdir('execution-status-')
  const missing = runJob(path.join(root, 'nonexistent-executable'), [], { cwd: root, timeout: 3000 })
  assert.equal(missing.job.state, 'not_started')
  assert.equal(missing.job.launched, false)
  assert.equal(missing.job.reason, 'launch_failed')
  assert.equal(missing.code, 'ENOENT')
  assert.equal(missing.job.artifacts, undefined)
  assert.equal(isNotStartedResult(missing), true)
  assert.equal(isSettledResult(missing), false)
  const nonzero = runJob(process.execPath, ['-e', 'process.exit(7)'], { timeout: 3000 })
  assert.equal(nonzero.job.state, 'settled')
  assert.equal(nonzero.code, 7)
  assert.equal(nonzero.job.hasObservedFailure, true)
  const signalled = runJob(process.execPath, ['-e', 'process.kill(process.pid,"SIGTERM")'], { timeout: 3000 })
  assert.equal(signalled.job.state, 'settled')
  assert.equal(signalled.code, 'SIGTERM')
  assert.equal(signalled.job.rootExit.exitCode, null)
  for (const result of [missing, nonzero, signalled]) assert.equal(isSettledSuccess(result), false)
  for (const result of [nonzero, signalled]) {
    assert.equal(isSettledResult(result), true)
    assert.equal(isNotStartedResult(result), false)
  }
  gone(nonzero.job.rootPid); gone(signalled.job.rootPid)
})

test('detached ignored-stdio child must finish its candidate mutation before a settled result', native, () => {
  const root = tmpdir('execution-late-write-')
  fs.writeFileSync(path.join(root, 'candidate.txt'), 'original\n')
  const child = `setTimeout(()=>{require('node:fs').writeFileSync('candidate.txt','late mutation\\n');process.stdout.write('child settled\\n')},250)`
  const parent = `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{detached:true,stdio:'ignore'});require('node:fs').writeFileSync('child.pid',String(c.pid));c.unref();process.stdout.write('parent done\\n')`
  const result = runJob(process.execPath, ['-e', parent], { cwd: root, timeout: 3000 })
  assert.equal(result.code, 0)
  assert.equal(result.job.state, 'settled')
  assert.equal(fs.readFileSync(path.join(root, 'candidate.txt'), 'utf8'), 'late mutation\n')
  assert.equal(result.stdout, 'parent done\n')
  const pid = Number(fs.readFileSync(path.join(root, 'child.pid')))
  assert.equal(result.job.observedExits.some(exit => exit.pid === pid && exit.exitCode === 0), true)
  gone(pid); gone(result.job.rootPid)
})

test('double-forked ignored-stdio grandchildren are adopted and a failed child cannot produce success', native, () => {
  const root = tmpdir('execution-double-fork-')
  const grandchild = `setTimeout(()=>require('node:fs').writeFileSync('grandchild.done','done'),250)`
  const child = `const g=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{detached:true,stdio:'ignore'});require('node:fs').writeFileSync('grandchild.pid',String(g.pid));g.unref();process.exitCode=9`
  const parent = `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{detached:true,stdio:'ignore'});require('node:fs').writeFileSync('child.pid',String(c.pid));c.unref()`
  const result = runJob(process.execPath, ['-e', parent], { cwd: root, timeout: 3000 })
  assert.equal(result.code, 0, 'root exit is retained separately from descendant failure')
  assert.equal(result.job.state, 'settled')
  assert.equal(result.job.hasObservedFailure, true)
  assert.equal(isSettledResult(result), true)
  assert.equal(isSettledSuccess(result), false)
  assert.equal(fs.readFileSync(path.join(root, 'grandchild.done'), 'utf8'), 'done')
  const pid = Number(fs.readFileSync(path.join(root, 'child.pid')))
  const grandPid = Number(fs.readFileSync(path.join(root, 'grandchild.pid')))
  assert.equal(result.job.observedExits.some(exit => exit.pid === pid && exit.exitCode === 9), true)
  assert.equal(result.job.observedExits.some(exit => exit.pid === grandPid && exit.exitCode === 0), true)
  for (const exit of result.job.observedExits) gone(exit.pid)
})

// An outer supported job owns the deliberately unfinished inner timeout fixture.
// It reaps that fixture after natural completion, avoiding orphaned test jobs.
function timedOutFixture(root, parent) {
  const nested = `const {runJob}=require(${JSON.stringify(modulePath)});const r=runJob(process.execPath,['-e',${JSON.stringify(parent)}],{cwd:${JSON.stringify(root)},timeout:175});let rootAlive=false;try{process.kill(r.job.rootPid,0);rootAlive=true}catch{};console.log(JSON.stringify({result:r,rootAlive,lateExists:require('node:fs').existsSync(${JSON.stringify(path.join(root, 'late.done'))})}))`
  const outer = runJob(process.execPath, ['-e', nested], { cwd: root, timeout: 5000 })
  assert.equal(isSettledSuccess(outer), true)
  const observed = JSON.parse(outer.stdout)
  for (const exit of outer.job.observedExits) gone(exit.pid)
  return observed
}

test('timeout preserves root exit zero as unknown and lets the detached child finish without signals', native, () => {
  const root = tmpdir('execution-timeout-child-')
  const child = `setTimeout(()=>{require('node:fs').writeFileSync('late.done','natural completion');process.stdout.write('late output\\n')},500)`
  const parent = `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{detached:true,stdio:['ignore','inherit','inherit']});require('node:fs').writeFileSync('child.pid',String(c.pid));c.unref()`
  const observed = timedOutFixture(root, parent), result = observed.result
  try {
    assert.equal(result.code, 0)
    assert.equal(result.job.state, 'unknown')
    assert.equal(result.job.reason, 'timeout')
    assert.equal(isSettledResult(result), false)
    assert.equal(isNotStartedResult(result), false)
    assert.equal(result.job.outputComplete, false)
    assert.equal(isSettledSuccess(result), false)
    assert.equal(observed.lateExists, false, 'inner result returns before the child finishes')
    assert.equal(fs.readFileSync(path.join(root, 'late.done'), 'utf8'), 'natural completion')
    assert.equal(fs.readFileSync(result.job.artifacts.stdoutPath, 'utf8'), 'late output\n')
    assert.equal(fs.existsSync(path.join(result.job.artifacts.directory, 'stdin.bin')), false)
    gone(Number(fs.readFileSync(path.join(root, 'child.pid'))))
  } finally { cleanup(result) }
})

test('timeout while the root is alive never invents an exit code', native, () => {
  const root = tmpdir('execution-timeout-root-')
  const observed = timedOutFixture(root, `setTimeout(()=>require('node:fs').writeFileSync('late.done','done'),500)`)
  try {
    assert.equal(observed.result.code, 'unknown')
    assert.equal(observed.result.job.rootExit, null)
    assert.equal(observed.result.job.state, 'unknown')
    assert.equal(isSettledResult(observed.result), false)
    assert.equal(isNotStartedResult(observed.result), false)
    assert.equal(observed.rootAlive, true)
    assert.equal(observed.lateExists, false)
    gone(observed.result.job.rootPid)
  } finally { cleanup(observed.result) }
})

test('output limits retain exact raw files and cannot produce a successful verification', native, () => {
  const result = runJob(process.execPath, ['-e', 'process.stdout.write("x".repeat(512))'], { timeout: 3000, maxBuffer: 32 })
  try {
    assert.equal(result.code, 0)
    assert.equal(result.job.state, 'settled')
    assert.equal(result.job.reason, 'output_limit')
    assert.equal(isSettledResult(result), true)
    assert.equal(isNotStartedResult(result), false)
    assert.equal(result.job.outputComplete, false)
    assert.equal(isSettledSuccess(result), false)
    assert.equal(result.stdout, 'x'.repeat(32))
    assert.equal(fs.readFileSync(result.job.artifacts.stdoutPath, 'utf8'), 'x'.repeat(512))
    gone(result.job.rootPid)
  } finally { cleanup(result) }
})
