'use strict'
// Verification recovery, append-only notes, continuation budgets and retained blockers.
const test = require('node:test')
const assert = require('node:assert/strict')
const tmpdir = require('./tmpdir')
const state = require('../bin/devflow-state')
const v2 = state.v2
const { ok, settled, all, fixture, wholeTask, liveJob } = require('./fixtures/devflow-v2')

test('unknown verification retains its reservation; notes do not change CAS; a quiescent new owner can recover without resetting budget', liveJob, () => {
  const f = fixture({ budgetLimit: 3 })
  f.env.onCommand = () => ({ code: 'ETIMEDOUT', stdout: '', stderr: 'root process timed out; descendant exit unknown' })
  const proof = f.verify().proof
  assert.equal(proof.result, 'unknown'); assert.equal(f.read().verification.id, proof.id)
  const token = f.expected()
  f.cli(['note', '1'], 'Interrupted run must be inspected.')
  assert.deepEqual(f.expected(), token)
  assert.throws(() => f.control('update', { patch: { stage: 'design' }, reason: 'resume' }), /verification/)
  f.env.vars.CODEX_THREAD_ID = 'replacement-owner'
  assert.throws(() => f.control('verification-abandon', { quiescent: true, reason: 'terminated' }), /does not own/)
  f.control('claim', { quiescent: true, reason: 'Previous host exited; taking recovery ownership only.' })
  assert.equal(f.read().recoveryOnly, true)
  assert.equal(f.read().budget.used, 1)
  assert.throws(() => f.control('update', { patch: { mode: 'autonomous' }, reason: 'resume' }), /recovery-only/)
  f.control('verification-abandon', { quiescent: true, reason: 'Verified command and descendants terminated.' })
  assert.equal(f.read().verification, undefined); assert.equal(f.read().recoveryOnly, undefined)
  assert.equal(f.read().budget.used, 1)
  f.env.onCommand = null
  assert.equal(f.verify().proof.result, 'passed')
})

test('append-only notes and running completion survive verification finalization without a stale-result dead end', () => {
  const f = fixture()
  f.control('running-add', { id: 'worker-1', label: 'independent bounded worker' })
  f.env.onCommand = () => {
    const before = f.expected()
    v2.appendNote(f.ctx(), 1, 'Inspection note during verification.')
    assert.deepEqual(f.expected(), before)
    f.control('running-done', { id: 'worker-1', exitConfirmed: true, result: 'Worker returned and all children exited.' })
    return settled('verified')
  }
  const proof = f.verify().proof
  assert.equal(proof.result, 'passed')
  assert.equal(f.read().running.length, 0)
  assert.equal(f.read().verification, undefined)
  assert.ok(f.read().notes.some(n => n.text === 'Inspection note during verification.'))
  assert.ok(f.read().notes.some(n => n.finishedRun === 'worker-1'))
})

test('cumulative continuation and attempt budget survives mode changes, tasks and owner changes', liveJob, () => {
  const f = fixture({ budgetLimit: 2 })
  f.control('task-start', { id: 'one', current: 1, total: 2, ...wholeTask('a', 'b') })
  f.control('update', { patch: { mode: 'autonomous' }, reason: 'Authorized bounded unattended task.' })
  assert.ok(v2.continuation(f.ctx(), 1)); assert.ok(v2.continuation(f.ctx(), 1)); assert.equal(v2.continuation(f.ctx(), 1), null)
  f.control('update', { patch: { mode: 'interactive' }, reason: 'Return control.' })
  f.control('task-abandon', { reason: 'Replan after bounded attempt budget.' })
  f.env.vars.CODEX_THREAD_ID = 'next-owner'
  f.control('claim', { quiescent: true, reason: 'Complete handoff.' })
  f.control('task-start', { id: 'two', current: 2, total: 2, ...wholeTask('a', 'b') })
  assert.equal(f.read().budget.used, 2)
  assert.throws(() => f.verify('task'), /budget exhausted/)
  f.control('budget-extend', { limit: 3, reason: 'Explicit additional attempt approved.' })
  assert.equal(f.read().budget.used, 2)
  assert.equal(f.verify('task').proof.result, 'passed')
})

test('migrated object-shaped blockers remain visible and stop autonomous continuation', () => {
  const f = fixture({ legacy: { stage: 'build', blocked: { dependency: 'unresolved' }, decisions: { scope: 'pending' } } })
  assert.match(state.card(f.env, f.root), /read ledger blocked and decisions/)
  f.control('task-start', { id: 'task-one', current: 1, total: 1, ...wholeTask('a', 'b') })
  f.control('update', { patch: { mode: 'autonomous' }, reason: 'exercise blocked continuation' })
  assert.equal(v2.continuation(f.ctx(), 1), null)
})
