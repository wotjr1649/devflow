'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const w = require('../bin/lib/workflow')

const sha = c => c.repeat(40)
const digest = c => c.repeat(64)
const context = { repo: 'example/project', issue: 21, workspace: digest('a'), session: 'a'.repeat(12), head: sha('a') }
const scope = () => ({ ref: '.work/scope.json', revision: 1, criteriaRevision: 1, intentRevision: digest('b'),
  issueCriteria: ['AC-one', 'AC-two', 'AC-later'], deliveryCriteria: ['AC-one', 'AC-two'],
  criteriaRefs: ['AC-one', 'AC-two', 'AC-later'].map((id, i) => ({ id, definitionRevision: digest(['c', 'd', 'e'][i]) })),
  requiredChecks: ['focused'], reviewPerspectives: ['correctness'] })
const input = extras => ({ delivery: 'delivery-1', deliveryBase: sha('b'), integrationTarget: { ref: 'refs/heads/main', sha: sha('c') },
  scope: scope(), inputsDigest: digest('f'), path: 'bounded', runMode: 'M2', stage: 'design', ...extras })
const initial = (extras, legacy = {}) => w.initial(legacy, input(extras), context)
const step = (record, request, ctx = context) => w.transition(record, { expectedRevision: record.workflow.revision, ...request }, ctx)
const task = (id = 'task-1', current = 1, criteria = ['AC-one']) => ({ id, current, total: 2, criteria })
let nextId = 0
function proof(record, kind = 'verification', extra = {}, ctx = context) {
  const state = record.workflow, coverage = state.phase === 'task' ? state.task.criteria : state.scope.deliveryCriteria
  const evidence = { id: `receipt-${++nextId}`, kind, scope: state.phase, ref: '.work/evidence/result.json',
    lifecycle: 'completed', verdict: 'PASS', subject: w.subject(record, state.phase, ctx.head), criteria: coverage,
    checks: kind === 'verification' ? state.scope.requiredChecks : [], perspectives: kind === 'review' ? state.scope.reviewPerspectives : [],
    ...(kind === 'verification' ? { exitCode: 0 } : {}), ...extra }
  return w.addEvidence(record, { expectedRevision: state.revision, evidence }, ctx)
}
function accept(record, ctx = context) {
  record = step(record, { stage: 'verify' }, ctx)
  record = proof(record, 'verification', {}, ctx)
  record = step(record, { stage: 'review' }, ctx)
  record = proof(record, 'review', {}, ctx)
  return step(record, { action: 'finish-task' }, ctx)
}
function readyDelivery() {
  let record = step(initial(), { action: 'delivery' })
  record = proof(record)
  record = step(record, { stage: 'review' })
  record = proof(record, 'review')
  return step(record, { stage: 'ship' })
}
const prepare = (record, kind = 'comment') => w.prepareEffect(record, { expectedRevision: record.workflow.revision,
  effect: { id: `operation-${++nextId}`, kind, target: 'github.com/example/project/issues/21', payloadDigest: digest('a') } }, context)
const resolve = (record, outcome, extra = {}, ctx = context) => w.resolveEffect(record, { expectedRevision: record.workflow.revision,
  id: record.workflow.pendingEffect.id, outcome, ref: '.work/evidence/readback.json', ...extra }, ctx)

test('two task starts retain the whole delivery base and task proof cannot replace final verification', () => {
  let record = step(initial(), { action: 'start-task', task: task() })
  record = accept(record)
  const nextContext = { ...context, head: sha('d') }
  record = step(record, { action: 'start-task', task: task('task-2', 2, ['AC-two']) }, nextContext)
  assert.equal(record.workflow.deliveryBase, sha('b'))
  assert.equal(record.workflow.taskAttemptBase, sha('d'))
  record = accept(record, nextContext)
  record = step(record, { action: 'delivery' }, nextContext)
  assert.throws(() => step(record, { stage: 'review' }, nextContext), /delivery verification PASS/)
  assert.equal(w.subject(record, 'delivery', nextContext.head).deliveryBase, sha('b'))
})

test('a delivery subset can reach ship while later Issue criteria remain outside that delivery', () => {
  const record = readyDelivery()
  assert.equal(record.workflow.stage, 'ship')
  assert.deepEqual(record.workflow.scope.deliveryCriteria, ['AC-one', 'AC-two'])
  assert.deepEqual(record.workflow.scope.issueCriteria, ['AC-one', 'AC-two', 'AC-later'])
})

test('M2 task checks can finish before a dependent delivery integration check exists', () => {
  let record = initial({ path: 'architectural', stage: 'plan', scope: { ...scope(),
    requiredChecks: ['integration'], reviewPerspectives: ['delivery-correctness', 'security'] } })
  for (const [id, current, criteria] of [['first', 1, ['AC-one']], ['second', 2, ['AC-two']]]) {
    record = step(record, { action: 'start-task', task: { ...task(id, current, criteria),
      requiredChecks: [`unit-${id}`], review: { mode: 'required', perspectives: ['correctness'] } } })
    record = step(record, { stage: 'verify' })
    record = proof(record, 'verification', { checks: [`unit-${id}`] })
    record = step(record, { stage: 'review' })
    record = proof(record, 'review', { perspectives: ['correctness'] })
    record = step(record, { action: 'finish-task' })
  }
  record = step(record, { action: 'delivery' })
  assert.throws(() => step(record, { stage: 'review' }), /delivery verification PASS/)
  record = proof(record, 'verification', { checks: ['integration'] })
  record = step(record, { stage: 'review' })
  record = proof(record, 'review', { perspectives: ['delivery-correctness'] })
  assert.throws(() => step(record, { stage: 'ship' }), /perspectives security/)
  record = proof(record, 'review', { perspectives: ['security'] })
  assert.equal(step(record, { stage: 'ship' }).workflow.stage, 'ship')
})

test('a reasoned mechanical task may defer extra review but delivery still requires review', () => {
  const deferred = { ...task(), review: { mode: 'final', mechanical: true, reason: 'Single-file mechanical edit; final review covers it.' } }
  assert.throws(() => step(initial(), { action: 'start-task', task: { ...task(), review: { mode: 'final' } } }), /reasoned mechanical/)
  let record = step(initial(), { action: 'start-task', task: deferred })
  record = step(record, { stage: 'verify' })
  record = proof(record)
  record = step(record, { action: 'finish-task' })
  record = step(record, { action: 'delivery' })
  record = proof(record)
  record = step(record, { stage: 'review' })
  assert.throws(() => step(record, { stage: 'ship' }), /delivery review PASS/)
  assert.equal(step(proof(record, 'review'), { stage: 'ship' }).workflow.stage, 'ship')
})

test('task-specific gates cannot remove mandatory project task checks or review', () => {
  const project = { ...scope(), taskRequiredChecks: ['project-lint'], taskReviewRequired: true, taskReviewPerspectives: ['security'] }
  const init = initial({ scope: project })
  assert.throws(() => step(init, { action: 'start-task', task: { ...task(),
    review: { mode: 'final', mechanical: true, reason: 'Mechanical edit' } } }), /mandatory project task review/)
  let record = step(init, { action: 'start-task', task: { ...task(), requiredChecks: ['unit'],
    review: { mode: 'required', perspectives: ['correctness'] } } })
  record = step(record, { stage: 'verify' })
  record = proof(record, 'verification', { checks: ['unit'] })
  assert.throws(() => step(record, { stage: 'review' }), /checks project-lint/)
  record = proof(record, 'verification', { checks: ['project-lint'] })
  record = step(record, { stage: 'review' })
  record = proof(record, 'review', { perspectives: ['correctness'] })
  assert.throws(() => step(record, { action: 'finish-task' }), /perspectives security/)
  record = proof(record, 'review', { perspectives: ['security'] })
  assert.equal(step(record, { action: 'finish-task' }).workflow.phase, 'delivery')
})

test('M1 to M2 promotion acquires task review without an implicit carried waiver', () => {
  let record = step(initial({ runMode: 'M1' }), { action: 'start-task', task: task() })
  record = step(record, { action: 'configure', runMode: 'M2', reason: 'Delegate the remaining implementation.' })
  record = step(record, { stage: 'verify' })
  record = proof(record)
  assert.throws(() => step(record, { action: 'finish-task' }), /task review PASS/)
  record = proof(record, 'review')
  assert.equal(step(record, { action: 'finish-task' }).workflow.phase, 'delivery')
})

test('M3 acceptance cannot change the launched task gates or ordinal', () => {
  const launched = { ...task(), requiredChecks: ['unit'], review: { mode: 'required', perspectives: ['correctness'] } }
  const record = step(initial({ runMode: 'M3' }), { action: 'launch-task', task: launched })
  assert.throws(() => step(record, { action: 'start-task', task: { ...launched, requiredChecks: [] } }), /task gates are stale/)
  assert.throws(() => step(record, { action: 'start-task', task: { ...launched, current: 2 } }), /task gates are stale/)
  assert.equal(step(record, { action: 'start-task', task: launched }).workflow.phase, 'task')
})

for (const lastVerdict of ['FAIL', 'PASS']) test(`completion order selects a previously running report's final ${lastVerdict}`, () => {
  let record = step(initial(), { action: 'delivery' })
  record = proof(record, 'verification', { id: 'first-started', lifecycle: 'running', verdict: 'NOT_VERIFIED' })
  record = proof(record, 'verification', { id: 'first-completed', verdict: lastVerdict === 'FAIL' ? 'PASS' : 'FAIL', exitCode: lastVerdict === 'FAIL' ? 0 : 1 })
  record = proof(record, 'verification', { id: 'first-started', verdict: lastVerdict, exitCode: lastVerdict === 'PASS' ? 0 : 1 })
  if (lastVerdict === 'FAIL') assert.throws(() => step(record, { stage: 'review' }), /delivery verification PASS/)
  else assert.equal(step(record, { stage: 'review' }).workflow.stage, 'review')
  assert.throws(() => proof(record, 'verification', { id: 'first-started' }), /immutable/)
})

test('an integrated delivery cannot reopen by reconciling its target', () => {
  const record = resolve(prepare(readyDelivery(), 'integrate'), 'succeeded', {
    result: { ref: 'refs/heads/main', sha: sha('e') },
  })
  assert.equal(w.integrated(record), true)
  assert.throws(() => step(record, { action: 'reconcile-target', previousHead: context.head,
    deliveryBase: sha('e'), integrationTarget: { ref: 'refs/heads/main', sha: sha('e') },
    reason: 'follow-up repair' }), /new delivery|before integration/)
  assert.equal(w.integrated(record), true)
})

test('integration preparation reserves a unique result receipt and available evidence capacity', () => {
  let record = readyDelivery()
  assert.throws(() => w.prepareEffect(record, { expectedRevision: record.workflow.revision,
    effect: { id: record.workflow.evidence[0].id, kind: 'integrate', target: 'refs/heads/main', payloadDigest: digest('a') } }, context), /receipt.*(?:ID|id)|evidence.*ID/)
  while (record.workflow.evidence.length < 500) record = proof(record)
  assert.throws(() => prepare(record, 'integrate'), /evidence.*capacity|receipt.*capacity/)
  const pending = prepare(readyDelivery(), 'integrate')
  assert.equal(w.integrated(resolve(pending, 'succeeded', { result: { ref: 'refs/heads/main', sha: sha('e') } })), true)
})

test('stale revision, wrong coordinator and review-only mutation are rejected; ordinary notes remain valid', () => {
  const record = initial()
  assert.throws(() => w.metadata(record, { notes: ['progress'] }, { expectedRevision: 0 }, context), /revision conflict/)
  assert.throws(() => step(record, { stage: 'plan' }, { ...context, session: 'b'.repeat(12) }), /coordinator session/)
  assert.throws(() => step(record, { stage: 'plan' }, { ...context, reviewOnly: true }), /review-only/)
  const updated = w.metadata(record, { notes: ['progress'] }, { expectedRevision: record.workflow.revision }, context)
  assert.deepEqual(updated.notes, ['progress'])
  assert.deepEqual(w.subject(record, 'delivery', context.head), w.subject(updated, 'delivery', context.head))
  for (const key of ['workflow', 'stage', 'base', 'mode', 'counts', 'running'])
    assert.throws(() => w.metadata(record, { [key]: {} }, { expectedRevision: record.workflow.revision }, context), /protected control fields/)
})

test('completed failures are retained as reports but cannot pass; a success label cannot mask exit 1', () => {
  let record = step(initial(), { action: 'start-task', task: task() })
  assert.throws(() => proof(record, 'verification', { exitCode: 1 }), /exitCode 0/)
  record = proof(record, 'verification', { verdict: 'FAIL', exitCode: 1 })
  assert.equal(record.workflow.evidence.at(-1).lifecycle, 'completed')
  record = step(record, { stage: 'verify' })
  assert.throws(() => step(record, { stage: 'review' }), /PASS evidence/)
})

test('a late report cannot be rebound implicitly to a new task attempt', () => {
  let record = step(initial(), { action: 'start-task', task: task() })
  const previous = w.subject(record, 'task', context.head)
  record = step(record, { action: 'start-task', task: task(), retry: true })
  assert.equal(record.workflow.task.attempt, 2)
  assert.throws(() => proof(record, 'verification', { subject: previous }), /subject is stale/)
  assert.equal(proof(record).workflow.evidence.length, 1)
})

test('independent receipts compose coverage and a later applicable failure supersedes old success', () => {
  let record = step(initial(), { action: 'delivery' })
  record = proof(record, 'verification', { criteria: ['AC-one'] })
  record = proof(record, 'verification', { criteria: ['AC-two'] })
  assert.equal(w.requireEvidence(record, 'verification', 'delivery', context.head).length, 2)
  record = proof(record, 'verification', { criteria: ['AC-one'], verdict: 'FAIL', exitCode: 1 })
  assert.throws(() => w.requireEvidence(record, 'verification', 'delivery', context.head), /AC-one/)
  record = proof(record, 'verification', { criteria: ['AC-one'] })
  assert.equal(step(record, { stage: 'review' }).workflow.stage, 'review')
})

test('same HEAD with changed criterion definition or consumed inputs invalidates old applicability', () => {
  let record = proof(step(initial(), { action: 'delivery' }))
  const previous = record.workflow.evidence[0]
  const changed = scope()
  changed.revision++; changed.criteriaRevision++; changed.intentRevision = digest('e')
  changed.criteriaRefs[0].definitionRevision = digest('f')
  record = step(record, { action: 'scope', scope: changed, inputsDigest: digest('d') })
  assert.equal(w.applicable(record, previous, 'delivery', context.head), false)
  assert.throws(() => proof(record, 'verification', { subject: previous.subject }), /subject is stale/)
})

test('M2 refuses the next task before acceptance and permits it after verify and review', () => {
  let record = step(initial(), { action: 'start-task', task: task() })
  assert.throws(() => step(record, { action: 'start-task', task: task('task-2', 2, ['AC-two']) }), /finish the current task/)
  record = accept(record)
  assert.equal(step(record, { action: 'start-task', task: task('task-2', 2, ['AC-two']) }).workflow.task.id, 'task-2')
})

test('M3 records parallel launches but final delivery waits for every launched result', () => {
  let record = initial({ runMode: 'M3' })
  record = step(record, { action: 'launch-task', task: task() })
  record = step(record, { action: 'launch-task', task: task('task-2', 2, ['AC-two']) })
  assert.equal(record.workflow.launches.filter(t => t.status === 'launched').length, 2)
  record = step(record, { action: 'start-task', task: task() })
  record = accept(record)
  assert.throws(() => step(record, { action: 'delivery' }), /every parallel launch/)
  const advanced = { ...context, head: sha('d') }
  record = step(record, { action: 'start-task', task: task('task-2', 2, ['AC-two']) }, advanced)
  assert.equal(record.workflow.taskAttemptBase, context.head)
  record = accept(record, advanced)
  assert.equal(step(record, { action: 'delivery' }, advanced).workflow.stage, 'verify')
})

test('unknown effects hold duplicate execution while independent notes can be recorded', () => {
  let record = prepare(initial())
  record = resolve(record, 'unknown')
  assert.throws(() => prepare(record), /pending effect/)
  assert.throws(() => resolve(record, 'not-applied'), /readback reconciliation/)
  record = w.metadata(record, { notes: ['independent local preparation'] }, { expectedRevision: record.workflow.revision }, context)
  assert.equal(record.notes.length, 1)
  record = resolve(record, 'succeeded', { reconciled: true })
  assert.equal(record.workflow.pendingEffect, null)
})

test('autonomous continuation budget survives retries and autonomous mode blocks external effects', () => {
  let record = step(initial({}, { mode: 'autonomous' }), { action: 'start-task', task: task() })
  assert.throws(() => prepare(record), /autonomous/)
  record = w.continued(record, context.session)
  record = step(record, { action: 'start-task', task: task(), retry: true })
  record = w.continued(record, context.session)
  assert.equal(w.continued(record, context.session), null)
})

test('bounded M0 and spike routes do not acquire artificial architectural gates', () => {
  const small = initial({ runMode: 'M0', stage: 'start' })
  assert.equal(step(small, { action: 'start-task', task: task(), minimal: true }).workflow.stage, 'build')
  const architectural = initial({ path: 'architectural' })
  assert.throws(() => step(architectural, { action: 'start-task', task: task() }), /architectural work requires plan/)
  assert.equal(step(step(architectural, { stage: 'plan' }), { action: 'start-task', task: task() }).workflow.stage, 'build')
  let spike = step(initial({ path: 'spike', stage: 'discover' }), { action: 'start-task', task: task() })
  spike = step(spike, { action: 'finish-spike', reportRef: '.work/spike.json', verdict: 'NOT_VERIFIED' })
  assert.equal(spike.workflow.stage, 'done')
  assert.equal(w.integrated(spike), false)
})

test('confirmed integration remains usable for cleanup after checking out the merge result', () => {
  let record = prepare(readyDelivery(), 'integrate')
  record = resolve(record, 'succeeded', { result: { ref: 'refs/heads/main', sha: sha('d') } })
  assert.equal(w.integrated(record), true)
  record = step(record, { stage: 'cleanup' }, { ...context, head: sha('d') })
  assert.equal(record.workflow.stage, 'cleanup')
})

test('a post-ship return records its reason and prevents reuse of invalidated acceptance', () => {
  const shipped = readyDelivery()
  assert.throws(() => step(shipped, { action: 'return', stage: 'verify' }), /destination and reason/)
  const reopened = step(shipped, { action: 'return', stage: 'verify', reason: 'Required CI changed before integration' })
  assert.equal(reopened.workflow.invalidations.at(-1).from, 'ship')
  assert.throws(() => step(reopened, { stage: 'review' }), /PASS evidence/)
  assert.equal(reopened.workflow.evidence.length, shipped.workflow.evidence.length, 'retain historical receipts')
})

test('rebase reconciliation retains the previous whole range and reopens final evidence', () => {
  const ready = readyDelivery()
  const reconciled = step(ready, { action: 'reconcile-target', previousHead: context.head,
    deliveryBase: sha('e'), integrationTarget: { ref: 'refs/heads/main', sha: sha('e') },
    reason: 'Retained both task changes; equivalent upstream changes accounted for in the package' }, { ...context, head: sha('f') })
  assert.equal(reconciled.workflow.history[0].deliveryBase, sha('b'))
  assert.equal(reconciled.workflow.history[0].head, context.head)
  assert.equal(reconciled.workflow.stage, 'verify')
  assert.throws(() => w.requireEvidence(reconciled, 'verification', 'delivery', sha('f')), /PASS evidence/)
})
