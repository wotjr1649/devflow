'use strict'
// Task, delivery, work-unit and integration acceptance scope.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const tmpdir = require('./tmpdir')
const state = require('../bin/devflow-state')
const v2 = state.v2, deps = state.v2deps()
const { ok, refs, all, body, fixture, ghWrites, at, nodeCommand, local, wholeTask, liveJob, complete } = require('./fixtures/devflow-v2')

test('task base advances while the delivery review base persists across tasks, commits and explicit rebaseline', liveJob, () => {
  const f = fixture()
  f.control('task-start', { id: 'task-1', current: 1, total: 2, ...wholeTask('a') })
  assert.equal(f.read().task.baseOid, f.original)
  // Normal build -> verification happens before committing; raw dirty inputs are bound to this task proof.
  fs.writeFileSync(path.join(f.root, 'candidate.txt'), 'task one dirty\n')
  const p1 = f.verify('task', refs('a')).proof
  assert.equal(p1.result, 'passed')
  assert.throws(() => f.effect('check', { criteria: refs('a'), evidenceIds: [p1.id] }), /clean committed|scope/)
  f.control('task-complete', { evidenceIds: [p1.id] })
  const head1 = f.committed('task one dirty\n')
  f.control('task-start', { id: 'task-2', current: 2, total: 2, ...wholeTask('b') })
  assert.equal(f.read().task.baseOid, head1)
  assert.equal(f.read().delivery.reviewBaseOid, f.original)
  f.committed('task two\n')
  const p2 = f.verify('task', refs('b')).proof
  f.control('task-complete', { evidenceIds: [p2.id] })
  assert.throws(() => f.control('delivery-complete', { evidenceIds: [p2.id], impactAnalysis: 'task only' }), /scope/)
  const delivery = f.verify().proof
  assert.equal(delivery.subject.reviewBaseOid, f.original)
  assert.equal(delivery.subject.reviewBaseOid, f.original)
  assert.equal(JSON.parse(fs.readFileSync(path.join(v2.dir(f.root, 1), delivery.inputArtifact.path))).reviewManifest.baseOid, f.original)
  f.control('delivery-complete', { evidenceIds: [delivery.id], impactAnalysis: 'Both task changes reviewed cumulatively.' })
  const used = f.read().budget.used
  f.control('rebaseline', { reviewBaseOid: head1, reason: 'User accepted new baseline after inspecting cumulative changes.' })
  assert.equal(f.read().delivery.originalBaseOid, f.original)
  assert.equal(f.read().delivery.reviewBaseOid, head1)
  assert.equal(f.read().delivery.baselineEpoch, 2)
  assert.equal(f.read().budget.used, used)
  assert.throws(() => f.effect('check', { criteria: refs('a'), evidenceIds: [delivery.id] }), /stale/)
})

test('selected two-of-five delivery completes and checks by stable ID while Issue stays open; close needs whole-Issue proof', liveJob, () => {
  const f = fixture()
  f.committed('accepted source candidate\n')
  const proof = complete(f)
  f.effect('check', { criteria: refs('a', 'b'), evidenceIds: [proof.id] })
  assert.equal(f.read().delivery.status, 'complete')
  assert.equal(f.issue.state, 'OPEN')
  assert.equal(f.intent().criteria.filter(c => c.checked).length, 2)
  assert.throws(() => f.effect('close', { evidenceIds: [proof.id] }), /every current criterion/)
  const whole = f.verify('issue', all).proof
  f.effect('check', { criteria: refs('c', 'd', 'e'), scope: 'issue', evidenceIds: [whole.id] })
  assert.throws(() => f.effect('close', { evidenceIds: [proof.id] }), /scope/)
  assert.throws(() => f.effect('close', { evidenceIds: [whole.id] }), /scope/)
  const target = tmpdir('devflow-v2-main-')
  f.git('worktree', 'add', target, 'main')
  at(target, 'merge', '--no-ff', 'feat/1-x', '-m', 'observed integration')
  const integration = f.verify('integration', all, { targetWorktreeRoot: target }).proof
  assert.notEqual(integration.subject.headOid, whole.subject.headOid)
  assert.equal(f.effect('close', { evidenceIds: [integration.id] }).confirmed, true)
  assert.equal(f.issue.state, 'CLOSED')
  assert.ok(f.read().issueClosed)
})

test('RUNTIME-01 delivery acceptance cannot expand through task checks or wider regression execution', liveJob, () => {
  const f = fixture()
  const task = { id: 'explicit-task', current: 1, total: 1, ...wholeTask('a') }
  assert.throws(() => f.control('task-start', { ...task, checks: undefined }), /checks/)
  assert.throws(() => f.control('task-start', { ...task, contributesTo: undefined }), /criteria/)
  assert.throws(() => f.control('task-start', { ...task, contributesTo: refs('c') }), /outside the selected delivery/)
  const invalid = f.cli(['verify-run', '1'], { expected: f.expected(), scope: 'delivery', criteria: all, command: nodeCommand('process.exit(0)') })
  assert.equal(invalid.code, 1); assert.match(invalid.out, /outside the selected delivery/)
  assert.equal(f.read().budget.used, 0)
  f.control('task-start', task)
  const taskProof = f.verify('task', refs('a')).proof
  f.control('task-complete', { evidenceIds: [taskProof.id] })
  const proof = f.verify('delivery', refs('a', 'b'), { regressionCriteria: refs('c', 'd', 'e') }).proof
  assert.deepEqual(proof.criteria, refs('a', 'b'))
  assert.deepEqual(proof.regressionCriteria, refs('c', 'd', 'e'))
  f.control('delivery-complete', { evidenceIds: [proof.id], regressionCriteria: refs('c', 'd', 'e'), impactAnalysis: 'Selected acceptance plus wider regression checks executed.' })
  const denied = f.cli(['check', '1'], { expected: f.expected(), observedIntentRevision: f.intent().revision, criteria: all, evidenceIds: [proof.id] })
  assert.equal(denied.code, 1); assert.match(denied.out, /outside the selected delivery/)
  assert.equal(ghWrites(f).length, 0)
  f.effect('check', { criteria: refs('a', 'b'), evidenceIds: [proof.id] })
  assert.deepEqual(f.intent().criteria.filter(c => c.checked).map(c => c.id), ['a', 'b'])
  assert.deepEqual(f.read().delivery.criteria, refs('a', 'b'))
  assert.equal(f.read().delivery.version, 1)
  const whole = f.verify('issue', refs('c')).proof
  f.effect('check', { scope: 'issue', criteria: refs('c'), evidenceIds: [whole.id] })
  assert.equal(f.intent().criteria.find(c => c.id === 'c').checked, true)
})

test('task-local checks prove a storage contribution without claiming the later end-to-end Issue criterion', liveJob, () => {
  const f = fixture({ activate: false, selected: refs('a') })
  f.issue.body = body().replace('requirement a', 'Storage and UI preserve the same value end to end')
  f.init()
  f.control('task-start', { id: 'storage', current: 1, total: 2,
    checks: local('saved', 'Storage round-trips a value'), contributesTo: refs('a') })
  fs.writeFileSync(path.join(f.root, 'storage.js'), 'exports.save = value => JSON.stringify({ value });\n')
  const storage = f.verify('task', refs('saved'), { command: nodeCommand('require("node:assert/strict").equal(JSON.parse(require("./storage").save("value")).value,"value")') }).proof
  assert.equal(storage.result, 'passed')
  assert.deepEqual(storage.contributesTo, refs('a'))
  assert.throws(() => f.effect('check', { criteria: refs('a'), evidenceIds: [storage.id] }), /scope/)
  f.control('task-complete', { evidenceIds: [storage.id] })
  f.git('add', 'storage.js'); f.git('commit', '-qm', 'storage contribution')
  const endToEnd = nodeCommand('require("node:assert/strict").equal(require("./ui").roundTrip("value"),"value")')
  const partial = f.verify('delivery', refs('a'), { command: endToEnd }).proof
  assert.equal(partial.result, 'failed')
  assert.throws(() => f.control('delivery-complete', { evidenceIds: [partial.id], impactAnalysis: 'UI remains absent.' }), /failed|stale/)
  assert.equal(f.intent().criteria.find(c => c.id === 'a').checked, false)
  f.control('task-start', { id: 'ui', current: 2, total: 2,
    checks: local('rendered', 'UI restores the saved value'), contributesTo: refs('a') })
  fs.writeFileSync(path.join(f.root, 'ui.js'), 'exports.roundTrip = value => JSON.parse(require("./storage").save(value)).value;\n')
  const ui = f.verify('task', refs('rendered'), { command: endToEnd }).proof
  assert.equal(ui.result, 'passed')
  f.control('task-complete', { evidenceIds: [ui.id] })
  f.git('add', 'ui.js'); f.git('commit', '-qm', 'UI contribution')
  const aggregate = f.verify('delivery', refs('a'), { command: endToEnd }).proof
  f.control('delivery-complete', { evidenceIds: [aggregate.id], impactAnalysis: 'Storage and UI checked together; unrelated criteria remain open.' })
  f.effect('check', { criteria: refs('a'), evidenceIds: [aggregate.id] })
  assert.equal(f.intent().criteria.filter(c => c.checked).length, 1)
  assert.equal(f.issue.state, 'OPEN')
})

test('M3 binds two concurrently running work units, reviews each result and verifies their serially integrated batch', liveJob, async () => {
  const f = fixture({ selected: refs('a') })
  f.control('update', { patch: { runMode: 'M3' } })
  f.control('task-start', { id: 'batch', current: 1, total: 1, kind: 'integration-batch',
    checks: local('combined', 'Both files are present together'), contributesTo: refs('a') })
  const left = tmpdir('devflow-v2-left-'), right = tmpdir('devflow-v2-right-'), third = tmpdir('devflow-v2-third-')
  f.git('worktree', 'add', '-b', 'unit-left', left, f.original)
  f.git('worktree', 'add', '-b', 'unit-right', right, f.original)
  f.git('worktree', 'add', '-b', 'unit-third', third, f.original)
  const register = (id, root, file) => f.control('running-add', { id, label: id, worktreeRoot: root,
    baseOid: f.original, assignedPaths: [file], checks: local('written', 'Assigned file contains its result') })
  register('left', left, 'left.txt'); register('right', right, 'right.txt')
  assert.equal(f.read().running.length, 2)
  assert.throws(() => register('overlap', third, 'left.txt'), /overlap/)
  assert.throws(() => f.control('running-add', { id: 'unbound', label: 'unbound writer' }), /writers need/)
  const coordination = tmpdir('devflow-v2-barrier-')
  const worker = 'const fs=require("node:fs");const [file,ready,peer,value]=process.argv.slice(1);fs.writeFileSync(ready,String(Date.now()));let attempts=0;const t=setInterval(()=>{if(fs.existsSync(peer)){fs.writeFileSync(file,value);clearInterval(t)}else if(++attempts>1000){clearInterval(t);process.exitCode=9}},10)'
  const launch = (root, file, ready, peer) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', worker, file, ready, peer, file], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { child.kill(); reject(new Error('parallel fixture did not exit')) }, 15000)
    child.once('error', e => { clearTimeout(timer); reject(e) })
    child.once('close', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error('worker exit ' + code)) })
  })
  const a = path.join(coordination, 'a'), b = path.join(coordination, 'b')
  await Promise.all([launch(left, 'left.txt', a, b), launch(right, 'right.txt', b, a)])
  assert.ok(fs.existsSync(a) && fs.existsSync(b))
  at(left, 'add', 'left.txt'); at(left, 'commit', '-qm', 'left result')
  at(right, 'add', 'right.txt'); at(right, 'commit', '-qm', 'right result')
  const command = file => nodeCommand(`require("node:assert/strict").equal(require("node:fs").readFileSync(${JSON.stringify(file)},"utf8"),${JSON.stringify(file)})`)
  const leftProof = f.verify('work-unit', refs('written'), { unitId: 'left', command: command('left.txt') }).proof
  const rightProof = f.verify('work-unit', refs('written'), { unitId: 'right', command: command('right.txt') }).proof
  assert.throws(() => f.control('running-done', { id: 'left', exitConfirmed: true, result: 'Returned.', evidenceIds: [rightProof.id] }), /belong to this work unit/)
  f.control('running-done', { id: 'left', exitConfirmed: true, result: 'Left command and child exited.', evidenceIds: [leftProof.id] })
  f.control('running-done', { id: 'right', exitConfirmed: true, result: 'Right command and child exited.', evidenceIds: [rightProof.id] })
  assert.deepEqual(f.read().workUnits.map(x => x.changedPaths), [['left.txt'], ['right.txt']])
  const packageResult = v2.reviewPackage(f.ctx(), 1, { scope: 'work-unit', unitId: 'left' }, deps)
  assert.equal(packageResult.baseOid, f.original)
  assert.equal(packageResult.headOid, leftProof.subject.headOid)
  assert.equal(packageResult.status, 'NOT_VERIFIED')
  const manifest = JSON.parse(fs.readFileSync(packageResult.manifestPath))
  assert.equal(manifest.devflow.unitId, 'left')
  f.control('running-add', { id: 'reviewer', kind: 'inspection', label: 'Independent read-only review of immutable unit packages' })
  assert.equal(f.read().running[0].kind, 'inspection')
  f.control('running-done', { id: 'reviewer', exitConfirmed: true, result: 'Reviewed both retained unit packages; no remaining findings.' })
  assert.throws(() => f.control('task-complete', { evidenceIds: [leftProof.id] }), /ancestor|scope|NOT_VERIFIED/)
  f.git('merge', '--no-ff', 'unit-left', '-m', 'integrate left')
  f.git('merge', '--no-ff', 'unit-right', '-m', 'integrate right')
  // Ordinary stat-cache refresh and other-branch updates must not revoke unchanged unit results.
  at(left, 'update-index', '--refresh'); at(right, 'update-index', '--refresh')
  const aggregate = f.verify('task', refs('combined'), { command: nodeCommand('const fs=require("node:fs"),a=require("node:assert/strict");a.equal(fs.readFileSync("left.txt","utf8"),"left.txt");a.equal(fs.readFileSync("right.txt","utf8"),"right.txt")') }).proof
  assert.equal(aggregate.result, 'passed')
  f.control('task-complete', { evidenceIds: [aggregate.id] })
  assert.equal(f.read().task.status, 'complete')
  assert.equal(f.read().workUnits.length, 2)
  assert.equal(f.read().running.length, 0)
  assert.equal(f.read().delivery.status, 'open')
})

test('integration checks execute the actual main result; source proof and stale target proof cannot close the Issue', liveJob, () => {
  const f = fixture({ selected: all })
  f.committed('source candidate\n')
  const delivery = complete(f)
  f.effect('check', { criteria: all, evidenceIds: [delivery.id] })
  const target = tmpdir('devflow-v2-integration-')
  f.git('worktree', 'add', target, 'main')
  assert.throws(() => f.verify('integration', all, { targetWorktreeRoot: target }), /ancestor|NOT_VERIFIED/)
  at(target, 'merge', '--no-ff', 'feat/1-x', '-m', 'actual merged target')
  const source = f.verify('issue', all).proof
  assert.throws(() => f.effect('close', { evidenceIds: [source.id] }), /scope/)
  // This command fails specifically in the integration checkout; source success never substitutes for it.
  const targetCommand = nodeCommand('const fs=require("node:fs"),assert=require("node:assert/strict");assert.equal(fs.readFileSync("integration-ready.txt","utf8"),"yes")')
  const failed = f.verify('integration', all, { targetWorktreeRoot: target, command: targetCommand }).proof
  assert.equal(failed.result, 'failed')
  assert.throws(() => f.effect('close', { evidenceIds: [failed.id] }), /failed|stale/)
  fs.writeFileSync(path.join(target, 'integration-ready.txt'), 'yes')
  at(target, 'add', 'integration-ready.txt'); at(target, 'commit', '-qm', 'target setup')
  const passed = f.verify('integration', all, { targetWorktreeRoot: target, command: targetCommand }).proof
  assert.equal(passed.result, 'passed')
  assert.equal(passed.cwd, fs.realpathSync(target))
  assert.equal(passed.integration.sourceHeadOid, delivery.subject.headOid)
  assert.equal(passed.integration.targetHeadOid, at(target, 'rev-parse', 'HEAD'))
  at(target, 'commit', '--allow-empty', '-qm', 'target moved')
  assert.throws(() => f.effect('close', { evidenceIds: [passed.id] }), /stale/)
  assert.equal(f.issue.state, 'OPEN')
  const fresh = f.verify('integration', all, { targetWorktreeRoot: target, command: targetCommand }).proof
  assert.equal(f.effect('close', { evidenceIds: [fresh.id] }).confirmed, true)
  assert.equal(f.read().issueClosed.headOid, fresh.subject.headOid)
})
