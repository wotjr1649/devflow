'use strict'
// Legacy writer isolation, rollback continuity and lock exclusivity.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const tmpdir = require('./tmpdir')
const state = require('../bin/devflow-state')
const oldState = require('./fixtures/v1/bin/devflow-state')
const oldHook = require('./fixtures/v1/hooks/devflow-hook.js')
const v2 = state.v2, deps = state.v2deps()
const { ok, refs, all, fixture, ghWrites, at, wholeTask, liveJob } = require('./fixtures/devflow-v2')

test('migration preserves active semantics; archived v1 mode/update/check/comment/hook cannot cross the isolated writer fence', () => {
  const legacy = { stage: 'build', path: 'bounded', mode: 'autonomous', modeChanged: { session: 'old' },
    blocked: ['dependency'], decisions: ['scope decision'], notes: ['private note'], followups: [{ issue: 9 }], task: { current: 1, total: 3 } }
  const f = fixture({ legacy, activate: false })
  const originalBytes = fs.readFileSync(path.join(f.root, '.work/devflow/i1/ledger.json'))
  assert.throws(() => f.init({ delivery: { id: 'delivery-1', criteria: refs('a') } }), /explicit recovered/)
  assert.throws(() => f.init({ recoveryReason: 'Recover state.' }), /recoveredTask/)
  f.init({ recoveryReason: 'Recover exact approved base and selected scope.', recoveredTask: { id: 'old-task', current: 1, total: 3, baseOid: f.original, ...wholeTask('a') } })
  const value = f.read()
  for (const key of ['blocked', 'decisions', 'notes', 'followups']) assert.deepEqual(value[key], legacy[key])
  assert.equal(value.task.status, 'open'); assert.equal(value.stage, 'build')
  assert.deepEqual(fs.readFileSync(path.join(v2.dir(f.root, 1), 'legacy-ledger.json')), originalBytes)
  const canonical = fs.readFileSync(path.join(v2.dir(f.root, 1), 'ledger.json'))
  for (const [argv, text] of [[['mode', '1', 'interactive'], ''], [['ledger-update', '1'], '{"stage":"done"}'],
    [['check', '1', '1'], ''], [['comment', '1'], '### Checkpoint build — old writer\n- blocked']]) {
    let result
    try { result = oldState.main(argv, () => text, f.env, f.root) }
    catch (error) { result = { code: 1, out: error.message } }
    assert.notEqual(result.code, 0, JSON.stringify(argv) + ': ' + result.out)
  }
  assert.equal(oldHook.handle(JSON.stringify({ hook_event_name: 'Stop', cwd: f.root, session_id: 'v2-owner' }), f.env), '')
  assert.equal(ghWrites(f).length, 0)
  assert.deepEqual(fs.readFileSync(path.join(v2.dir(f.root, 1), 'ledger.json')), canonical)
  assert.equal(fs.lstatSync(path.join(f.root, '.work/devflow/i1/ledger.json')).isDirectory(), true)
  // A generic old atomic rename writer fails at the directory fence as well.
  assert.throws(() => oldState.writeLedger(f.root, 1, { mode: 'interactive' }))
})

test('quiescent rollback restores exact old bytes and archives all v2 history; unexpected paths are never overwritten', () => {
  const f = fixture({ legacy: { stage: 'build', notes: ['retain'] } })
  const backup = fs.readFileSync(path.join(v2.dir(f.root, 1), 'legacy-ledger.json'))
  v2.appendNote(f.ctx(), 1, 'v2 history retained in archive')
  const done = v2.rollback(f.ctx(), 1, { expected: f.expected(), quiescent: true, reason: 'Explicitly return to stopped legacy toolchain.' }, deps)
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.work/devflow/i1/ledger.json')), backup)
  assert.ok(fs.existsSync(path.join(done.archive, 'ledger.json')))
  assert.equal(v2.managed(f.root, 1), false)
  const g = fixture()
  fs.writeFileSync(path.join(g.root, '.work/devflow/i1/ledger.json', 'unexpected'), 'user bytes')
  assert.throws(() => v2.rollback(g.ctx(), 1, { expected: g.expected(), quiescent: true, reason: 'rollback' }, deps), /unexpected|gate/)
  assert.equal(fs.readFileSync(path.join(g.root, '.work/devflow/i1/ledger.json/unexpected'), 'utf8'), 'user bytes')
})

test('RUNTIME-04 rollback and reactivation preserve exhausted goal budget and its explicitly extended limit', liveJob, () => {
  const f = fixture({ legacy: { stage: 'build', budget: { limit: 2, used: 0 } }, budgetLimit: 2 })
  f.verify(); f.verify()
  assert.throws(() => f.verify(), /budget exhausted/)
  const rollback = () => v2.rollback(f.ctx(), 1, { expected: f.expected(), quiescent: true, reason: 'Quiescent toolchain recovery; preserve the same goal budget.' }, deps)
  for (let i = 0; i < 2; i++) {
    const archived = rollback()
    assert.equal(JSON.parse(fs.readFileSync(path.join(archived.archive, 'ledger.json'))).budget.used, 2)
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, '.work/devflow/i1/ledger.json'))).budget.used, 0)
    assert.throws(() => f.init({ budgetLimit: 20, recoveryReason: 'Recover original delivery.' }), /cannot change an existing goal budget limit/)
    f.init({ recoveryReason: 'Recover original delivery and retained cumulative budget.' })
    assert.equal(f.read().budget.used, 2); assert.equal(f.read().budget.limit, 2)
    assert.throws(() => f.verify(), /budget exhausted/)
  }
  f.control('budget-extend', { limit: 3, reason: 'Owner explicitly approved one more counted attempt.' })
  assert.equal(f.verify().proof.result, 'passed')
  rollback()
  f.init({ budgetLimit: 3, recoveryReason: 'Recover the explicitly extended budget.' })
  assert.equal(f.read().budget.used, 3); assert.equal(f.read().budget.limit, 3)
  assert.throws(() => f.verify(), /budget exhausted/)
  rollback()
  const continuity = JSON.parse(fs.readFileSync(path.join(f.root, '.work/devflow-v2-continuity/i1.json')))
  fs.appendFileSync(path.join(f.root, '.work/devflow-v2-archive', continuity.archive, 'ledger.json'), ' ')
  assert.throws(() => f.init({ budgetLimit: 3, recoveryReason: 'Cannot prove the changed archive.' }), /continuity cannot be verified/)
})

test('an old-mtime v2 holder remains exclusive against two real-process contenders', { timeout: 15000 }, async () => {
  const f = fixture()
  const p = path.join(v2.dir(f.root, 1), 'control.lock')
  const signal = path.join(f.root, '.work', 'holder-ready'), release = signal + '-release'
  const script = `const fs=require('node:fs');const v=require(${JSON.stringify(path.resolve(__dirname, '../lib/devflow-state-v2.js'))});v.lock(${JSON.stringify(f.root)},1,()=>{fs.writeFileSync(${JSON.stringify(signal)},'ready');const end=Date.now()+10000;while(!fs.existsSync(${JSON.stringify(release)})){if(Date.now()>end)process.exit(8);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10)}})`
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject) })
  try {
    const end = Date.now() + 5000
    while (!fs.existsSync(signal)) { assert.ok(Date.now() < end); await new Promise(r => setTimeout(r, 10)) }
    const old = (Date.now() - 20000) / 1000; fs.utimesSync(p, old, old)
    const contender = `const v=require(${JSON.stringify(path.resolve(__dirname, '../lib/devflow-state-v2.js'))});try{v.lock(${JSON.stringify(f.root)},1,()=>process.exit(9),0)}catch(e){process.exit(/busy/.test(e.message)?0:1)}`
    const children = [0, 1].map(() => spawn(process.execPath, ['-e', contender], { stdio: 'ignore' }))
    const codes = await Promise.all(children.map(c => new Promise((resolve, reject) => { c.once('exit', resolve); c.once('error', reject) })))
    assert.deepEqual(codes, [0, 0]); assert.equal(fs.existsSync(p), true)
  } finally { fs.writeFileSync(release, 'release'); await exited }
  assert.equal(fs.existsSync(p), false)
})
