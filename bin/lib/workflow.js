'use strict'
// Protected workflow contracts. The filesystem/host is not an authority boundary; CLI callers must preserve this record.
const crypto = require('crypto')
const STAGES = ['discover', 'start', 'design', 'plan', 'build', 'verify', 'review', 'ship', 'cleanup', 'learn', 'done']
const HASH = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const DIGEST = /^[a-f0-9]{64}$/
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/
const SESSION = /^[a-f0-9]{12}$/
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const filled = v => v && typeof v === 'object' ? Object.keys(v).length > 0 : Boolean(v)
const copy = v => JSON.parse(JSON.stringify(v))
const fail = message => { throw new Error(`protected workflow: ${message}`) }
const need = (ok, message) => { if (!ok) fail(message) }
const positive = v => Number.isSafeInteger(v) && v > 0
const ids = v => Array.isArray(v) && v.length <= 1000 && v.every(x => typeof x === 'string' && ID.test(x)) && new Set(v).size === v.length
const ordered = value => Array.isArray(value) ? value.map(ordered) : plain(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value
const same = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b))
const digest = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')
const protectedRecord = record => plain(record) && record.schemaVersion === 2 && plain(record.workflow)
const CONTROL = new Set(['schemaVersion', 'workflow', 'stage', 'path', 'runMode', 'task', 'base', 'lastCommit', 'counts',
  'identity', 'owner', 'revision', 'phase', 'deliveryBase', 'taskAttemptBase', 'integrationTarget', 'scope', 'evidence',
  'pendingEffect', 'inputsDigest', 'taskAttempts', 'relinquished', 'recovery', 'ownershipHistory', 'mode', 'modeChanged', 'running'])

function validate(record) {
  need(protectedRecord(record), 'protected mode is required; migrate explicitly first')
  const w = record.workflow
  need(plain(w.identity) && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(w.identity.repo) && positive(w.identity.issue) &&
    typeof w.identity.delivery === 'string' && ID.test(w.identity.delivery) && DIGEST.test(w.identity.workspace), 'invalid repository, Issue, delivery or workspace identity')
  need(positive(w.revision) && positive(w.evidenceEpoch) && SESSION.test(w.owner), 'invalid state revision, evidence epoch or coordinator session')
  need(w.relinquished === undefined || w.relinquished === null || plain(w.relinquished) && w.relinquished.owner === w.owner && typeof w.relinquished.reason === 'string' && w.relinquished.reason.trim(), 'invalid coordinator relinquishment')
  need(w.recovery === undefined || w.recovery === null || plain(w.recovery) && SESSION.test(w.recovery.previousOwner) && typeof w.recovery.ref === 'string' && w.recovery.ref.trim(), 'invalid coordinator recovery hold')
  need(!(w.relinquished && w.recovery), 'a relinquished coordinator cannot hold recovery control')
  need(STAGES.includes(w.stage) && ['task', 'delivery'].includes(w.phase), 'invalid execution stage or phase')
  need(['spike', 'bounded', 'architectural'].includes(w.path) && /^M[0-3]$/.test(w.runMode), 'invalid lifecycle path or execution mode')
  need(HASH.test(w.deliveryBase) && plain(w.integrationTarget) && typeof w.integrationTarget.ref === 'string' &&
    /^refs\/(heads|remotes)\/[A-Za-z0-9._/-]+$/.test(w.integrationTarget.ref) && !w.integrationTarget.ref.includes('..') && HASH.test(w.integrationTarget.sha), 'invalid comparison base or integration target')
  need(w.taskAttemptBase === null || HASH.test(w.taskAttemptBase), 'invalid task attempt base')
  const s = w.scope
  need(plain(s) && positive(s.revision) && positive(s.criteriaRevision) && typeof s.ref === 'string' && s.ref.length > 0 && s.ref.length <= 1024 &&
    ids(s.issueCriteria) && ids(s.deliveryCriteria) && s.deliveryCriteria.every(id => s.issueCriteria.includes(id)) && ids(s.requiredChecks) &&
    ids(s.reviewPerspectives) && DIGEST.test(s.intentRevision) && Array.isArray(s.criteriaRefs) &&
    s.criteriaRefs.length === s.issueCriteria.length && s.criteriaRefs.every((r, i) => plain(r) && r.id === s.issueCriteria[i] && DIGEST.test(r.definitionRevision)) && DIGEST.test(w.inputsDigest), 'invalid scope, criterion identities or input digest')
  need((s.taskRequiredChecks === undefined || ids(s.taskRequiredChecks)) &&
    (s.taskReviewPerspectives === undefined || ids(s.taskReviewPerspectives)) &&
    (s.taskReviewRequired === undefined || typeof s.taskReviewRequired === 'boolean'), 'invalid project task gates')
  need(plain(w.taskAttempts) && Object.keys(w.taskAttempts).length <= 1000 &&
    Object.entries(w.taskAttempts).every(([id, attempt]) => ID.test(id) && positive(attempt)), 'invalid retained task attempts')
  if (w.task !== null) {
    need(plain(w.task) && ID.test(w.task.id) && positive(w.task.current) && positive(w.task.total) && w.task.current <= w.task.total + 1 &&
      positive(w.task.attempt) && w.taskAttempts[w.task.id] === w.task.attempt && ids(w.task.criteria) && w.task.criteria.every(id => s.deliveryCriteria.includes(id)), 'invalid task')
    taskGates(w, w.task, false)
  }
  need(w.phase !== 'task' || (w.task && w.task.current <= w.task.total && HASH.test(w.taskAttemptBase)), 'task phase requires an open task and attempt base')
  need(Array.isArray(w.launches) && w.launches.length <= 100 && new Set(w.launches.map(t => t.id)).size === w.launches.length &&
    w.launches.every(t => plain(t) && ID.test(t.id) && HASH.test(t.base) && positive(t.current) && positive(t.total) && t.current <= t.total && ids(t.criteria) &&
    positive(t.scopeRevision) && positive(t.criteriaRevision) && ['launched', 'accepted', 'cancelled'].includes(t.status)), 'invalid parallel task launches')
  for (const launch of w.launches) taskGates(w, launch, false)
  need(Array.isArray(w.evidence) && w.evidence.length <= 500 && new Set(w.evidence.map(e => e.id)).size === w.evidence.length, 'invalid evidence collection')
  for (const e of w.evidence) evidenceShape(e)
  need(w.pendingEffect === null || (plain(w.pendingEffect) && ID.test(w.pendingEffect.id) && ID.test(w.pendingEffect.kind) &&
    typeof w.pendingEffect.target === 'string' && w.pendingEffect.target.length > 0 && w.pendingEffect.target.length <= 1024 &&
    ['prepared', 'in-flight', 'unknown'].includes(w.pendingEffect.status) && DIGEST.test(w.pendingEffect.payloadDigest) &&
    plain(w.pendingEffect.subject)), 'invalid pending effect')
  if (w.pendingEffect && w.pendingEffect.kind === 'branch-delete') {
    const payload = deletionPayload(w.pendingEffect.payload)
    need(w.pendingEffect.payloadDigest === digest(payload) && w.pendingEffect.target === `git:${payload.remote}:${payload.ref}`, 'deletion effect payload does not match its prepared identity')
  }
  need(['interactive', 'autonomous'].includes(record.mode), 'invalid interactive/autonomous mode')
  return w
}

function evidenceShape(e) {
  need(plain(e) && ID.test(e.id) && ['verification', 'review', 'baseline', 'integration'].includes(e.kind) &&
    ['task', 'delivery'].includes(e.scope) && typeof e.ref === 'string' && e.ref.length > 0 && e.ref.length <= 2048 &&
    ['created', 'running', 'completed', 'terminated'].includes(e.lifecycle) &&
    ['PASS', 'FAIL', 'NOT_VERIFIED', 'NEEDS_DECISION'].includes(e.verdict) && plain(e.subject), 'invalid evidence record')
  need(ids(e.criteria) && ids(e.checks) && ids(e.perspectives), 'invalid evidence coverage')
  if (e.verdict === 'PASS') {
    need(e.lifecycle === 'completed', 'PASS requires completed report lifecycle')
    if (['verification', 'baseline'].includes(e.kind)) need(e.exitCode === 0, 'PASS verification requires exitCode 0')
  }
  if (e.lifecycle !== 'completed') need(e.verdict === 'NOT_VERIFIED', 'unfinished or terminated reports are NOT_VERIFIED')
  if (e.exitCode !== undefined) need(Number.isInteger(e.exitCode), 'invalid evidence exit code')
}

function contextMatches(w, context, owner = true) {
  need(context && !context.reviewOnly, 'review-only cannot mutate state or perform effects')
  need(context.repo === w.identity.repo && context.issue === w.identity.issue && context.workspace === w.identity.workspace,
    'repository, Issue or workspace identity mismatch')
  if (owner) {
    need(context.session === w.owner, 'only the coordinator session may change workflow control; use an explicit claim or handoff')
    need(!w.relinquished, 'coordinator released this workflow; claim it before further mutations')
  }
}
function guard(record, request, context, { pending = false, recovery = false } = {}) {
  const w = validate(record)
  contextMatches(w, context)
  need(request && request.expectedRevision === w.revision, `state revision conflict; read revision ${w.revision} before retrying`)
  if (!pending) need(w.pendingEffect === null, 'pending effect must be reconciled before another mutation')
  if (!recovery) need(!w.recovery, 'coordinator recovery is held; reconcile running work and pending effects, then resume-owner')
  return w
}
// These ownership operations serialize cooperative clients; they do not authenticate a human or prove host liveness.
function settled(record) {
  need(!filled(record.running) && record.workflow.pendingEffect === null, 'settle running work and pending effects before releasing, claiming or resuming the coordinator')
}
function ownershipRequest(record, request, context) {
  const w = validate(record)
  contextMatches(w, context, false)
  need(SESSION.test(context.session) && request && request.expectedRevision === w.revision, 'ownership change requires a session and exact current state revision')
  need(request.expectedOwner === w.owner && same(request.identity, w.identity), 'ownership change requires the exact previous owner and complete workflow identity')
  need(typeof request.reason === 'string' && request.reason.trim(), 'ownership change needs a reason')
  return w
}
function ownerChanged(record, session, kind, request) {
  const n = record.workflow
  n.ownershipHistory = [...(n.ownershipHistory || []), { from: n.owner, to: session, kind, revision: n.revision,
    reason: request.reason, ...(request.ref ? { ref: request.ref } : {}) }]
  n.owner = session; n.relinquished = null
  if (record.modeChanged) record.modeChanged.session = session
  return record
}
function relinquish(record, request, context) {
  const w = guard(record, request, context)
  settled(record)
  const next = copy(record)
  next.workflow.relinquished = { owner: w.owner, reason: request.reason || 'explicit session release' }
  return finish(next)
}
function claim(record, request, context) {
  const w = ownershipRequest(record, request, context)
  need(w.relinquished, 'the coordinator has not released; use confirmed quiescent recovery for a vanished owner')
  settled(record)
  return finish(ownerChanged(copy(record), context.session, 'claim', request))
}
function recoverOwner(record, request, context) {
  const w = ownershipRequest(record, request, context)
  need(context.quiescent === true && typeof request.ref === 'string' && request.ref.trim(), 'owner recovery requires --quiescent and a reference recording confirmed coordinator/descendant exit and partial-effect inspection; age is not proof')
  need(!w.relinquished && context.session !== w.owner, 'use normal claim for a released owner; recovery must name a different session')
  const next = ownerChanged(copy(record), context.session, 'recover', request)
  // Preserve unknown effects and worker labels. Recovery grants reconciliation control, never replay permission.
  next.workflow.recovery = { previousOwner: w.owner, ref: request.ref, reason: request.reason }
  return finish(next)
}
function resumeOwner(record, request, context) {
  ownershipRequest(record, request, context)
  const w = guard(record, request, context, { pending: true, recovery: true })
  need(w.recovery, 'no coordinator recovery hold to resume')
  settled(record)
  const next = copy(record)
  next.workflow.ownershipHistory = [...(next.workflow.ownershipHistory || []), { from: w.owner, to: w.owner,
    kind: 'resume', revision: w.revision, reason: request.reason, ref: w.recovery.ref }]
  next.workflow.recovery = null
  return finish(next)
}
function subject(record, scope, head) {
  const w = validate(record)
  need(['task', 'delivery'].includes(scope) && HASH.test(head), 'evidence subject needs a scope and exact HEAD')
  if (scope === 'task') need(w.phase === 'task' && w.task, 'task evidence requires an active task')
  return { identity: copy(w.identity), head, deliveryBase: w.deliveryBase,
    integrationTarget: copy(w.integrationTarget), scopeRevision: w.scope.revision, criteriaRevision: w.scope.criteriaRevision,
    inputsDigest: w.inputsDigest, intentRevision: w.scope.intentRevision, criteriaDigest: digest(w.scope.criteriaRefs), evidenceEpoch: w.evidenceEpoch, ...(scope === 'task' ? { taskId: w.task.id, attempt: w.task.attempt, taskAttemptBase: w.taskAttemptBase } : {}) }
}
function applicable(record, evidence, scope, head) {
  return evidence.scope === scope && same(evidence.subject, subject(record, scope, head))
}
function taskGates(w, task, enforceProject = true) {
  need(task.requiredChecks === undefined || ids(task.requiredChecks), 'invalid task check list')
  const review = task.review
  need(review === undefined || plain(review) && ['required', 'final'].includes(review.mode) &&
    (review.perspectives === undefined || ids(review.perspectives)), 'invalid task review policy')
  const projectReview = w.scope.taskReviewRequired === true || (w.scope.taskReviewPerspectives || []).length > 0
  if (review && review.mode === 'final') {
    need(review.mechanical === true && typeof review.reason === 'string' && review.reason.trim() &&
      (!enforceProject || !projectReview) && (!review.perspectives || review.perspectives.length === 0),
    'final-review deferral requires a reasoned mechanical task with no mandatory project task review')
  }
  return {
    checks: [...new Set([...(w.scope.taskRequiredChecks || []), ...(task.requiredChecks || w.scope.requiredChecks)])],
    reviewRequired: projectReview || (review ? review.mode === 'required' : ['M2', 'M3'].includes(w.runMode)),
    perspectives: [...new Set([...(w.scope.taskReviewPerspectives || []), ...(review?.perspectives || w.scope.reviewPerspectives)])],
  }
}
function requireEvidence(record, kind, scope, head, selectedCriteria) {
  const w = validate(record)
  const criteria = selectedCriteria || (scope === 'task' ? w.task.criteria : w.scope.deliveryCriteria)
  const gates = scope === 'task' ? taskGates(w, w.task) : { checks: w.scope.requiredChecks, perspectives: w.scope.reviewPerspectives }
  const checks = kind === 'verification' ? gates.checks : []
  const perspectives = kind === 'review' ? gates.perspectives : []
  const reports = w.evidence.filter(e => e.kind === kind && applicable(record, e, scope, head))
  // Independent reviewers and verifiers compose. For each fact the latest applicable completed result wins, so a
  // later failure cannot be hidden by an earlier PASS. Pending/terminated reports never supply positive coverage.
  const requirements = [['criteria', criteria], ['checks', checks], ['perspectives', perspectives]]
  const selected = new Set()
  for (const [field, needed] of requirements) for (const id of needed) {
    const latest = reports.filter(e => e.lifecycle === 'completed' && e[field].includes(id)).at(-1)
    need(latest && latest.verdict === 'PASS', `${scope} ${kind} PASS evidence for ${field} ${id} at the current HEAD and inputs is required`)
    selected.add(latest.id)
  }
  need(reports.some(e => e.lifecycle === 'completed' && e.verdict === 'PASS'), `${scope} ${kind} PASS evidence is required`)
  return [...selected]

}
function finish(record) {
  record.workflow.revision++
  validate(record)
  return record
}
function initial(legacy, input, context) {
  need(plain(legacy) && plain(input) && context && SESSION.test(context.session), 'migration requires a session, JSON ledger and explicit initialization')
  need(!context.reviewOnly, 'review-only cannot migrate')
  need(!filled(legacy.running) && !filled(legacy.pendingPosts), 'finish running work and resolve legacy pending posts before migration')
  // Never infer a delivery comparison base from legacy base: it may be only the latest task attempt.
  const record = copy(legacy)
  for (const key of CONTROL) delete record[key]
  record.schemaVersion = 2
  record.mode = legacy.mode === 'autonomous' ? 'autonomous' : 'interactive'
  if (legacy.modeChanged) record.modeChanged = copy(legacy.modeChanged)
  record.running = []
  record.counts = {}
  const activeLegacyTask = plain(legacy.task) && positive(legacy.task.current) && positive(legacy.task.total) && legacy.task.current <= legacy.task.total
  need(!activeLegacyTask || input.task, 'recover the existing active task; migration cannot discard its continuation budget')
  if (input.task && activeLegacyTask) {
    need(input.task.current === legacy.task.current && input.task.total === legacy.task.total, 'recover the existing active task before changing its continuation budget')
    const old = plain(legacy.counts) ? legacy.counts[String(legacy.task.current)] : undefined
    const known = plain(legacy.counts) && (old === undefined || plain(old) && Number.isSafeInteger(old.continue) && old.continue >= 0)
    const used = known ? Math.min(2, old ? old.continue : 0) : 2
    record.counts[`${input.delivery}/${input.task.current}`] = { continue: used }
    record.continuationMigration = { task: input.task.current, used, unknown: !known }
  }
  record.workflow = { identity: { repo: context.repo, issue: context.issue, delivery: input.delivery, workspace: context.workspace },
    owner: context.session, revision: 1, evidenceEpoch: 1, phase: input.task ? 'task' : 'delivery', stage: input.stage || (STAGES.includes(legacy.stage) ? legacy.stage : 'start'), path: input.path || legacy.path || 'bounded',
    runMode: input.runMode || legacy.runMode || 'M1', deliveryBase: input.deliveryBase, taskAttemptBase: input.task ? input.taskAttemptBase : null,
    integrationTarget: input.integrationTarget, scope: input.scope, inputsDigest: input.inputsDigest, task: input.task || null, taskAttempts: input.task ? { [input.task.id]: input.task.attempt } : {}, launches: [], evidence: [], pendingEffect: null }
  need(!['ship', 'cleanup', 'learn', 'done'].includes(record.workflow.stage), 'migration cannot assert completed delivery gates; resume before ship and record fresh evidence')
  validate(record)
  return record
}

function transition(record, request, context) {
  if (request && request.action === 'claim') return claim(record, request, context)
  if (request && request.action === 'resume-owner') return resumeOwner(record, request, context)
  const w = guard(record, request, context)
  const next = copy(record), n = next.workflow
  need(HASH.test(context.head), 'an exact current HEAD is required')
  const action = request.action || 'stage'
  if (action === 'launch-task') {
    need(w.runMode === 'M3' && (['plan', 'build', 'verify', 'review'].includes(w.stage) || w.path !== 'architectural' && w.stage === 'design'), 'parallel launches require M3 during task work')
    const task = request.task
    need(plain(task) && ID.test(task.id) && positive(task.current) && positive(task.total) && task.current <= task.total && ids(task.criteria) &&
      task.criteria.every(id => w.scope.deliveryCriteria.includes(id)) && !w.launches.some(t => t.id === task.id), 'invalid or duplicate parallel task launch')
    taskGates(w, task)
    n.launches.push({ ...task, base: context.head, scopeRevision: w.scope.revision, criteriaRevision: w.scope.criteriaRevision, status: 'launched' })
  } else if (action === 'cancel-task') {
    const launched = n.launches.find(t => t.id === request.id && t.status === 'launched')
    need(launched && !(w.phase === 'task' && w.task.id === request.id) && typeof request.reason === 'string' && request.reason.trim(), 'cancel an inactive parallel launch with a reason')
    launched.status = 'cancelled'; launched.reason = request.reason
  } else if (action === 'start-task') {
    need(['plan', 'build', 'verify', 'review'].includes(w.stage) ||
      w.path === 'bounded' && (w.stage === 'design' || w.stage === 'start' && w.runMode === 'M0' && request.minimal === true) ||
      w.path === 'spike' && ['discover', 'design', 'start'].includes(w.stage), 'start a task after design; architectural work requires plan, and a minimal bounded M0 skip must be explicit')
    const task = request.task
    need(plain(task) && ID.test(task.id) && positive(task.current) && positive(task.total) && task.current <= task.total && ids(task.criteria), 'invalid task request')
    taskGates(w, task)
    if (w.phase === 'task') need(request.retry === true && w.task.id === task.id && w.task.current === task.current, 'finish the current task or explicitly retry it')
    const previousAttempt = Object.hasOwn(w.taskAttempts, task.id) ? w.taskAttempts[task.id] : 0
    n.task = { ...task, attempt: previousAttempt + 1 }
    n.taskAttempts[task.id] = n.task.attempt
    n.evidenceEpoch++
    const launch = w.launches.find(t => t.id === task.id && t.status === 'launched')
    if (launch) need(launch.scopeRevision === w.scope.revision && launch.criteriaRevision === w.scope.criteriaRevision &&
      launch.current === task.current && launch.total === task.total && same(launch.criteria, task.criteria) &&
      same(taskGates(w, launch), taskGates(w, task)), 'parallel launch scope or task gates are stale; reconcile before accepting its work')
    n.taskAttemptBase = launch && !request.retry ? launch.base : context.head
    n.phase = 'task'; n.stage = 'build'
  } else if (action === 'finish-task') {
    need(w.phase === 'task' && ['verify', 'review'].includes(w.stage), 'finish a task after its checks')
    requireEvidence(record, 'verification', 'task', context.head)
    if (taskGates(w, w.task).reviewRequired) requireEvidence(record, 'review', 'task', context.head)
    n.completedTasks = [...(n.completedTasks || []), { ...w.task, head: context.head, attemptBase: w.taskAttemptBase,
      scopeRevision: w.scope.revision, criteriaRevision: w.scope.criteriaRevision }]
    const launched = n.launches.find(t => t.id === w.task.id)
    if (launched) launched.status = 'accepted'
    n.task.current++; n.phase = 'delivery'; n.stage = w.path === 'architectural' ? 'plan' : 'design'
  } else if (action === 'delivery') {
    need(w.phase === 'delivery' && ['design', 'plan', 'verify'].includes(w.stage) &&
      (w.path !== 'architectural' || w.stage !== 'design'), 'finish the active task and required planning before final delivery checks; returning from review requires action:return and a reason')
    need(!w.launches.some(t => t.status === 'launched'), 'accept or cancel every parallel launch before delivery verification')
    n.stage = 'verify'
  } else if (action === 'finish-spike') {
    need(w.path === 'spike' && ['build', 'verify', 'review'].includes(w.stage) && !filled(record.running) && !w.launches.some(t => t.status === 'launched'), 'finish a spike only after its running work has ended')
    need(typeof request.reportRef === 'string' && request.reportRef.trim() && ['PASS', 'FAIL', 'NOT_VERIFIED', 'NEEDS_DECISION'].includes(request.verdict), 'spike completion needs a report reference and explicit verdict')
    n.phase = 'delivery'; n.stage = 'done'
    n.spikeResult = { ref: request.reportRef, verdict: request.verdict, head: context.head }
  } else if (action === 'scope') {
    need(['design', 'plan', 'build', 'verify', 'review'].includes(w.stage), 'scope can change only before shipping')
    need(plain(request.scope) && request.scope.revision === w.scope.revision + 1 &&
      request.scope.criteriaRevision >= w.scope.criteriaRevision, 'scope change must increment scope revision and never decrease criteria revision')
    n.scope = request.scope
    if (request.inputsDigest !== undefined) n.inputsDigest = request.inputsDigest
    if (request.integrationTarget !== undefined) n.integrationTarget = request.integrationTarget
    n.phase = 'delivery'; n.stage = w.path === 'architectural' ? 'plan' : 'design'; n.task = null; n.taskAttemptBase = null
  } else if (action === 'configure') {
    need(['discover', 'start', 'design', 'plan', 'build', 'verify', 'review'].includes(w.stage) && !filled(record.running) &&
      !w.launches.some(t => t.status === 'launched'), 'configuration changes require settled workers before shipping')
    const path = request.path === undefined ? w.path : request.path
    const runMode = request.runMode === undefined ? w.runMode : request.runMode
    need(['spike', 'bounded', 'architectural'].includes(path) && /^M[0-3]$/.test(runMode) &&
      (path !== w.path || runMode !== w.runMode) && typeof request.reason === 'string' && request.reason.trim(), 'configuration needs a changed path or runMode and a reason')
    n.configurationChanges = [...(n.configurationChanges || []), { from: { path: w.path, runMode: w.runMode },
      to: { path, runMode }, reason: request.reason, head: context.head, stage: w.stage, task: w.task }]
    n.path = path; n.runMode = runMode; n.evidenceEpoch++
    if (path !== w.path) {
      n.phase = 'delivery'; n.task = null; n.taskAttemptBase = null
      n.stage = ['discover', 'start'].includes(w.stage) ? w.stage : path === 'spike' ? 'discover' : 'design'
    } else if (w.stage === 'review') n.stage = 'verify'
  } else if (action === 'return') {
    need(['discover', 'start', 'design', 'plan', 'build', 'verify', 'review'].includes(request.stage) &&
      typeof request.reason === 'string' && request.reason.trim(), 'return needs a repair destination and reason')
    need(STAGES.indexOf(request.stage) <= STAGES.indexOf(w.stage), 'repair return cannot skip a forward stage; use its normal transition')
    need(!integrated(record), 'an integrated delivery must begin a new delivery before repairs')
    n.invalidations = [...(n.invalidations || []), { from: w.stage, stage: request.stage, reason: request.reason,
      head: context.head, evidenceIds: w.evidence.map(e => e.id), evidenceEpoch: w.evidenceEpoch }]
    n.evidenceEpoch++; n.stage = request.stage
    if (['discover', 'start', 'design', 'plan'].includes(request.stage)) { n.phase = 'delivery'; n.task = null; n.taskAttemptBase = null }
  } else if (action === 'handoff') {
    need(SESSION.test(request.owner) && request.owner !== w.owner && !filled(record.running) && typeof request.reason === 'string' && request.reason.trim(), 'handoff needs another session, a reason and no running work')
    n.owner = request.owner
    next.notes = [...(Array.isArray(next.notes) ? next.notes : []), `workflow handoff: ${request.reason}`]
    if (next.modeChanged) next.modeChanged.session = request.owner
  } else if (action === 'reconcile-target') {
    need(!integrated(record), 'confirmed integration requires a new delivery before target reconciliation')
    need(w.phase === 'delivery' && ['design', 'plan', 'verify', 'review', 'ship'].includes(w.stage) && typeof request.reason === 'string' && request.reason.trim() &&
      plain(request.integrationTarget) && HASH.test(request.deliveryBase), 'target reconciliation needs a delivery comparison base, target and reason before integration')
    n.history = [...(n.history || []), { deliveryBase: w.deliveryBase, integrationTarget: w.integrationTarget, head: request.previousHead,
      scopeRevision: w.scope.revision, reason: request.reason }]
    need(HASH.test(request.previousHead), 'target reconciliation needs the previous exact HEAD for audit')
    n.deliveryBase = request.deliveryBase; n.integrationTarget = request.integrationTarget; n.scope.revision++
    n.stage = ['design', 'plan'].includes(w.stage) ? w.stage : 'verify'
  } else if (action === 'next-delivery') {
    need(w.phase === 'delivery' && ['cleanup', 'learn', 'done'].includes(w.stage) &&
      integrated(record), 'next delivery requires confirmed integration of this delivery')
    need(ID.test(request.delivery) && request.delivery !== w.identity.delivery && HASH.test(request.deliveryBase), 'next delivery needs a new identity and explicit comparison base')
    n.identity.delivery = request.delivery; n.deliveryBase = request.deliveryBase
    const integration = w.evidence.filter(e => e.kind === 'integration')
    n.completedDeliveries = [...(n.completedDeliveries || []), { identity: w.identity, base: w.deliveryBase,
      integrationTarget: w.integrationTarget, scope: w.scope, inputsDigest: w.inputsDigest, evidenceEpoch: w.evidenceEpoch,
      finalHead: integration.at(-1).subject.head, tasks: w.completedTasks || [], taskAttempts: w.taskAttempts,
      evidence: w.evidence, integration, path: w.path, runMode: w.runMode,
      configurationChanges: w.configurationChanges || [], invalidations: w.invalidations || [], targetHistory: w.history || [] }]
    n.configurationChanges = []; n.invalidations = []; n.history = []
    n.completedTasks = []; n.evidenceEpoch++; n.scope = request.scope; n.task = null; n.taskAttemptBase = null; n.taskAttempts = {}; n.evidence = []; n.launches = []; n.stage = w.path === 'architectural' ? 'plan' : 'design'
    if (request.integrationTarget) n.integrationTarget = request.integrationTarget
  } else {
    need(action === 'stage' && STAGES.includes(request.stage), 'unknown transition')
    need(STAGES.indexOf(request.stage) > STAGES.indexOf(w.stage), 'backward stage changes require action:return with a reason to invalidate prior evidence')
    const allowed = { discover: ['start'], start: ['design', 'plan'], design: ['plan'], plan: [],
      build: ['verify'], verify: ['review'], review: ['ship'],
      ship: ['cleanup'], cleanup: ['learn', 'done'], learn: ['done'], done: [] }
    need(allowed[w.stage].includes(request.stage), `transition ${w.stage} -> ${request.stage} is not allowed`)
    if (w.path === 'architectural' && w.stage === 'start' && request.stage === 'plan') fail('architectural work requires design before plan')
    if (request.stage === 'review') requireEvidence(record, 'verification', w.phase, context.head)
    if (request.stage === 'ship') {
      need(w.phase === 'delivery', 'ship requires delivery-wide evidence; task checks do not qualify')
      need(!filled(record.blocked) && !filled(record.decisions) && !filled(record.running) && !w.launches.some(t => t.status === 'launched'), 'resolve blockers, decisions, running work and parallel launches before ship')
      requireEvidence(record, 'verification', 'delivery', context.head)
      requireEvidence(record, 'review', 'delivery', context.head)
    }
    if (request.stage === 'cleanup') need(integrated(record), 'cleanup requires confirmed integration evidence')
    n.stage = request.stage
  }
  return finish(next)
}
function integrated(record) {
  const w = validate(record)
  return w.evidence.some(e => e.kind === 'integration' && e.lifecycle === 'completed' && e.verdict === 'PASS' &&
    same(e.subject.identity, w.identity) && e.subject.deliveryBase === w.deliveryBase && e.subject.scopeRevision === w.scope.revision &&
    e.subject.criteriaRevision === w.scope.criteriaRevision && e.subject.evidenceEpoch === w.evidenceEpoch && e.subject.inputsDigest === w.inputsDigest &&
    e.subject.intentRevision === w.scope.intentRevision && e.subject.criteriaDigest === digest(w.scope.criteriaRefs) &&
    same(e.subject.integrationTarget, w.integrationTarget) && plain(e.result) && HASH.test(e.result.sha) && e.result.ref === w.integrationTarget.ref)
}
function addEvidence(record, request, context) {
  guard(record, request, context)
  const e = copy(request.evidence)
  evidenceShape(e)
  need(same(e.subject, subject(record, e.scope, context.head)), 'evidence subject is stale or belongs to another task, delivery, scope, target or input')
  const w = record.workflow
  need(e.criteria.every(id => (e.scope === 'task' ? w.task.criteria : w.scope.deliveryCriteria).includes(id)), 'evidence names criteria outside its scope')
  if (e.kind === 'integration') fail('integration evidence is recorded only by resolving a pending integration effect')
  const next = copy(record)
  const i = next.workflow.evidence.findIndex(x => x.id === e.id)
  if (i >= 0) {
    const old = next.workflow.evidence[i]
    need(['created', 'running'].includes(old.lifecycle) && same(old.subject, e.subject) && old.kind === e.kind && old.scope === e.scope && old.ref === e.ref,
      'completed evidence is immutable; use a new report id')
    need(old.lifecycle !== 'running' || e.lifecycle !== 'created', 'report lifecycle cannot move backwards')
    // Applicability precedence follows completion order, not the position assigned when a worker first started.
    if (e.lifecycle === 'completed') { next.workflow.evidence.splice(i, 1); next.workflow.evidence.push(e) }
    else next.workflow.evidence[i] = e
  } else next.workflow.evidence.push(e)
  return finish(next)
}
function authorizeEffect(record, kind, head) {
  const w = validate(record)
  need(record.mode !== 'autonomous', 'autonomous runs perform no external effects')
  if (['push', 'integrate', 'close', 'cleanup', 'branch-delete', 'worktree-remove'].includes(kind)) {
    need(w.phase === 'delivery' && ['ship', 'cleanup'].includes(w.stage), 'shipping effects require the delivery phase')
    need(!filled(record.blocked) && !filled(record.decisions) && !filled(record.running) && !w.launches.some(t => t.status === 'launched'), 'resolve blockers, decisions, running work and parallel launches before shipping effects')
    if (w.stage === 'cleanup') need(integrated(record), 'cleanup requires a confirmed integration result')
    else {
      requireEvidence(record, 'verification', 'delivery', head)
      requireEvidence(record, 'review', 'delivery', head)
    }
  }
}
function deletionPayload(payload) {
  need(plain(payload) && Object.keys(payload).sort().join(',') === 'expectedDestination,expectedOid,ref,remote' &&
    typeof payload.remote === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(payload.remote) &&
    typeof payload.ref === 'string' && /^refs\/heads\/[A-Za-z0-9._/-]+$/.test(payload.ref) && !payload.ref.includes('..') &&
    HASH.test(payload.expectedOid) && typeof payload.expectedDestination === 'string' && payload.expectedDestination.length > 0 &&
    payload.expectedDestination.length <= 4096 && !/[\r\n\0]/.test(payload.expectedDestination),
    'conditional deletion needs exactly remote, ref, expectedOid and expectedDestination')
  return { remote: payload.remote, ref: payload.ref, expectedOid: payload.expectedOid, expectedDestination: payload.expectedDestination }
}
function prepareEffect(record, request, context) {
  const w = guard(record, request, context)
  need(record.mode !== 'autonomous', 'autonomous runs perform no external effects')
  const e = request.effect
  need(plain(e) && ID.test(e.id) && ID.test(e.kind) && typeof e.target === 'string' && e.target.length > 0 && e.target.length <= 1024 && DIGEST.test(e.payloadDigest), 'invalid effect intent')
  if (e.kind === 'integrate') {
    need(!w.evidence.some(receipt => receipt.id === e.id), 'integration result receipt ID must be unique')
    need(w.evidence.length < 500, 'integration result receipt needs available evidence capacity before execution')
  }
  authorizeEffect(record, e.kind, context.head)
  const payload = e.kind === 'branch-delete' ? deletionPayload(e.payload) : undefined
  if (payload) need(e.target === `git:${payload.remote}:${payload.ref}` && e.payloadDigest === digest(payload), 'deletion intent must bind its exact resolved destination and payload')
  const next = copy(record)
  next.workflow.pendingEffect = { id: e.id, kind: e.kind, target: e.target, payloadDigest: e.payloadDigest,
    ...(payload ? { payload } : {}), status: 'prepared', subject: subject(record, 'delivery', context.head) }
  return finish(next)
}
function resolveEffect(record, request, context) {
  const w = guard(record, request, context, { pending: true, recovery: true })
  const e = w.pendingEffect
  need(e && request.id === e.id, 'pending effect id mismatch')
  need(['succeeded', 'not-applied', 'unknown'].includes(request.outcome) && typeof request.ref === 'string' && request.ref.trim(), 'effect resolution needs an outcome and evidence reference')
  if (e.status === 'unknown' || w.recovery) need(request.reconciled === true, 'an unknown or recovered write requires explicit readback reconciliation, never blind retry')
  const next = copy(record)
  if (request.outcome === 'unknown') next.workflow.pendingEffect = { ...e, status: 'unknown', ref: request.ref }
  else {
    if (request.outcome === 'succeeded' && e.kind === 'integrate') {
      need(plain(request.result) && HASH.test(request.result.sha) && request.result.ref === w.integrationTarget.ref, 'integration success needs its observed target ref and result SHA')
      next.workflow.evidence.push({ id: e.id, kind: 'integration', scope: 'delivery', ref: request.ref,
      lifecycle: 'completed', verdict: 'PASS', criteria: [], checks: [], perspectives: [], subject: e.subject, result: request.result })
    }
    next.notes = [...(Array.isArray(next.notes) ? next.notes : []), `effect ${e.id} ${request.outcome}: ${request.ref}`]
    next.workflow.pendingEffect = null
  }
  return finish(next)
}
function metadata(record, patch, request, context) {
  guard(record, request, context, { pending: true, recovery: true })
  need(plain(patch) && Object.keys(patch).every(key => !CONTROL.has(key)), 'protected control fields change only through workflow, mode or running commands')
  const next = { ...copy(record), ...copy(patch) }
  return finish(next)
}
function continued(record, session) {
  const w = validate(record)
  if (w.owner !== session || w.relinquished || w.recovery || record.mode !== 'autonomous' || w.phase !== 'task' || !['build', 'verify', 'review'].includes(w.stage) ||
      w.pendingEffect || filled(record.running) || filled(record.blocked) || filled(record.decisions)) return null
  const key = `${w.identity.delivery}/${w.task.current}`
  const next = copy(record), counts = { ...(next.counts || {}) }, count = counts[key] || {}
  if ((count.continue || 0) >= 2) return null
  counts[key] = { ...count, continue: (count.continue || 0) + 1 }
  next.counts = counts
  return finish(next)
}
module.exports = { deletionPayload, STAGES, CONTROL, HASH, digest, protectedRecord, validate, initial, subject, applicable, requireEvidence,
  contextMatches, guard, relinquish, recoverOwner, integrated, transition, addEvidence, prepareEffect, authorizeEffect, resolveEffect, metadata, continued, finish }
