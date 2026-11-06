'use strict'

// Local cooperative concurrency and provenance, not a sandbox or a remote GitHub transaction.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const os = require('node:os')
const { isSettledResult, isNotStartedResult, isSettledSuccess } = require('./devflow-execution.js')
const MAX = 1 << 20
const MAX_ARTIFACT = 64 * 1024 * 1024
const id = () => crypto.randomUUID()
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const json = value => JSON.stringify(value, null, 2) + '\n'
const fail = message => { throw new Error(message) }
const assert = (ok, message) => { if (!ok) fail(message) }
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
const positive = value => Number.isSafeInteger(value) && value > 0
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value)
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const commitOid = value => typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const nonnegative = value => Number.isSafeInteger(value) && value >= 0
const terminalEffect = effect => effect.status === 'succeeded' || effect.status === 'failed'
const now = () => new Date().toISOString()
const filled = value => !!value && (typeof value === 'object' ? Object.keys(value).length > 0 : true)
const runtime = () => ({ node: process.version, platform: process.platform, arch: process.arch })
const commandSummary = (file, args, cwd) => ({ file, argsCount: args.length, argsSha256: digest(json(args)), cwd })
function localExecutionState(result, expected) {
  const command = result?.job?.command
  if (!plain(command) || command.file !== expected.file || !Array.isArray(command.args) ||
    command.args.length !== expected.argsCount || digest(json(command.args)) !== expected.argsSha256 || command.cwd !== expected.cwd) return 'unknown'
  return isSettledResult(result) ? 'settled' : isNotStartedResult(result) ? 'not_started' : 'unknown'
}
function jobSummary(result, state) {
  const job = result?.job
  if (!plain(job)) return { state: 'unknown', reason: 'missing_job_metadata' }
  return { version: job.version, adapter: job.adapter, state,
    reason: state === 'unknown' && job.state !== 'unknown' ? 'invalid_job_metadata' : job.reason,
    launched: job.launched, rootPid: job.rootPid, rootExit: job.rootExit, observedExitCount: job.observedExitCount,
    outputComplete: job.outputComplete, hasObservedFailure: job.hasObservedFailure,
    ...(job.errorCode ? { errorCode: job.errorCode } : {}), ...(job.artifacts ? { artifacts: job.artifacts } : {}) }
}
// Host/session identity changes do not change test semantics or reset a goal's budget.
const environmentDigest = ctx => digest(json(Object.entries(ctx.env.vars || process.env)
  .filter(([key]) => !['CODEX_THREAD_ID', 'DEVFLOW_SESSION_ID', 'CLAUDE_CODE_SESSION_ID'].includes(key))
  .sort(([a], [b]) => a.localeCompare(b))))
const transitions = {
  discover: ['start'], start: ['design', 'discover'], design: ['plan', 'build', 'start', 'discover'],
  plan: ['build', 'design', 'start', 'discover'], build: ['verify', 'plan', 'design', 'start', 'discover'],
  verify: ['build', 'review', 'plan', 'design', 'start', 'discover'],
  review: ['build', 'verify', 'ship', 'plan', 'design', 'start', 'discover'],
  ship: ['build', 'review', 'cleanup', 'start', 'discover'], cleanup: ['ship', 'learn', 'done'],
  learn: ['done', 'cleanup'], done: ['start', 'learn']
}
function spend(value, kind) {
  assert(value.budget.used < value.budget.limit, 'goal budget exhausted; a new explicit budget decision is required')
  value.budget.used++
  value.budget.last = { kind, at: now() }
}
const dir = (root, n) => path.join(root, '.work', 'devflow-v2', `i${n}`)
const legacy = (root, n) => path.join(root, '.work', 'devflow', `i${n}`)
const continuityFile = (root, n) => path.join(root, '.work', 'devflow-v2-continuity', `i${n}.json`)
const gateName = 'DEVFLOW_V2.json'
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const exists = p => { try { fs.lstatSync(p); return true } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return false; throw e } }
function folders(root, target, create = false) {
  const relative = path.relative(root, target)
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'state path must stay in its repository')
  let p = root
  for (const part of relative.split(path.sep)) {
    p = path.join(p, part)
    if (!exists(p) && create) fs.mkdirSync(p)
    if (exists(p)) assert(fs.lstatSync(p).isDirectory() && !fs.lstatSync(p).isSymbolicLink(), 'state folders must be plain directories')
  }
}
function bytes(p, limit = MAX) {
  const st = fs.lstatSync(p)
  assert(st.isFile() && !st.isSymbolicLink() && st.size <= limit, `file must be plain and no larger than ${limit} bytes`)
  const fd = fs.openSync(p, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0))
  try {
    const opened = fs.fstatSync(fd)
    assert(opened.isFile() && opened.dev === st.dev && opened.ino === st.ino && opened.size <= limit, 'state file changed while opening')
    const out = fs.readFileSync(fd)
    assert(out.length <= limit, 'file grew past its byte limit')
    return out
  } finally { fs.closeSync(fd) }
}
const load = p => JSON.parse(bytes(p).toString('utf8'))
function atomic(p, value) {
  const content = json(value)
  assert(Buffer.byteLength(content) <= MAX, 'state would exceed 1 MiB')
  const tmp = `${p}.${id()}.tmp`
  const fd = fs.openSync(tmp, 'wx')
  try { fs.writeFileSync(fd, content); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  try {
    for (let i = 0; ; i++) {
      try { fs.renameSync(tmp, p); break } catch (e) {
        if (!['EACCES', 'EPERM', 'EBUSY'].includes(e.code) || i === 20) throw e
        sleep(25)
      }
    }
  } finally { fs.rmSync(tmp, { force: true }) }
}
function managed(root, n) {
  return exists(dir(root, n)) || exists(path.join(legacy(root, n), 'ledger.json', gateName))
}
function binding(ctx, n) {
  return { repo: ctx.repo.toLowerCase(), issue: n, branch: ctx.branch, storeRoot: fs.realpathSync(ctx.store), worktreeRoot: fs.realpathSync(ctx.root) }
}
function validRefs(refs, empty = false) {
  return Array.isArray(refs) && (empty || refs.length > 0) &&
    refs.every(r => plain(r) && identifier(r.id) && positive(r.definitionRevision)) && new Set(refs.map(r => r.id)).size === refs.length
}
function artifactRef(value) {
  return plain(value) && typeof value.path === 'string' && /^evidence\/[A-Za-z0-9._-]+\.json$/.test(value.path) &&
    hash(value.sha256) && nonnegative(value.bytes) && value.bytes <= MAX_ARTIFACT
}
function validateTask(task, historical = false) {
  assert(plain(task) && identifier(task.id) && identifier(task.deliveryId) && positive(task.current) && positive(task.total) && task.current <= task.total &&
    commitOid(task.baseOid) && ['serial', 'integration-batch'].includes(task.kind) &&
    (historical ? ['open', 'complete', 'abandoned'] : ['open', 'complete']).includes(task.status) &&
    validRefs(task.contributesTo) && validRefs(task.criteria), 'invalid task state')
  const checks = localChecks(task.checks)
  assert(JSON.stringify(task.criteria) === JSON.stringify(checks.map(({ id, definitionRevision }) => ({ id, definitionRevision }))), 'invalid task check identity')
}
function validateEffect(effect, owner) {
  assert(plain(effect) && identifier(effect.id) && ['check', 'intent', 'close', 'state', 'comment', 'remark', 'reopen', 'create', 'sub-issue-add'].includes(effect.op) &&
    ['pending', 'unknown', 'succeeded', 'failed'].includes(effect.status) && timestamp(effect.at) && plain(effect.target) &&
    typeof effect.target.repo === 'string' && effect.target.repo.toLowerCase() === owner.repo &&
    (effect.op === 'create' ? effect.target.issue === null : positive(effect.target.issue)), 'invalid external effect identity, target, operation or outcome')
  assert(plain(effect.request) && effect.request.file === 'gh' && positive(effect.request.argsCount) && hash(effect.request.argsSha256) &&
    typeof effect.request.cwd === 'string' && path.isAbsolute(effect.request.cwd) &&
    (effect.request.inputSha256 === null || hash(effect.request.inputSha256)), 'invalid external request binding')
  if (['check', 'intent', 'close', 'state', 'comment', 'reopen', 'sub-issue-add'].includes(effect.op)) assert(effect.target.issue === owner.issue, 'invalid external effect Issue scope')
  if (['check', 'intent', 'state'].includes(effect.op)) assert(hash(effect.expectedBodyHash) && typeof effect.expectedTitle === 'string', 'invalid external body expectation')
  if (effect.op === 'close') assert(commitOid(effect.headOid) && hash(effect.observedIntentRevision), 'invalid closure subject')
  if (['comment', 'remark', 'create'].includes(effect.op)) {
    assert(effect.ownerIssue === owner.issue && typeof effect.publicText === 'string' && effect.publicText.length <= 8000 &&
      typeof effect.actor === 'string' && effect.actor && artifactRef(effect.before) &&
      (effect.op !== 'create' || typeof effect.expectedTitle === 'string'), 'invalid external object baseline')
  }
  if (effect.op === 'sub-issue-add') assert(Array.isArray(effect.pair) && effect.pair.length === 2 && effect.pair.every(positive) && effect.pair[0] !== effect.pair[1], 'invalid relationship target')
  if (effect.transport !== undefined) assert(plain(effect.transport) && (Number.isSafeInteger(effect.transport.code) || (typeof effect.transport.code === 'string' && effect.transport.code.length > 0 && effect.transport.code.length <= 100)) &&
    ['settled', 'not_started', 'unknown'].includes(effect.transport.localState) && plain(effect.transport.job) && effect.transport.job.state === effect.transport.localState &&
    effect.transport.dispatchOutcome === dispatchOutcome(effect.transport.code, effect.transport.localState) && artifactRef(effect.transport.artifact) &&
    (effect.transport.resultUrl === undefined || objectResultUrl(effect, effect.transport.resultUrl) === effect.transport.resultUrl), 'invalid external transport evidence')
  if (effect.status === 'unknown') assert(effect.transport && timestamp(effect.observedAt), 'invalid unresolved effect receipt')
  if (effect.status === 'succeeded') {
    const seen = effect.observation
    assert(plain(seen) && timestamp(effect.observedAt) && timestamp(seen.at) && effect.transport?.localState === 'settled' &&
      effect.transport.dispatchOutcome !== 'not_sent', 'invalid confirmed effect observation')
    if (['comment', 'remark', 'create'].includes(effect.op)) {
      assert(seen.kind === 'new-object' && typeof seen.id === 'string' && seen.id.toLowerCase().startsWith(`https://github.com/${owner.repo}/issues/`) &&
        seen.actor === effect.actor && timestamp(seen.createdAt) && seen.id === effect.transport.resultUrl &&
        seen.correlation?.kind === 'transport-result-url' && seen.correlation.artifactSha256 === effect.transport.artifact.sha256, 'invalid confirmed object identity')
    } else if (effect.op === 'sub-issue-add') assert(seen.kind === 'relationship' && JSON.stringify(seen.pair) === JSON.stringify(effect.pair), 'invalid confirmed relationship identity')
    else assert(seen.kind === 'target-state' && seen.issue === effect.target.issue, 'invalid confirmed target identity')
  }
  if (effect.status === 'failed') assert(effect.transport?.dispatchOutcome === 'not_sent' && plain(effect.negative) &&
    effect.negative.kind === 'transport-not-sent' && effect.negative.code === effect.transport.code &&
    effect.negative.artifactSha256 === effect.transport.artifact.sha256 && timestamp(effect.observedAt), 'invalid terminal negative effect evidence')
}
function validate(value) {
  assert(plain(value) && value.schemaVersion === 2, 'unsupported or malformed ledger schema')
  assert(positive(value.controlSeq) && positive(value.ownerEpoch) && identifier(value.migrationId) && plain(value.binding) &&
    typeof value.binding.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(value.binding.repo) && positive(value.binding.issue) &&
    typeof value.binding.branch === 'string' && value.binding.branch && typeof value.binding.storeRoot === 'string' && path.isAbsolute(value.binding.storeRoot) &&
    typeof value.binding.worktreeRoot === 'string' && path.isAbsolute(value.binding.worktreeRoot), 'invalid control or binding metadata')
  assert(plain(value.owner) && typeof value.owner.session === 'string' && value.owner.session.length > 0, 'invalid owner')
  assert(['interactive', 'autonomous'].includes(value.mode) && Object.hasOwn(transitions, value.stage), 'invalid execution state')
  assert(['bounded', 'architectural'].includes(value.path) && /^M[0-3]$/.test(value.runMode), 'invalid tracked path or execution mode')
  assert(plain(value.budget) && positive(value.budget.limit) && nonnegative(value.budget.used) && value.budget.used <= value.budget.limit, 'invalid cumulative goal budget')
  assert(plain(value.intent) && hash(value.intent.revision) && hash(value.intent.evidenceRevision) && validRefs(value.intent.criteria), 'invalid intent')
  assert(value.intent.criteria.every(c => typeof c.text === 'string' && c.text.trim()), 'invalid intent definitions')
  assert(plain(value.delivery) && identifier(value.delivery.id) && positive(value.delivery.version) && positive(value.delivery.baselineEpoch) &&
    ['open', 'complete'].includes(value.delivery.status) && commitOid(value.delivery.originalBaseOid) && commitOid(value.delivery.reviewBaseOid) &&
    validRefs(value.delivery.criteria) && hash(value.delivery.intentRevision) && Array.isArray(value.delivery.taskIds) && value.delivery.taskIds.every(identifier), 'invalid delivery')
  if (value.delivery.status === 'complete') assert(commitOid(value.delivery.completedHeadOid) && Array.isArray(value.delivery.evidenceIds) && value.delivery.evidenceIds.length && value.delivery.evidenceIds.every(identifier), 'invalid delivery completion')
  assert(Array.isArray(value.evidence) && Array.isArray(value.effects) && Array.isArray(value.tasks) && Array.isArray(value.deliveries) &&
    Array.isArray(value.running) && Array.isArray(value.notes) && plain(value.counts) && Object.values(value.counts).every(nonnegative), 'invalid evidence, effects, tasks or bookkeeping')
  assert(new Set(value.effects.map(e => e?.id)).size === value.effects.length, 'invalid duplicate effect identity')
  for (const effect of value.effects) validateEffect(effect, value.binding)
  for (const task of value.tasks) validateTask(task, true)
  if (value.task !== null) { validateTask(value.task); assert(value.tasks.some(t => t.id === value.task.id), 'invalid current task history') }
  for (const run of value.running) assert(plain(run) && identifier(run.id) && typeof run.label === 'string' && run.label &&
    ['work-unit', 'inspection', 'bookkeeping'].includes(run.kind) && timestamp(run.startedAt), 'invalid running work')
  assert(Array.isArray(value.workUnits), 'invalid work units')
  for (const unit of value.workUnits) {
    assert(plain(unit) && identifier(unit.id) && identifier(unit.taskId) && typeof unit.worktreeRoot === 'string' && path.isAbsolute(unit.worktreeRoot) &&
      typeof unit.branch === 'string' && unit.branch && commitOid(unit.baseOid) && artifactRef(unit.baseArtifact) &&
      ['running', 'complete', 'failed', 'abandoned'].includes(unit.status), 'invalid work-unit identity or state')
    localChecks(unit.checks); assignedPaths(unit.assignedPaths)
    if (unit.status === 'complete') assert(commitOid(unit.completedHeadOid) && Array.isArray(unit.evidenceIds) && unit.evidenceIds.length && unit.evidenceIds.every(identifier), 'invalid work-unit completion')
  }
  if (Object.hasOwn(value, 'verification')) {
    const run = value.verification
    assert(plain(run) && identifier(run.id) && ['task', 'work-unit', 'delivery', 'issue', 'integration'].includes(run.scope) &&
      validRefs(run.criteria) && (run.regressionCriteria === undefined || validRefs(run.regressionCriteria, true)) &&
      plain(run.subject) && commitOid(run.subject.headOid) && hash(run.subject.reviewDigest) && artifactRef(run.inputArtifact) &&
      plain(run.command) && typeof run.command.file === 'string' && run.command.file && nonnegative(run.command.argsCount) && hash(run.command.argsSha256) &&
      typeof run.cwd === 'string' && path.isAbsolute(run.cwd) && timestamp(run.startedAt) && (run.status === undefined || run.status === 'unknown'), 'invalid verification reservation')
  }
  for (const proof of value.evidence) assert(plain(proof) && identifier(proof.id) && validRefs(proof.criteria) &&
    ['passed', 'failed', 'not_verified', 'unknown'].includes(proof.result) && hash(proof.artifactSha256) &&
    typeof proof.artifactPath === 'string' && artifactRef(proof.inputArtifact), 'invalid execution evidence')
  return value
}
function read(root, n, ctx) {
  folders(root, dir(root, n)); folders(root, path.join(legacy(root, n), 'ledger.json'))
  const marker = load(path.join(legacy(root, n), 'ledger.json', gateName))
  const value = validate(load(path.join(dir(root, n), 'ledger.json')))
  for (const effect of value.effects) if (effect.transport) verifiedTransport({ store: root }, n, effect)
  assert(marker.schemaVersion === 2 && marker.migrationId === value.migrationId, 'migration incomplete or legacy gate missing')
  if (ctx) {
    const actual = binding(ctx, n)
    assert(value.binding.repo === actual.repo && value.binding.issue === actual.issue && value.binding.storeRoot === actual.storeRoot,
      'ledger identity mismatch; execution state is unresolved')
    if (value.binding.branch !== actual.branch || value.binding.worktreeRoot !== actual.worktreeRoot) {
      // The bound owner may record cleanup after integration from the verified main tree, including after branch deletion.
      assert(actual.worktreeRoot === actual.storeRoot && !ctx.linked && ctx.bind === 'none' && ctx.branch === 'main' && value.owner.session === ctx.session &&
        ['ship', 'cleanup', 'learn', 'done'].includes(value.stage) && value.delivery.status === 'complete' &&
        /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value.delivery.completedHeadOid || ''),
      'ledger identity mismatch; execution state is unresolved')
      // The private original-object reader verifies ancestry without executing source Git configuration.
      capture(ctx, value.delivery.completedHeadOid)
    }
  }
  return value
}
// No TTL, PID guessing, rename-away or automatic stale reclamation. A crashed holder requires quiescent recovery.
function lock(root, n, fn, waitMs = 2000) {
  folders(root, dir(root, n))
  const p = path.join(dir(root, n), 'control.lock')
  const mine = id()
  const until = Date.now() + waitMs
  for (;;) {
    try { fs.writeFileSync(p, mine, { flag: 'wx' }); break } catch (e) {
      if (!['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e
      if (exists(p)) assert(fs.lstatSync(p).isFile() && !fs.lstatSync(p).isSymbolicLink(), 'unsafe control lock')
      assert(Date.now() < until, 'control lock busy; a crashed holder needs explicit quiescent recovery')
      sleep(10)
    }
  }
  const held = () => assert(bytes(p).toString() === mine, 'control lock ownership lost')
  try { const value = fn(held); assert(!value || typeof value.then !== 'function', 'control section must be synchronous'); return value }
  finally { try { if (bytes(p).toString() === mine) fs.unlinkSync(p) } catch {} }
}
function checkExpected(value, expected, ctx, claiming = false) {
  assert(plain(expected) && expected.controlSeq === value.controlSeq && expected.ownerEpoch === value.ownerEpoch,
    'stale controlSeq or ownerEpoch; read the ledger and rebuild the operation')
  assert(ctx.session && (claiming || value.owner.session === ctx.session), 'this session does not own the execution state')
}
function commit(ctx, n, expected, mutate, options = {}) {
  return lock(ctx.store, n, held => {
    const value = read(ctx.store, n, ctx)
    checkExpected(value, expected, ctx, options.claiming)
    const result = mutate(value)
    if (!value.verification && value.effects.every(terminalEffect) && !filled(value.running)) delete value.recoveryOnly
    if (result === false) return value
    value.controlSeq++
    held()
    atomic(path.join(dir(ctx.store, n), 'ledger.json'), validate(value))
    return value
  }, options.waitMs)
}
function finish(ctx, n, ownerEpoch, mutate) {
  return lock(ctx.store, n, held => {
    const value = read(ctx.store, n, ctx)
    assert(value.ownerEpoch === ownerEpoch && value.owner.session === ctx.session, 'owner changed; the reserved outcome remains available for recovery')
    mutate(value)
    if (!value.verification && value.effects.every(terminalEffect) && !filled(value.running)) delete value.recoveryOnly
    value.controlSeq++
    held(); atomic(path.join(dir(ctx.store, n), 'ledger.json'), validate(value))
    return value
  })
}
const expectedOf = value => ({ controlSeq: value.controlSeq, ownerEpoch: value.ownerEpoch })
function own(ctx, n, allowMain = false) {
  assert(ctx && ctx.repo && ctx.session, 'v2 writes require an attributed host session and repository')
  if (ctx.bind === 'own' && ctx.issue === n) return
  if (allowMain && !ctx.linked && ctx.bind === 'none' && ctx.branch === 'main') { read(ctx.store, n, ctx); return }
  fail('v2 writes require the working Issue branch, or its bound owner on verified integrated main')
}
function gitResult(ctx, args) {
  // The same environment filtering as the review package; no replacement objects in a subject identity.
  const review = require('./devflow-review.js')
  const result = ctx.env.run('git', review.safeGitArgs(args), { cwd: ctx.root, env: review.safeGitEnv(ctx.env.vars || process.env) })
  return result
}
function git(ctx, args) {
  const result = gitResult(ctx, args)
  assert(result.code === 0, `Git identity read failed: ${args[0]}`)
  return result.stdout.trim()
}
function reviewEnv(ctx) {
  return { ...ctx.env, run(file, args, opts = {}) {
    return ctx.env.run(file, args, { ...opts, maxBuffer: MAX_ARTIFACT })
  } }
}
function subject(ctx) {
  const got = require('./devflow-review.js').readOriginalHead(reviewEnv(ctx), ctx.root)
  assert(got.code === 0, got.out)
  return got.headOid
}
function capture(ctx, baseOid, headOid = subject(ctx)) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-evidence-'))
  const executionInputs = semanticMetadata(ctx)
  try {
    const got = require('./devflow-review.js').createReviewPackage(reviewEnv(ctx), ctx.root,
      { baseOid, headOid, outputDir: path.join(temporary, 'package') })
    assert(got.code === 0, got.out)
    // Private execution files must not become part of a changing candidate. Setup already ignores .work/.
    assert(!got.manifest.inputs.some(x => x.path === '.work' || x.path.startsWith('.work/')),
      'ignore the private .work/ directory before capturing repository evidence')
    const diff = bytes(got.diffPath, MAX_ARTIFACT).toString('utf8')
    // Compare structured tree identities; repository-controlled patch text is never a control input.
    let headTreeOid = got.manifest.headTreeOid
    if (!headTreeOid) {
      const clean = require('./devflow-review.js').createReviewPackage(reviewEnv(ctx), ctx.root,
        { baseOid, headOid, dirtyPaths: [], outputDir: path.join(temporary, 'head') })
      assert(clean.code === 0, clean.out)
      headTreeOid = clean.manifest.indexTreeOid
    }
    assert(JSON.stringify(executionInputs) === JSON.stringify(semanticMetadata(ctx)), 'execution configuration or worktree binding changed during capture')
    const manifest = { ...got.manifest, executionInputs }
    // Keep the full read guard in the artifact, but other refs and raw index stat caches are not tested code.
    const { metadataDigest, limits, ...semantic } = manifest
    return { manifest, digest: digest(json(semantic)), diff,
      dirty: got.manifest.indexTreeOid !== headTreeOid || got.manifest.worktreeTreeOid !== headTreeOid }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
}
function worktreeContext(ctx, requested) {
  assert(typeof requested === 'string' && path.isAbsolute(requested) && !requested.includes('\0'), 'worktreeRoot must be an existing absolute local path')
  const root = fs.realpathSync(requested), common = fs.realpathSync(path.join(ctx.store, '.git'))
  assert(fs.lstatSync(common).isDirectory() && !fs.lstatSync(common).isSymbolicLink(), 'the main Git directory must be plain')
  let own = path.join(root, '.git')
  if (root !== fs.realpathSync(ctx.store)) {
    const m = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(bytes(own, 4096).toString('utf8'))
    assert(m && !/^[/\\]{2}/.test(m[1]), 'invalid linked worktree pointer')
    own = path.resolve(root, m[1])
    folders(ctx.store, own)
    assert(path.dirname(own) === path.join(common, 'worktrees'), 'work unit must belong to the same Git common repository')
    const back = bytes(path.join(own, 'gitdir'), 4096).toString('utf8').trim()
    const commonPointer = bytes(path.join(own, 'commondir'), 4096).toString('utf8').trim()
    assert(path.resolve(own, back) === path.join(root, '.git') && path.resolve(own, commonPointer) === common,
      'linked worktree back-reference or common repository changed')
  } else assert(own === common, 'unsupported main Git layout')
  const head = bytes(path.join(own, 'HEAD'), 4096).toString('utf8')
  const branch = /^ref: refs\/heads\/([^\r\n]+)\r?\n?$/.exec(head)?.[1] || ''
  return { ...ctx, root, branch, gitDir: own, gitCommonDir: common }
}
function semanticMetadata(ctx) {
  const resolved = worktreeContext(ctx, ctx.root)
  const optional = p => {
    try { return digest(bytes(p)) } catch (e) { if (e.code === 'ENOENT') return null; throw e }
  }
  return { worktreeRoot: resolved.root, gitDir: resolved.gitDir, commonDir: resolved.gitCommonDir, branch: resolved.branch,
    config: optional(path.join(resolved.gitCommonDir, 'config')), worktreeConfig: optional(path.join(resolved.gitDir, 'config.worktree')),
    exclude: optional(path.join(resolved.gitCommonDir, 'info', 'exclude')), shallow: optional(path.join(resolved.gitCommonDir, 'shallow')) }
}
function localChecks(input) {
  assert(Array.isArray(input) && input.length > 0 && input.length <= 64, 'checks must contain 1-64 task-local definitions')
  const seen = new Set()
  return input.map(c => {
    assert(plain(c) && identifier(c.id) && positive(c.definitionRevision) && !seen.has(c.id) &&
      typeof c.text === 'string' && c.text.trim() && c.text.length <= 2000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(c.text), 'invalid or duplicate local check definition')
    seen.add(c.id)
    return { id: c.id, definitionRevision: c.definitionRevision, text: c.text.trim() }
  })
}
function within(selected, allowed, label) {
  assert(selected.every(c => allowed.some(a => a.id === c.id && a.definitionRevision === c.definitionRevision)), `${label} is outside the selected delivery; revise the delivery explicitly before accepting additional scope`)
}
function taskDefinition(args, current, selected) {
  const checks = localChecks(args.checks)
  const contributesTo = refs(args.contributesTo, current)
  within(contributesTo, selected, 'task contribution')
  return { kind: args.kind || 'serial', checks, contributesTo,
    criteria: checks.map(({ id, definitionRevision }) => ({ id, definitionRevision })) }
}
function assignedPaths(input) {
  assert(Array.isArray(input) && input.length && input.length <= 64, 'assignedPaths must contain 1-64 literal repository paths')
  const seen = new Set()
  return input.map(p => {
    assert(typeof p === 'string' && p && !path.isAbsolute(p) && !/[\0*?\[\]\\]/.test(p) && !p.split('/').some(x => !x || x === '.' || x === '..') && !seen.has(p), 'assignedPaths must be unique literal relative file or directory paths')
    seen.add(p); return p
  })
}
const overlaps = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/')
function unitDefinition(unit) {
  return digest(json({ id: unit.id, taskId: unit.taskId, worktreeRoot: unit.worktreeRoot, branch: unit.branch,
    baseOid: unit.baseOid, assignedPaths: unit.assignedPaths, checks: unit.checks, baseArtifact: unit.baseArtifact }))
}
function unitChanges(ctx, n, unit, captured) {
  const raw = bytes(path.join(dir(ctx.store, n), unit.baseArtifact.path), MAX_ARTIFACT)
  assert(digest(raw) === unit.baseArtifact.sha256, 'work-unit baseline artifact changed')
  const old = new Map(JSON.parse(raw).inputs.map(x => [x.path, x.worktree]))
  const next = new Map(captured.manifest.inputs.map(x => [x.path, x.worktree]))
  const changed = [...new Set([...old.keys(), ...next.keys()])].filter(p => JSON.stringify(old.get(p) || null) !== JSON.stringify(next.get(p) || null)).sort()
  assert(changed.every(p => unit.assignedPaths.some(allowed => p === allowed || p.startsWith(allowed + '/'))), 'work unit changed a path outside its assigned scope')
  return changed
}
function executionFor(ctx, value, scope, args) {
  if (scope === 'work-unit') {
    const unit = (value.workUnits || []).find(x => x.id === args.unitId && x.taskId === value.task?.id)
    assert(unit && ['running', 'complete'].includes(unit.status), 'work unit is absent, abandoned or belongs to another task')
    const execution = worktreeContext(ctx, unit.worktreeRoot)
    assert(execution.branch === unit.branch, 'work-unit branch changed')
    return { execution, baseOid: unit.baseOid, unit }
  }
  if (scope === 'integration') {
    assert(value.delivery.status === 'complete' && value.delivery.completedHeadOid, 'integration checks require a completed source delivery')
    const execution = worktreeContext(ctx, args.targetWorktreeRoot)
    assert(execution.branch === 'main', 'integration verification must run in the actual main checkout')
    // This bounded workflow supports observed merge-commit integration, not inferred squash/cherry-pick equivalence.
    capture(execution, value.delivery.completedHeadOid)
    return { execution, baseOid: value.delivery.reviewBaseOid }
  }
  return { execution: ctx, baseOid: scope === 'task' && value.task ? value.task.baseOid : value.delivery.reviewBaseOid }
}
function reviewPackage(ctx, n, args, deps) {
  const value = read(ctx.store, n, ctx)
  const scope = args.scope || 'delivery'
  assert(['task', 'work-unit', 'delivery', 'issue', 'integration'].includes(scope), 'review scope must be task, work-unit, delivery, issue or integration')
  assert(scope !== 'task' || value.task, 'task review requires a current task')
  assert(live(ctx, n, deps).intent.revision === value.intent.revision, 'Issue intent changed; reconcile before reviewing')
  const selection = executionFor(ctx, value, scope, args), execution = selection.execution
  const head = subject(execution), base = selection.baseOid
  const captured = capture(execution, base, head)
  if (selection.unit) unitChanges(ctx, n, selection.unit, captured)
  const current = read(ctx.store, n, ctx)
  assert(current.controlSeq === value.controlSeq && current.ownerEpoch === value.ownerEpoch, 'control changed while reviewing; recapture the current scope')
  const manifest = json({ ...captured.manifest, devflow: { scope, taskId: ['task', 'work-unit'].includes(scope) ? value.task.id : null,
    ...(selection.unit ? { unitId: selection.unit.id, unitDefinitionDigest: unitDefinition(selection.unit) } : {}),
    ...(scope === 'integration' ? { integration: { sourceHeadOid: value.delivery.completedHeadOid, targetWorktreeRoot: execution.root, targetHeadOid: head } } : {}),
    subject: signature(value, head, captured.digest), expected: expectedOf(value),
    criteria: ['issue', 'integration'].includes(scope) ? value.intent.criteria.map(({ id, definitionRevision }) => ({ id, definitionRevision })) : scope === 'task' ? value.task.criteria : selection.unit ? selection.unit.checks.map(({ id, definitionRevision }) => ({ id, definitionRevision })) : value.delivery.criteria } })
  assert(Buffer.byteLength(manifest) <= MAX_ARTIFACT, 'review manifest exceeds 64 MiB')
  const output = path.join(dir(ctx.store, n), 'reviews', id())
  folders(ctx.store, output, true)
  fs.writeFileSync(path.join(output, 'manifest.json'), manifest, { flag: 'wx', mode: 0o600 })
  fs.writeFileSync(path.join(output, 'diff.patch'), captured.diff, { flag: 'wx', mode: 0o600 })
  return { status: 'NOT_VERIFIED', scope, ...(selection.unit ? { unitId: selection.unit.id } : {}), executionRoot: execution.root, headOid: head, baseOid: base, dirty: captured.dirty,
    reviewDigest: captured.digest, manifestPath: path.join(output, 'manifest.json'), diffPath: path.join(output, 'diff.patch'),
    expected: expectedOf(value), message: 'Review input only; no command ran and no acceptance evidence was created.' }
}
function oid(ctx, ref) {
  assert(typeof ref === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(ref), 'baseline must be a full commit OID')
  capture(ctx, ref)
  return ref
}
function intent(body, deps) {
  const section = deps.criteria(body)
  assert(section && section.plain && section.boxes.length, 'v2 requires plain acceptance criteria with stable labels')
  const seen = new Set()
  const criteria = section.boxes.map((box, index) => {
    const m = /^\[AC:([A-Za-z0-9][A-Za-z0-9._-]{0,79})@([1-9][0-9]*)\] (.+)$/.exec(box.text)
    assert(m && positive(Number(m[2])), `criterion ${index + 1} needs [AC:id@definitionRevision] text`)
    assert(!seen.has(m[1]), `duplicate acceptance criterion ID: ${m[1]}`)
    seen.add(m[1])
    return { id: m[1], definitionRevision: Number(m[2]), text: m[3], checked: box.checked, at: box.at, number: index + 1 }
  })
  const span = deps.stateSpan(body)
  let approved = body.slice(0, span ? span[0] : body.length)
  for (const box of section.boxes) {
    assert(box.at < approved.length, 'acceptance criteria must precede the current-state section')
    approved = approved.slice(0, box.at) + ' ' + approved.slice(box.at + 1)
  }
  const normalize = text => text.replace(/\r\n/g, '\n').trim()
  const revision = digest(normalize(approved))
  // Only a contiguous list of single-line criteria supports order-independent proof.
  // Prose, continuation lines and headings are context, never sortable criterion content.
  const lines = section.boxes.map((box, i) => {
    const start = box.at - 3, newline = approved.indexOf('\n', start), end = newline < 0 ? approved.length : newline
    return { start, end, id: criteria[i].id, raw: approved.slice(start, end).replace(/\r$/, ''), text: box.text }
  })
  const simple = lines.every((line, i) => /^- \[ \] /.test(line.raw) &&
    line.raw.slice(6).replace(/\s+/g, ' ').trim() === line.text && (!i || lines[i - 1].end + 1 === line.start))
  const semantic = simple ? approved.slice(0, lines[0].start) + [...lines].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(line => line.raw).join('\n') + approved.slice(lines.at(-1).end) : approved
  return { revision, evidenceRevision: digest(normalize(semantic)), criteria }
}
const storedIntent = value => ({ revision: value.revision, evidenceRevision: value.evidenceRevision,
  criteria: value.criteria.map(({ id, definitionRevision, text }) => ({ id, definitionRevision, text })) })
const sameRefs = (a, b) => a.length === b.length && a.every(c => b.some(x => x.id === c.id && x.definitionRevision === c.definitionRevision))
function refs(input, current) {
  assert(Array.isArray(input) && input.length > 0, 'criteria must be a nonempty array of ID and definitionRevision pairs')
  const seen = new Set()
  return input.map(ref => {
    assert(plain(ref) && identifier(ref.id) && positive(ref.definitionRevision) && !seen.has(ref.id), 'invalid or duplicate criterion reference')
    seen.add(ref.id)
    assert(current.criteria.some(c => c.id === ref.id && c.definitionRevision === ref.definitionRevision), `criterion ${ref.id} is absent or its definition changed`)
    return { id: ref.id, definitionRevision: ref.definitionRevision }
  })
}
function definitions(old, next) {
  for (const c of next.criteria) {
    const prev = old.criteria.find(p => p.id === c.id)
    if (!prev) { assert(c.definitionRevision === 1, 'new criteria start at definition revision 1'); continue }
    assert(c.text === prev.text ? c.definitionRevision === prev.definitionRevision : c.definitionRevision === prev.definitionRevision + 1,
      `criterion ${c.id} changed without the required definition revision`)
  }
}
function live(ctx, n, deps) {
  const got = deps.fetchIssue(ctx, n)
  assert(!got.error, got.error)
  assert(['OWNER', 'MEMBER', 'COLLABORATOR'].includes(got.issue.authorAssociation), 'Issue body author is not a writer')
  return { issue: got.issue, intent: intent(got.issue.body || '', deps) }
}
function noPending(value) {
  assert(!value.recoveryOnly, 'recovery-only ownership: reconcile effects and confirm all running work stopped before resuming')
  assert(value.effects.every(terminalEffect), 'an external effect is pending or unknown; reconcile it before continuing')
  assert(!value.verification, 'a verification is running or interrupted; inspect it before recovery')
}
function delivery(value, args, head, current) {
  assert(identifier(args.id), 'delivery id is required')
  const base = args.reviewBaseOid || head
  return { id: args.id, version: 1, status: 'open', intentRevision: current.revision,
    criteria: refs(args.criteria, current), originalBaseOid: base, reviewBaseOid: base, baselineEpoch: 1, taskIds: [] }
}
function recoveredBudget(ctx, n, old, requested) {
  const budget = old.budget
  assert(budget === undefined || (plain(budget) && positive(budget.limit) && Number.isSafeInteger(budget.used) && budget.used >= 0), 'legacy budget is ambiguous')
  let prior = budget
  const file = continuityFile(ctx.store, n)
  folders(ctx.store, path.dirname(file))
  if (exists(file)) {
    const anchor = load(file)
    assert(plain(anchor) && anchor.schemaVersion === 1 && anchor.repo === ctx.repo.toLowerCase() && anchor.issue === n &&
      anchor.storeRoot === fs.realpathSync(ctx.store) && identifier(anchor.migrationId) &&
      anchor.archive === `i${n}-${anchor.migrationId}`, 'invalid goal budget continuity record')
    const archive = path.join(ctx.store, '.work', 'devflow-v2-archive', anchor.archive)
    folders(ctx.store, archive)
    const raw = bytes(path.join(archive, 'ledger.json'))
    const archived = validate(JSON.parse(raw.toString('utf8')))
    assert(digest(raw) === anchor.ledgerSha256 && archived.migrationId === anchor.migrationId &&
      archived.binding.repo === anchor.repo && archived.binding.issue === n && archived.binding.storeRoot === anchor.storeRoot &&
      JSON.stringify(archived.budget) === JSON.stringify(anchor.budget), 'archived budget continuity cannot be verified')
    assert(!budget || budget.limit <= archived.budget.limit, 'legacy budget limit changed after rollback; recover the recorded limit before activation')
    prior = { ...archived.budget, used: Math.max(archived.budget.used, budget?.used || 0) }
  } else {
    const archives = path.join(ctx.store, '.work', 'devflow-v2-archive')
    folders(ctx.store, archives)
    assert(!exists(archives) || !fs.readdirSync(archives).some(name => name.startsWith(`i${n}-`)), 'goal budget continuity record is missing for an archived generation')
  }
  assert(requested === undefined || positive(requested), 'budgetLimit must be positive')
  assert(!prior || requested === undefined || requested === prior.limit, 'activation cannot change an existing goal budget limit; activate with its recorded limit and use budget-extend explicitly')
  const result = prior ? { ...prior } : { limit: requested || 20, used: 0 }
  assert(result.limit >= result.used, 'activation cannot reset or understate cumulative budget use')
  return result
}
function activate(ctx, n, args, deps) {
  own(ctx, n)
  assert(args.quiescent === true, 'activation requires --quiescent after all old writers and in-flight effects have stopped')
  const current = live(ctx, n, deps)
  assert(args.observedIntentRevision === current.intent.revision, 'observedIntentRevision must match the current approved Issue')
  const head = subject(ctx)
  folders(ctx.store, path.dirname(dir(ctx.store, n)), true)
  folders(ctx.store, legacy(ctx.store, n), true)
  assert(!managed(ctx.store, n), 'v2 state already exists; inspect or roll back the recorded migration')
  const oldFile = path.join(legacy(ctx.store, n), 'ledger.json')
  const oldBytes = exists(oldFile) ? bytes(oldFile) : null
  const old = oldBytes ? JSON.parse(oldBytes.toString()) : {}
  assert(plain(old), 'legacy ledger must be an object')
  const recovering = Object.keys(old).length > 0
  assert(!recovering || (args.delivery?.reviewBaseOid && typeof args.recoveryReason === 'string' && args.recoveryReason.trim()),
    'a nonempty legacy ledger needs an explicit recovered delivery base/scope and recoveryReason')
  const first = delivery(null, args.delivery || {}, head, current.intent)
  oid(ctx, first.reviewBaseOid)
  let recoveredTask = null
  if (filled(old.task)) {
    const task = args.recoveredTask
    assert(plain(task) && identifier(task.id) && positive(task.current) && positive(task.total) && task.current <= task.total,
      'legacy task progress needs an explicit recoveredTask identity/current/total/baseOid/checks/contributesTo; completion is not inherited')
    recoveredTask = { id: task.id, current: task.current, total: task.total, baseOid: oid(ctx, task.baseOid),
      status: 'open', deliveryId: first.id, ...taskDefinition(task, current.intent, first.criteria) }
    first.taskIds.push(task.id)
  }
  const budget = recoveredBudget(ctx, n, old, args.budgetLimit)
  assert(!old.stage || Object.hasOwn(transitions, old.stage), 'legacy stage is ambiguous; reconcile it before migration')
  assert(!old.path || ['bounded', 'architectural'].includes(old.path), 'legacy tracked path is ambiguous')
  assert(!old.runMode || /^M[0-3]$/.test(old.runMode), 'legacy execution mode is ambiguous')
  assert(!old.verification && (!old.running || Object.keys(old.running).length === 0), 'legacy delegation must be stopped before activation')
  // Exclusive creation reserves the destination. Any incomplete cutover blocks all new readers.
  fs.mkdirSync(dir(ctx.store, n))
  const migrationId = id()
  atomic(path.join(dir(ctx.store, n), 'migration.json'), { migrationId, phase: 'prepared', hadLegacy: !!oldBytes,
    legacySha256: oldBytes ? digest(oldBytes) : null, quiescentDeclaredAt: now() })
  if (oldBytes) fs.writeFileSync(path.join(dir(ctx.store, n), 'legacy-ledger.json'), oldBytes, { flag: 'wx' })
  const switched = deps.withLock(ctx.store, n, () => {
    assert(!exists(oldFile) || (oldBytes && bytes(oldFile).equals(oldBytes)), 'legacy ledger changed during migration')
    if (oldBytes) fs.unlinkSync(oldFile)
    fs.mkdirSync(oldFile)
    atomic(path.join(oldFile, gateName), { schemaVersion: 2, migrationId })
  })
  assert(switched.ok, 'legacy lock busy or unsafe; migration remains incomplete')
  const value = { schemaVersion: 2, migrationId, binding: binding(ctx, n), controlSeq: 1, ownerEpoch: 1,
    owner: { session: ctx.session }, stage: typeof old.stage === 'string' ? old.stage : 'start',
    path: old.path || 'bounded', runMode: old.runMode || 'M0', mode: 'interactive',
    intent: storedIntent(current.intent), delivery: first, deliveries: [], task: recoveredTask, tasks: recoveredTask ? [{ ...recoveredTask }] : [],
    evidence: [], effects: [], notes: Array.isArray(old.notes) ? [...old.notes] : filled(old.notes) ? [{ legacyNotes: old.notes }] : [],
    counts: {}, blocked: old.blocked ?? [], decisions: old.decisions ?? [], running: [], workUnits: [], followups: old.followups ?? [],
    legacyPrivate: old, migrationRecovery: recovering ? { reason: args.recoveryReason, at: now() } : null,
    budget }
  atomic(path.join(dir(ctx.store, n), 'ledger.json'), validate(value))
  atomic(path.join(dir(ctx.store, n), 'migration.json'), { migrationId, phase: 'active', hadLegacy: !!oldBytes,
    legacySha256: oldBytes ? digest(oldBytes) : null, activatedAt: now() })
  return value
}
function rollback(ctx, n, args, deps) {
  own(ctx, n)
  assert(args.quiescent === true && typeof args.reason === 'string' && args.reason.trim(), 'rollback needs stopped old/new writers and an explicit reason')
  folders(ctx.store, dir(ctx.store, n))
  return lock(ctx.store, n, held => {
    const root = dir(ctx.store, n), oldFile = path.join(legacy(ctx.store, n), 'ledger.json')
    const migration = load(path.join(root, 'migration.json'))
    assert(identifier(migration.migrationId), 'invalid migration identity')
    const original = migration.hadLegacy ? bytes(path.join(root, 'legacy-ledger.json')) : null
    assert(!original || digest(original) === migration.legacySha256, 'legacy backup changed; nothing restored')
    let value = null
    if (exists(path.join(root, 'ledger.json'))) {
      value = migration.phase === 'rollback-prepared' ? validate(load(path.join(root, 'ledger.json'))) : read(ctx.store, n, ctx)
      assert(value.binding.repo === ctx.repo.toLowerCase() && value.binding.issue === n && value.binding.storeRoot === fs.realpathSync(ctx.store), 'rollback budget identity mismatch')
      if (migration.phase !== 'rollback-prepared') checkExpected(value, args.expected, ctx)
      noPending(value)
      assert(!filled(value.running), 'running work must finish before rollback')
    }
    const archiveRoot = path.join(ctx.store, '.work', 'devflow-v2-archive')
    folders(ctx.store, archiveRoot, true)
    const archive = path.join(archiveRoot, `i${n}-${migration.migrationId}`)
    assert(!exists(archive), 'rollback archive already exists; inspect it before recovery')
    held()
    const result = deps.withLock(ctx.store, n, () => {
      let gate = false, restored = false
      if (exists(oldFile)) {
        const st = fs.lstatSync(oldFile)
        if (st.isDirectory() && !st.isSymbolicLink()) {
          const names = fs.readdirSync(oldFile)
          assert(names.length === 1 && names[0] === gateName && load(path.join(oldFile, gateName)).migrationId === migration.migrationId,
            'unexpected legacy directory; rollback will not remove it')
          gate = true
        } else {
          restored = migration.phase === 'rollback-prepared' && !!original && bytes(oldFile).equals(original)
          assert(restored, 'unexpected legacy file; rollback will not overwrite it')
        }
      }
      atomic(path.join(root, 'migration.json'), { ...migration, phase: 'rollback-prepared', reason: args.reason, at: now() })
      if (value) {
        const continuity = continuityFile(ctx.store, n)
        folders(ctx.store, path.dirname(continuity), true)
        atomic(continuity, { schemaVersion: 1, repo: value.binding.repo, issue: n, storeRoot: value.binding.storeRoot,
          migrationId: value.migrationId, archive: path.basename(archive), ledgerSha256: digest(bytes(path.join(root, 'ledger.json'))), budget: value.budget, at: now() })
      }
      if (gate) { fs.unlinkSync(path.join(oldFile, gateName)); fs.rmdirSync(oldFile) }
      if (original && !restored) fs.writeFileSync(oldFile, original, { flag: 'wx' })
      // The v2 directory remains a fail-closed marker until its entire history is archived.
      held(); fs.renameSync(root, archive)
    })
    assert(result.ok, 'legacy lock busy; rollback remains recorded for recovery')
    return { restoredLegacy: !!original, archive, reason: args.reason }
  })
}
function config(ctx, files) {
  assert(Array.isArray(files) && files.length <= 32, 'configFiles must be a bounded array')
  return files.map(file => {
    assert(typeof file === 'string' && file && !file.includes('\0') && !path.isAbsolute(file) && !file.split(/[\\/]/).includes('..'), 'configuration path must be repository relative')
    const absolute = path.resolve(ctx.root, file)
    let parent = path.dirname(absolute)
    while (parent !== ctx.root) { assert(fs.lstatSync(parent).isDirectory() && !fs.lstatSync(parent).isSymbolicLink(), 'configuration path contains a link'); parent = path.dirname(parent) }
    return { path: file, sha256: digest(bytes(absolute)) }
  })
}
function signature(value, head, reviewDigest) {
  return { repo: value.binding.repo, issue: value.binding.issue, headOid: head, intentRevision: value.intent.revision,
    intentEvidenceRevision: value.intent.evidenceRevision,
    deliveryId: value.delivery.id, deliveryVersion: value.delivery.version, reviewBaseOid: value.delivery.reviewBaseOid,
    baselineEpoch: value.delivery.baselineEpoch, reviewDigest }
}
function evidenceApplies(value, proof, head, scope, ctx, currentCapture) {
  let selection
  try {
    selection = executionFor(ctx, value, scope, { unitId: proof.unitId, targetWorktreeRoot: proof.integration?.targetWorktreeRoot })
    currentCapture ||= capture(selection.execution, selection.baseOid, head)
  } catch { return false }
  const execution = selection.execution
  const { intentRevision: originalObservedRevision, ...proofIdentity } = proof.subject || {}
  const { intentRevision: currentObservedRevision, ...currentIdentity } = signature(value, head, currentCapture.digest)
  if (!hash(originalObservedRevision) || !identifier(proof.id) || proof.result !== 'passed' || proof.scope !== scope || JSON.stringify(proofIdentity) !== JSON.stringify(currentIdentity) ||
    proof.environmentDigest !== environmentDigest(execution) || JSON.stringify(proof.runtime) !== JSON.stringify(runtime()) || proof.cwd !== execution.root) return false
  if (scope === 'task' && (!value.task || proof.taskId !== value.task.id || proof.taskBaseOid !== value.task.baseOid || proof.checksDigest !== digest(json(value.task.checks)))) return false
  if (scope === 'work-unit' && (proof.unitDefinitionDigest !== unitDefinition(selection.unit) || proof.taskId !== value.task?.id)) return false
  if (scope === 'integration' && (proof.integration?.sourceHeadOid !== value.delivery.completedHeadOid || proof.integration?.targetHeadOid !== head)) return false
  try {
    const artifactRoot = path.join(dir(ctx.store, value.binding.issue), 'evidence')
    folders(ctx.store, artifactRoot)
    const input = bytes(path.join(artifactRoot, `${proof.id}.input.json`), MAX_ARTIFACT)
    const artifact = bytes(path.join(artifactRoot, `${proof.id}.json`), MAX_ARTIFACT)
    return digest(input) === proof.inputArtifact.sha256 && digest(artifact) === proof.artifactSha256 && JSON.stringify(config(execution, proof.config.map(c => c.path))) === JSON.stringify(proof.config)
  } catch { return false }
}
function covered(value, ids, selected, head, scope, ctx, regressions = []) {
  assert(Array.isArray(ids) && ids.length, 'execution evidence IDs are required')
  const proofs = ids.map(key => value.evidence.find(e => e.id === key))
  assert(proofs.every(p => p && p.scope === scope), 'evidence is missing or from another scope')
  if (scope === 'work-unit') assert(proofs.every(p => p.unitId === proofs[0].unitId), 'evidence mixes different work units')
  if (scope === 'integration') assert(proofs.every(p => p.integration?.targetWorktreeRoot === proofs[0].integration?.targetWorktreeRoot), 'evidence mixes different integration targets')
  const selection = executionFor(ctx, value, scope, { unitId: proofs[0].unitId, targetWorktreeRoot: proofs[0].integration?.targetWorktreeRoot })
  if (['work-unit', 'integration'].includes(scope)) head = subject(selection.execution)
  const candidate = capture(selection.execution, selection.baseOid, head)
  if (scope !== 'task') assert(!candidate.dirty, 'acceptance and work-unit results need a clean committed candidate; task verification supports dirty inputs')
  assert(proofs.every(p => evidenceApplies(value, p, head, scope, ctx, candidate)), 'evidence is missing, failed, stale, from another scope or its artifact/configuration changed')
  assert(selected.every(c => proofs.some(p => p.criteria.some(x => x.id === c.id && x.definitionRevision === c.definitionRevision))), 'evidence does not cover the selected acceptance criteria or local checks')
  assert(regressions.every(c => proofs.some(p => [...p.criteria, ...(p.regressionCriteria || [])].some(x => x.id === c.id && x.definitionRevision === c.definitionRevision))), 'evidence does not cover the affected regression criteria')
  if (selection.unit) unitChanges(ctx, value.binding.issue, selection.unit, candidate)
  return { headOid: head, execution: selection.execution, candidate }
}
function verify(ctx, n, args, deps) {
  own(ctx, n, true)
  assert(['task', 'work-unit', 'delivery', 'issue', 'integration'].includes(args.scope), 'verification scope must be task, work-unit, delivery, issue or integration')
  if (ctx.bind !== 'own') assert(args.scope === 'integration', 'integrated main only permits verification of the actual integration result')
  assert(plain(args.command) && typeof args.command.file === 'string' && args.command.file && !args.command.file.includes('\0') && Array.isArray(args.command.args) && args.command.args.every(a => typeof a === 'string' && !a.includes('\0')), 'verification needs an executable and argument array')
  const snapshot = read(ctx.store, n, ctx)
  checkExpected(snapshot, args.expected, ctx)
  const selected = executionFor(ctx, snapshot, args.scope, args), execution = selected.execution
  const head = subject(execution)
  const candidate = capture(execution, selected.baseOid, head)
  if (args.scope !== 'task') assert(!candidate.dirty, 'acceptance and work-unit verification need a clean committed candidate; task verification supports dirty inputs')
  if (selected.unit) unitChanges(ctx, n, selected.unit, candidate)
  const configuration = config(execution, args.configFiles || [])
  const current = live(ctx, n, deps)
  const evidenceId = id()
  const artifactDir = path.join(dir(ctx.store, n), 'evidence')
  folders(ctx.store, artifactDir, true)
  const inputBytes = json({ reviewManifest: candidate.manifest, reviewDiff: candidate.diff, command: args.command })
  assert(Buffer.byteLength(inputBytes) <= MAX_ARTIFACT, 'verification inputs exceed the 64 MiB artifact limit; command not started')
  const inputArtifact = { path: `evidence/${evidenceId}.input.json`, sha256: digest(inputBytes), bytes: Buffer.byteLength(inputBytes) }
  const initial = commit(ctx, n, args.expected, value => {
    noPending(value)
    assert(value.intent.revision === current.intent.revision, 'Issue intent changed; reconcile it before verification')
    if (args.scope === 'task') assert(value.task && value.task.status === 'open', 'no open task')
    if (args.scope === 'work-unit') assert(selected.unit.status === 'running', 'work unit is already stopped')
    spend(value, 'verification')
    const selection = refs(args.criteria, args.scope === 'task' ? { criteria: value.task.checks } : args.scope === 'work-unit' ? { criteria: selected.unit.checks } : value.intent)
    if (args.scope === 'delivery') within(selection, value.delivery.criteria, 'delivery acceptance')
    assert(args.regressionCriteria === undefined || args.scope === 'delivery', 'separate regressionCriteria are supported only by delivery verification')
    const regressions = args.regressionCriteria === undefined ? [] : refs(args.regressionCriteria, value.intent)
    value.verification = { id: evidenceId, scope: args.scope, criteria: selection, regressionCriteria: regressions, subject: signature(value, head, candidate.digest), inputArtifact,
      taskId: ['task', 'work-unit'].includes(args.scope) ? value.task.id : null, taskBaseOid: args.scope === 'task' ? value.task.baseOid : null,
      ...(args.scope === 'task' ? { checksDigest: digest(json(value.task.checks)), contributesTo: value.task.contributesTo } : {}),
      ...(selected.unit ? { unitId: selected.unit.id, unitDefinitionDigest: unitDefinition(selected.unit) } : {}),
      ...(args.scope === 'integration' ? { integration: { sourceHeadOid: value.delivery.completedHeadOid, targetWorktreeRoot: execution.root, targetHeadOid: head } } : {}),
      command: { file: args.command.file, argsCount: args.command.args.length, argsSha256: digest(json(args.command.args)) }, cwd: execution.root, config: configuration, runtime: runtime(), environmentDigest: environmentDigest(execution), startedAt: now() }
    fs.writeFileSync(path.join(artifactDir, `${evidenceId}.input.json`), inputBytes, { flag: 'wx', mode: 0o600 })
  })
  let result
  try { result = execution.env.run(args.command.file, args.command.args, { cwd: execution.root, env: execution.env.vars || process.env, timeout: 120000, settleJob: true }) }
  catch (e) { result = { code: 'exception', stdout: '', stderr: e.message } }
  let unchanged = false
  try {
    unchanged = subject(execution) === head && capture(execution, selected.baseOid, head).digest === candidate.digest &&
      JSON.stringify(configuration) === JSON.stringify(config(execution, configuration.map(x => x.path))) && initial.verification.environmentDigest === environmentDigest(execution) &&
      JSON.stringify(initial.verification.runtime) === JSON.stringify(runtime()) && (!selected.unit || worktreeContext(ctx, selected.unit.worktreeRoot).branch === selected.unit.branch) &&
      (args.scope !== 'integration' || worktreeContext(ctx, execution.root).branch === 'main')
  } catch {}
  const job = result.job, localState = localExecutionState(result, commandSummary(args.command.file, args.command.args, execution.root))
  const outcome = localState === 'unknown' ? 'unknown' : localState === 'not_started' ? 'not_verified'
    : job.hasObservedFailure || (Number.isSafeInteger(result.code) && result.code !== 0) ? 'failed'
      : isSettledSuccess(result) && unchanged ? 'passed' : 'not_verified'
  const proof = { ...initial.verification, result: outcome, job: jobSummary(result, localState),
    exitCode: result.code ?? null, finishedAt: now(), provenance: localState === 'not_started' ? 'not_started' : 'executed' }
  const artifact = json({ ...proof, executionJob: job || null, stdout: result.stdout || '', stderr: result.stderr || '',
    stdoutBase64: result.stdoutBase64 ?? null, stderrBase64: result.stderrBase64 ?? null })
  assert(Buffer.byteLength(artifact) <= MAX_ARTIFACT, 'verification output exceeds 64 MiB; running receipt retained for recovery')
  fs.writeFileSync(path.join(artifactDir, `${evidenceId}.json`), artifact, { flag: 'wx', mode: 0o600 })
  proof.artifactPath = `evidence/${evidenceId}.json`; proof.artifactBytes = Buffer.byteLength(artifact); proof.artifactSha256 = digest(artifact)
  const final = finish(ctx, n, initial.ownerEpoch, value => {
    assert(value.verification?.id === evidenceId, 'verification reservation changed')
    value.evidence.push(proof)
    if (proof.result === 'unknown') value.verification.status = 'unknown'
    else delete value.verification
  })
  return { value: final, proof }
}
function control(ctx, n, args, deps) {
  own(ctx, n, true)
  if (args.op === 'note') return appendNote(ctx, n, args.text)
  if (ctx.bind !== 'own') assert(['update', 'running-done', 'budget-extend'].includes(args.op), 'integrated main only permits cleanup, learning and completion bookkeeping')
  const current = ['intent-reconcile', 'delivery-start', 'delivery-revise'].includes(args.op) || (args.op === 'update' && args.patch?.stage) ? live(ctx, n, deps).intent : null
  const head = ['task-start', 'task-complete', 'delivery-complete', 'delivery-start', 'rebaseline'].includes(args.op) ? subject(ctx) : null
  if (args.op === 'rebaseline') oid(ctx, args.reviewBaseOid)
  if (args.op === 'delivery-start' && args.reviewBaseOid) oid(ctx, args.reviewBaseOid)
  return commit(ctx, n, args.expected, value => {
    if (args.op === 'verification-abandon') {
      assert(value.verification && args.quiescent === true && typeof args.reason === 'string' && args.reason.trim(), 'confirm the command and its children terminated and provide a reason')
      value.notes.push({ at: now(), text: args.reason, abandonedVerification: value.verification.id })
      delete value.verification
      return
    }
    if (!['running-done', 'claim'].includes(args.op)) noPending(value)
    switch (args.op) {
      case 'claim':
        assert(args.quiescent === true && typeof args.reason === 'string' && args.reason.trim(), 'claim requires a quiescent handoff and reason')
        value.ownerEpoch++; value.owner = { session: ctx.session }; value.mode = 'interactive'
        value.recoveryOnly = !!value.verification || value.effects.some(e => ['pending', 'unknown'].includes(e.status)) || filled(value.running)
        value.notes.push({ at: now(), text: args.reason, ownerEpoch: value.ownerEpoch }); break
      case 'update': {
        assert(plain(args.patch), 'update needs patch')
        const allowed = new Set(['stage', 'path', 'runMode', 'mode', 'blocked', 'decisions'])
        if (ctx.bind !== 'own') assert(Object.keys(args.patch).every(k => ['stage', 'blocked', 'decisions'].includes(k)) && (!args.patch.stage || ['cleanup', 'learn', 'done'].includes(args.patch.stage)), 'main continuation may only record cleanup/learn/done and blockers')
        assert(Object.keys(args.patch).every(k => allowed.has(k)), 'control update cannot replace identities, task, delivery, evidence, effects or counters')
        const wrong = deps.ledgerValueError(args.patch)
        assert(!wrong, wrong)
        if ('mode' in args.patch) {
          assert(['interactive', 'autonomous'].includes(args.patch.mode), 'invalid mode')
          assert(typeof args.reason === 'string' && args.reason.trim(), 'mode change needs a reason')
          value.modeChanged = { at: now(), to: args.patch.mode, session: ctx.session, reason: args.reason }
        }
        if ('stage' in args.patch && args.patch.stage !== value.stage) {
          assert(transitions[value.stage].includes(args.patch.stage), `illegal stage transition: ${value.stage} -> ${args.patch.stage}`)
          assert(typeof args.reason === 'string' && args.reason.trim(), 'stage transition needs a reason')
          assert(current.revision === value.intent.revision, 'reconcile changed intent before changing execution stage')
          if (['review', 'ship', 'cleanup', 'done'].includes(args.patch.stage)) {
            assert(value.delivery.status === 'complete' && (!value.task || value.task.status === 'complete'), 'delivery acceptance must precede review, ship or cleanup')
            assert(!filled(value.running) && !filled(value.blocked) && !filled(value.decisions), 'unfinished work blocks this transition')
          }
          if (['review', 'ship'].includes(args.patch.stage)) {
            const head = subject(ctx)
            assert(value.delivery.completedHeadOid === head, 'delivery acceptance is stale at this HEAD')
            covered(value, value.delivery.evidenceIds, value.delivery.criteria, head, 'delivery', ctx)
          }
          assert(!(args.patch.stage === 'plan' && (args.patch.path || value.path) !== 'architectural'), 'plan stage requires the architectural path')
          value.notes.push({ at: now(), from: value.stage, to: args.patch.stage, reason: args.reason })
        }
        Object.assign(value, args.patch); break
      }
      case 'running-add': {
        assert(identifier(args.id) && typeof args.label === 'string' && args.label.trim(), 'running work needs an id and label')
        assert(!value.running.some(x => x.id === args.id), 'running work ID is already active')
        if (args.worktreeRoot !== undefined) {
          assert(value.task?.status === 'open' && value.task.kind === 'integration-batch', 'bound work units require an open integration-batch task')
          value.workUnits ||= []
          assert(!value.workUnits.some(x => x.id === args.id), 'work-unit IDs cannot be reused')
          const siblings = value.workUnits.filter(x => x.taskId === value.task.id)
          assert(siblings.length < 3, 'an integration batch supports at most three work units')
          const execution = worktreeContext(ctx, args.worktreeRoot)
          assert(execution.root !== fs.realpathSync(ctx.root) && execution.root !== fs.realpathSync(ctx.store) && execution.branch && execution.branch !== 'main', 'work units need an isolated non-main worktree')
          assert(!siblings.some(x => x.worktreeRoot === execution.root), 'work-unit worktrees must be distinct')
          const head = subject(execution)
          assert(args.baseOid === head, 'work-unit baseOid must equal its observed initial HEAD')
          const captured = capture(execution, head, head)
          assert(!captured.dirty, 'start a work unit from a clean committed candidate')
          const paths = assignedPaths(args.assignedPaths), checks = localChecks(args.checks)
          assert(!siblings.some(x => x.assignedPaths.some(a => paths.some(b => overlaps(a, b)))), 'parallel work-unit assigned paths overlap')
          const baseline = json(captured.manifest)
          assert(Buffer.byteLength(baseline) <= MAX_ARTIFACT, 'work-unit baseline exceeds 64 MiB')
          const artifactPath = `evidence/${id()}.unit-base.json`
          folders(ctx.store, path.join(dir(ctx.store, n), 'evidence'), true)
          const unit = { id: args.id, label: args.label, taskId: value.task.id, status: 'running', worktreeRoot: execution.root, branch: execution.branch,
            baseOid: head, assignedPaths: paths, checks, baseArtifact: { path: artifactPath, sha256: digest(baseline), bytes: Buffer.byteLength(baseline) }, startedAt: now() }
          spend(value, 'work-unit')
          fs.writeFileSync(path.join(dir(ctx.store, n), artifactPath), baseline, { flag: 'wx', mode: 0o600 })
          value.workUnits.push(unit)
        } else {
          assert(value.task?.kind !== 'integration-batch' || args.kind === 'inspection', 'integration-batch writers need worktreeRoot, baseOid, assignedPaths and checks; read-only delegates use kind inspection')
          spend(value, 'running-work')
        }
        value.running.push({ id: args.id, label: args.label, kind: args.worktreeRoot ? 'work-unit' : args.kind === 'inspection' ? 'inspection' : 'bookkeeping', startedAt: now(), taskId: value.task?.id || null }); break
      }
      case 'running-done': {
        assert(args.exitConfirmed === true && value.running.some(x => x.id === args.id) && typeof args.result === 'string' && args.result.trim(), 'running-done requires the active id, confirmed child exit and result')
        const unit = (value.workUnits || []).find(x => x.id === args.id)
        if (unit) {
          assert(!value.verification || value.verification.unitId !== unit.id, 'finish or explicitly recover the work-unit verification before marking exit')
          const outcome = args.outcome || 'passed'
          assert(['passed', 'failed', 'abandoned'].includes(outcome), 'work-unit outcome must be passed, failed or abandoned')
          if (outcome === 'passed') {
            assert(Array.isArray(args.evidenceIds) && args.evidenceIds.every(key => value.evidence.find(p => p.id === key)?.unitId === unit.id), 'result evidence must belong to this work unit')
            const proof = covered(value, args.evidenceIds, unit.checks, null, 'work-unit', ctx)
            unit.completedHeadOid = proof.headOid; unit.evidenceIds = args.evidenceIds
            unit.changedPaths = unitChanges(ctx, n, unit, proof.candidate); unit.status = 'complete'
          } else unit.status = outcome
          unit.result = args.result; unit.finishedAt = now()
        }
        value.running = value.running.filter(x => x.id !== args.id)
        value.notes.push({ at: now(), finishedRun: args.id, text: args.result }); break
      }
      case 'budget-extend':
        assert(positive(args.limit) && args.limit > value.budget.limit && typeof args.reason === 'string' && args.reason.trim(), 'budget extension needs an explicit higher limit and decision reason')
        value.notes.push({ at: now(), oldLimit: value.budget.limit, newLimit: args.limit, reason: args.reason })
        value.budget.limit = args.limit; break
      case 'intent-reconcile':
      case 'delivery-revise': {
        assert(args.observedIntentRevision === current.revision, 'observed intent is stale')
        definitions(value.intent, current)
        const selected = refs(args.criteria || value.delivery.criteria, current)
        if (args.op === 'intent-reconcile' && current.evidenceRevision === value.intent.evidenceRevision && sameRefs(selected, value.delivery.criteria)) {
          value.notes.push({ at: now(), kind: 'intent-reconcile', fromRevision: value.intent.revision, toRevision: current.revision,
            evidenceRevision: current.evidenceRevision, evidencePreserved: true })
          value.intent = storedIntent(current); value.delivery.intentRevision = current.revision
          break
        }
        assert(!value.task || value.task.status === 'complete', 'finish or explicitly revise the open task before changing delivery intent')
        value.intent = storedIntent(current)
        value.delivery = { ...value.delivery, version: value.delivery.version + 1, status: 'open',
          intentRevision: current.revision, criteria: selected }; break
      }
      case 'delivery-start':
        assert(value.delivery.status === 'complete' && (!value.task || value.task.status === 'complete'), 'finish the current delivery before starting another')
        assert(args.observedIntentRevision === current.revision && current.revision === value.intent.revision, 'intent must be reconciled first')
        assert(args.id !== value.delivery.id && !value.deliveries.some(d => d.id === args.id), 'delivery IDs cannot be reused')
        value.deliveries.push(value.delivery)
        value.delivery = delivery(value, args, head, current); value.task = null; break
      case 'task-abandon':
        assert(!filled(value.running), 'running work must stop before abandoning its task')
        assert(value.task?.status === 'open' && typeof args.reason === 'string' && args.reason.trim(), 'task abandonment needs an open task and explicit reason')
        value.tasks.find(t => t.id === value.task.id).status = 'abandoned'
        value.notes.push({ at: now(), abandonedTask: value.task.id, reason: args.reason })
        value.task = null; break
      case 'task-start':
        assert(value.delivery.status === 'open' && (!value.task || value.task.status === 'complete') && !filled(value.running), 'finish the previous task and running work, and keep a delivery open')
        assert(identifier(args.id) && !value.tasks.some(t => t.id === args.id), 'task ID must be stable and unique')
        assert(positive(args.current) && positive(args.total) && args.current <= args.total, 'task current and total must be positive and ordered')
        assert(['serial', 'integration-batch'].includes(args.kind || 'serial'), 'task kind must be serial or integration-batch')
        value.task = { id: args.id, current: args.current, total: args.total, baseOid: head, status: 'open', deliveryId: value.delivery.id, ...taskDefinition(args, value.intent, value.delivery.criteria) }
        value.tasks.push({ ...value.task }); value.delivery.taskIds.push(args.id); break
      case 'task-complete':
        assert(value.task && value.task.status === 'open', 'no open task')
        assert(!filled(value.running), 'running work prevents task completion')
        if (value.task.kind === 'integration-batch') {
          const units = (value.workUnits || []).filter(x => x.taskId === value.task.id)
          assert(units.length >= 2 && units.every(x => x.status === 'complete'), 'a batch needs two or three stopped, verified work units')
          for (const unit of units) {
            covered(value, unit.evidenceIds, unit.checks, null, 'work-unit', ctx)
            capture(ctx, unit.completedHeadOid, head)
          }
        }
        covered(value, args.evidenceIds, value.task.criteria, head, 'task', ctx)
        value.task.status = 'complete'; value.tasks.find(t => t.id === value.task.id).status = 'complete'; break
      case 'delivery-complete':
        assert(!value.task || value.task.status === 'complete', 'an open task prevents delivery completion')
        assert(!filled(value.blocked) && !filled(value.decisions) && !filled(value.running), 'blocked, decisions or running work prevent completion')
        // All affected regressions are explicitly included in the executed selection. No unchecked assertion of a pass.
        covered(value, args.evidenceIds, value.delivery.criteria, head, 'delivery', ctx,
          args.regressionCriteria === undefined ? [] : refs(args.regressionCriteria, value.intent))
        assert(typeof args.impactAnalysis === 'string' && args.impactAnalysis.trim(), 'delivery completion needs an impact analysis')
        value.delivery.status = 'complete'; value.delivery.completedHeadOid = head
        value.delivery.impactAnalysis = args.impactAnalysis; value.delivery.evidenceIds = args.evidenceIds; break
      case 'rebaseline':
        assert(typeof args.reason === 'string' && args.reason.trim(), 'rebaseline needs an explicit reason')
        value.delivery.reviewBaseOid = args.reviewBaseOid; value.delivery.baselineEpoch++; value.delivery.version++; value.delivery.status = 'open'
        value.notes.push({ at: now(), text: args.reason, baselineEpoch: value.delivery.baselineEpoch }); break
      default: fail('unknown control operation')
    }
  }, { claiming: args.op === 'claim' })
}
// Notes are an append-only semantic operation: no execution token or evidence is replaced and controlSeq is unchanged.
function appendNote(ctx, n, text) {
  own(ctx, n, true)
  assert(typeof text === 'string' && text.trim() && text.length <= 8000, 'note needs bounded nonempty text')
  return lock(ctx.store, n, held => {
    const value = read(ctx.store, n, ctx)
    value.notes.push({ at: now(), text: text.trim(), session: ctx.session })
    held(); atomic(path.join(dir(ctx.store, n), 'ledger.json'), value)
    return value
  })
}
function checkedBody(body, current, selected, checked) {
  const chosen = new Set(selected.map(c => c.id))
  for (const c of current.criteria) if (chosen.has(c.id)) body = body.slice(0, c.at) + (checked ? 'x' : ' ') + body.slice(c.at + 1)
  return body
}
function effectArtifact(ctx, n, operationId, suffix, value) {
  const content = json(value)
  assert(Buffer.byteLength(content) <= MAX_ARTIFACT, 'external effect artifact exceeds 64 MiB; reservation retained')
  const relative = `evidence/${operationId}.${suffix}.json`
  folders(ctx.store, path.join(dir(ctx.store, n), 'evidence'), true)
  fs.writeFileSync(path.join(dir(ctx.store, n), relative), content, { flag: 'wx', mode: 0o600 })
  return { path: relative, sha256: digest(content), bytes: Buffer.byteLength(content) }
}
function artifactValue(ctx, n, reference) {
  const content = bytes(path.join(dir(ctx.store, n), reference.path), MAX_ARTIFACT)
  assert(digest(content) === reference.sha256 && content.length === reference.bytes, 'external effect artifact changed')
  return JSON.parse(content.toString('utf8'))
}
function effectObjects(ctx, effect) {
  const endpoint = effect.op === 'create'
    ? `repos/${ctx.repo}/issues?state=all&creator=${encodeURIComponent(effect.actor)}&per_page=100`
    : `repos/${ctx.repo}/issues/${effect.target.issue}/comments?per_page=100`
  const got = ctx.env.run('gh', ['api', '--hostname', 'github.com', '--paginate', '--slurp', endpoint], { cwd: ctx.root })
  assert(got.code === 0, `external effect identity lookup failed (gh exit ${got.code})`)
  const pages = JSON.parse(got.stdout)
  assert(Array.isArray(pages) && pages.every(Array.isArray), 'external effect identity lookup returned incomplete pages')
  const objects = pages.flat().filter(x => effect.op !== 'create' || !x.pull_request)
  assert(objects.length <= 10000, 'external effect identity lookup exceeds 10000 objects; no partial baseline is accepted')
  const prefix = `https://github.com/${ctx.repo.toLowerCase()}/issues/`
  const seen = new Set()
  return objects.map(item => {
    assert(plain(item) && typeof item.html_url === 'string' && item.html_url.toLowerCase().startsWith(prefix) &&
      typeof item.user?.login === 'string' && item.user.login && (typeof item.body === 'string' || item.body === null) &&
      Number.isFinite(Date.parse(item.created_at)) && !seen.has(item.html_url), 'external effect identity lookup returned malformed or duplicate objects')
    const tail = item.html_url.slice(prefix.length)
    assert(effect.op === 'create' ? /^[1-9][0-9]*$/.test(tail) : new RegExp(`^${effect.target.issue}#issuecomment-[A-Za-z0-9_-]+$`).test(tail), 'external effect identity lookup returned another target')
    seen.add(item.html_url)
    return { id: item.html_url, actor: item.user.login, body: item.body || '', title: item.title, createdAt: item.created_at }
  })
}
function beforeEffect(ctx, n, effect) {
  const got = ctx.env.run('gh', ['api', '--hostname', 'github.com', 'user', '--jq', '.login'], { cwd: ctx.root })
  const actor = (got.stdout || '').trim()
  assert(got.code === 0 && /^[A-Za-z0-9][A-Za-z0-9_.\[\]-]{0,99}$/.test(actor), 'authenticated effect author could not be established; nothing sent')
  effect.actor = actor
  const objects = effectObjects(ctx, effect)
  effect.before = effectArtifact(ctx, n, effect.id, 'effect-before', { actor, ids: objects.map(x => x.id), at: now() })
}
function dispatchOutcome(code, localState) {
  return localState === 'not_started' || (localState === 'settled' && code === 4) ? 'not_sent'
    : localState === 'settled' && code === 0 ? 'acknowledged' : 'unknown'
}
function objectResultUrl(effect, returned) {
  if (typeof returned !== 'string' || !['comment', 'remark', 'create'].includes(effect.op)) return undefined
  const url = returned.trim(), prefix = `https://github.com/${effect.target.repo.toLowerCase()}/issues/`
  if (!url.toLowerCase().startsWith(prefix)) return undefined
  const tail = url.slice(prefix.length)
  return (effect.op === 'create' ? /^[1-9][0-9]*$/.test(tail) : new RegExp(`^${effect.target.issue}#issuecomment-[1-9][0-9]*$`).test(tail)) ? url : undefined
}
function describeTransport(effect, raw) {
  const localState = localExecutionState(raw, effect.request), outcome = dispatchOutcome(raw.code, localState)
  const resultUrl = localState === 'settled' && raw.job.outputComplete ? objectResultUrl(effect, raw.stdout) : undefined
  return { code: raw.code, localState, dispatchOutcome: outcome, job: jobSummary(raw, localState), ...(resultUrl ? { resultUrl } : {}) }
}
function transport(ctx, n, effect, sent) {
  const raw = { operationId: effect.id, op: effect.op, target: effect.target, request: effect.request,
    code: sent.code ?? 'unknown', stdout: sent.stdout || '', stderr: sent.stderr || '',
    stdoutBase64: sent.stdoutBase64 ?? null, stderrBase64: sent.stderrBase64 ?? null, job: sent.job || null, observedAt: now() }
  return { ...describeTransport(effect, raw), artifact: effectArtifact(ctx, n, effect.id, 'effect-transport', raw) }
}
function verifiedTransport(ctx, n, effect) {
  assert(effect.transport, 'local transport exit remains unknown; the reservation has no outcome artifact')
  const raw = artifactValue(ctx, n, effect.transport.artifact)
  assert(raw.operationId === effect.id && raw.op === effect.op && JSON.stringify(raw.target) === JSON.stringify(effect.target) &&
    JSON.stringify(raw.request) === JSON.stringify(effect.request) && timestamp(raw.observedAt), 'invalid external transport operation binding')
  const { artifact, ...recorded } = effect.transport
  const observed = describeTransport(effect, raw)
  assert(JSON.stringify(observed) === JSON.stringify(recorded), 'invalid external transport outcome; raw execution evidence does not match')
  return observed
}
function settleEffect(value, effect, observed) {
  effect.observedAt = now()
  effect.exitCode = effect.transport.code
  if (effect.transport.dispatchOutcome === 'not_sent') {
    effect.status = 'failed'
    effect.negative = { kind: 'transport-not-sent', code: effect.transport.code, artifactSha256: effect.transport.artifact.sha256 }
  } else if (effect.transport.localState === 'settled' && observed) applyEffect(value, effect, observed)
  else effect.status = 'unknown'
}
function external(ctx, n, op, args, title, deps) {
  own(ctx, n, true)
  if (ctx.bind !== 'own') assert(['check', 'close'].includes(op) && (op === 'close' || args.scope === 'integration'), 'integrated main only permits checks/closure with actual integration evidence')
  const current = live(ctx, n, deps)
  let head = subject(ctx)
  let target = current.issue.body || ''
  const snapshot = read(ctx.store, n, ctx)
  checkExpected(snapshot, args.expected, ctx)
  assert(snapshot.mode === 'interactive', 'autonomous runs keep proposed Issue text in ledger notes')
  noPending(snapshot)
  assert(args.observedIntentRevision === current.intent.revision && current.intent.revision === snapshot.intent.revision,
    'observed intent changed; reconcile the current approved intent first')
  let nextIntent = null
  if (op === 'check') {
    const selected = refs(args.criteria, current.intent)
    assert(['delivery', 'issue', 'integration'].includes(args.scope || 'delivery'), 'Issue checks require delivery, whole-Issue or integration evidence')
    if ((args.scope || 'delivery') === 'delivery') within(selected, snapshot.delivery.criteria, 'delivery acceptance')
    const proof = covered(snapshot, args.evidenceIds, selected, head, args.scope || 'delivery', ctx)
    head = proof.headOid
    target = checkedBody(target, current.intent, selected, true)
  } else if (op === 'intent') {
    assert(typeof args.body === 'string', 'intent requires a body')
    assert(!snapshot.task || snapshot.task.status === 'complete', 'finish or explicitly abandon the open task before replacing intent')
    const no = deps.refusal('intent', args.body, title)
    assert(!no, no?.out)
    nextIntent = intent(args.body, deps)
    definitions(snapshot.intent, nextIntent)
    // Input checks are never authority. A changed intent invalidates aggregate proof; checking requires a new run.
    target = deps.replaceIntent(current.issue.body || '', checkedBody(args.body, nextIntent, nextIntent.criteria, false))
    nextIntent = intent(target, deps)
  } else if (op === 'close') {
    assert(snapshot.delivery.status === 'complete' && (ctx.bind !== 'own' || snapshot.delivery.completedHeadOid === head), 'current source delivery is not complete at this HEAD')
    assert(current.intent.criteria.every(c => c.checked), 'whole-Issue closure requires every current criterion checked')
    head = covered(snapshot, args.evidenceIds, current.intent.criteria, head, 'integration', ctx).headOid
  } else fail('unsupported v2 Issue operation')
  const operationId = id()
  const sendArgs = op === 'close' ? ['issue', 'close', String(n), '-R', `github.com/${ctx.repo}`]
    : ['issue', 'edit', String(n), '-R', `github.com/${ctx.repo}`, '--body-file', '-', ...(title === undefined ? [] : ['--title', title])]
  const sendInput = op === 'close' ? undefined : target
  const effect = { id: operationId, op, target: { repo: ctx.repo, issue: n }, status: 'pending', at: now(),
    request: { ...commandSummary('gh', sendArgs, ctx.root), inputSha256: sendInput === undefined ? null : digest(sendInput) },
    headOid: head, observedIntentRevision: current.intent.revision, expectedBodyHash: digest(target), expectedTitle: title ?? current.issue.title,
    // A local operation ID is a reconciliation key, not server idempotency.
    intentAfter: nextIntent ? storedIntent(nextIntent) : null }
  const reserved = commit(ctx, n, args.expected, value => {
    noPending(value)
    value.effects.push(effect)
  })
  let sent
  try {
    sent = ctx.env.run('gh', sendArgs, { cwd: ctx.root, env: ctx.env.vars || process.env, input: sendInput, timeout: 10000, settleJob: true })
  } catch (e) { sent = { code: 'exception', stderr: e.message } }
  effect.transport = transport(ctx, n, effect, sent)
  let seen = null
  if (effect.transport.localState === 'settled' && effect.transport.dispatchOutcome !== 'not_sent') { try { seen = effectObserved(ctx, effect, deps) } catch {} }
  const final = finish(ctx, n, reserved.ownerEpoch, value => {
    const record = value.effects.find(e => e.id === operationId)
    record.transport = effect.transport
    settleEffect(value, record, seen)
  })
  return { value: final, confirmed: final.effects.find(e => e.id === operationId).status === 'succeeded', operationId }
}
function effectObserved(ctx, effect, deps) {
  if (['comment', 'remark', 'create'].includes(effect.op)) {
    // A new same-author/same-body object may belong to another concurrent request.
    // Only this transport's returned object URL is an operation-bound correlator.
    if (!effect.transport?.resultUrl) return null
    const before = artifactValue(ctx, effect.ownerIssue, effect.before)
    assert(before.actor === effect.actor && Array.isArray(before.ids), 'external effect baseline is malformed')
    const old = new Set(before.ids)
    const same = text => String(text || '').replace(/\r\n/g, '\n').trim() === effect.publicText.replace(/\r\n/g, '\n').trim()
    const candidates = effectObjects(ctx, effect).filter(x => x.id === effect.transport.resultUrl && !old.has(x.id) && x.actor === effect.actor && same(x.body) &&
      (effect.op !== 'create' || x.title === effect.expectedTitle))
    return candidates.length === 1 ? { kind: 'new-object', id: candidates[0].id, actor: candidates[0].actor, createdAt: candidates[0].createdAt, at: now(),
      correlation: { kind: 'transport-result-url', artifactSha256: effect.transport.artifact.sha256 } } : null
  }
  if (effect.op === 'sub-issue-add') {
    const got = deps.relationLookup(ctx, ...effect.pair)
    return !got.error && got.previous?.number === effect.pair[0] && deps.sameRepo(got.previous.repository.nameWithOwner, ctx.repo)
      ? { kind: 'relationship', pair: effect.pair, at: now() } : null
  }
  const got = deps.fetchIssue(ctx, effect.target.issue)
  if (got.error) return null
  const seen = effect.op === 'close' ? got.issue.state === 'CLOSED' : effect.op === 'reopen' ? got.issue.state === 'OPEN'
    : digest(got.issue.body || '') === effect.expectedBodyHash && got.issue.title === effect.expectedTitle
  return seen ? { kind: 'target-state', issue: effect.target.issue, at: now() } : null
}
function applyEffect(value, effect, observed) {
  effect.status = 'succeeded'; effect.observedAt = now(); effect.observation = observed
  if (effect.intentAfter) {
    value.intent = effect.intentAfter; value.delivery.version++
    value.delivery.intentRevision = value.intent.revision; value.delivery.status = 'open'
  }
  if (effect.op === 'close') value.issueClosed = { at: now(), intentRevision: effect.observedIntentRevision, headOid: effect.headOid }
  if (effect.op === 'reopen') { delete value.issueClosed; value.delivery.status = 'open'; value.delivery.version++ }
}
function reconcile(ctx, n, args, deps) {
  own(ctx, n)
  const before = read(ctx.store, n, ctx)
  checkExpected(before, args.expected, ctx)
  const effect = before.effects.find(e => e.id === args.id)
  assert(effect && ['pending', 'unknown'].includes(effect.status), 'no unresolved external operation with this ID')
  const transport = verifiedTransport(ctx, n, effect)
  assert(transport.localState !== 'unknown', 'local transport exit remains unknown; read-only remote state cannot prove the command and descendants stopped, and no retry has been sent')
  let observed = null
  if (transport.dispatchOutcome !== 'not_sent') {
    observed = effectObserved(ctx, effect, deps)
    assert(observed, 'external outcome remains unknown; no retry has been sent')
  }
  return commit(ctx, n, args.expected, value => {
    const record = value.effects.find(e => e.id === args.id)
    settleEffect(value, record, observed)
  })
}
// Existing public operations keep their original authorization and shape guards at the caller.
// The local reservation serializes cooperating writers; GitHub does not provide body compare-and-swap here.
function compat(ctx, n, op, targetNumber, text, title, deps) {
  try {
    own(ctx, n)
    assert(['state', 'comment', 'remark', 'reopen', 'create', 'sub-issue-add'].includes(op), 'v2 AC mutations require structured stable-ID requests')
    const value = read(ctx.store, n, ctx)
    checkExpected(value, expectedOf(value), ctx)
    noPending(value)
    assert(value.mode === 'interactive', 'autonomous runs keep proposed Issue text in ledger notes')
    const effect = { id: id(), op, ownerIssue: n, target: { repo: ctx.repo, issue: targetNumber ?? null }, status: 'pending', at: now() }
    let sendArgs, sendInput
    if (['comment', 'remark', 'create'].includes(op)) {
      effect.publicText = text; effect.expectedTitle = title
      beforeEffect(ctx, n, effect)
      sendArgs = op === 'create'
        ? ['issue', 'create', '-R', `github.com/${ctx.repo}`, '--title', title, '--body-file', '-']
        : ['issue', 'comment', String(targetNumber), '-R', `github.com/${ctx.repo}`, '--body-file', '-']
      sendInput = op === 'create' ? text : text.trim() + '\n'
    } else if (op === 'sub-issue-add') {
      effect.pair = deps.relationOf(text)
      assert(effect.pair, 'invalid sub-issue pair')
      const got = deps.relationLookup(ctx, ...effect.pair)
      assert(!got.error, got.error)
      assert(!got.previous || (got.previous.number === effect.pair[0] && deps.sameRepo(got.previous.repository.nameWithOwner, ctx.repo)), 'child already has another parent')
      if (got.previous) return { code: 0, out: `${ctx.repo}: relationship already confirmed; no request sent` }
      sendArgs = ['api', '--hostname', 'github.com', '--method', 'POST', `repos/${ctx.repo}/issues/${effect.pair[0]}/sub_issues`,
        '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2026-03-10', '--input', '-']
      sendInput = JSON.stringify({ sub_issue_id: got.childId, replace_parent: false })
    } else {
      const got = deps.fetchIssue(ctx, targetNumber)
      assert(!got.error, got.error)
      if (op === 'state') {
        const next = deps.nextBody(op, got.issue.body || '', text)
        assert(intent(next, deps).revision === value.intent.revision, 'state projection cannot change or bypass the current approved intent')
        const stage = /^- 단계: ([a-z]+)[ \t]*$/m.exec(text)?.[1]
        assert(stage === value.stage, 'state projection must match the authoritative execution stage')
        effect.expectedBodyHash = digest(next); effect.expectedTitle = got.issue.title
        sendArgs = ['issue', 'edit', String(targetNumber), '-R', `github.com/${ctx.repo}`, '--body-file', '-']; sendInput = next
      } else {
        sendArgs = ['issue', 'reopen', String(targetNumber), '-R', `github.com/${ctx.repo}`]
      }
    }
    effect.request = { ...commandSummary('gh', sendArgs, ctx.root), inputSha256: sendInput === undefined ? null : digest(sendInput) }
    const reserved = commit(ctx, n, expectedOf(value), latest => { noPending(latest); latest.effects.push(effect) })
    let result
    try { result = ctx.env.run('gh', sendArgs, { cwd: ctx.root, env: ctx.env.vars || process.env, input: sendInput, timeout: 10000, settleJob: true }) } catch (e) { result = { code: 'exception', stderr: e.message } }
    effect.transport = transport(ctx, n, effect, result)
    let seen = null
    if (effect.transport.localState === 'settled' && effect.transport.dispatchOutcome !== 'not_sent') { try { seen = effectObserved(ctx, effect, deps) } catch {} }
    const finished = finish(ctx, n, reserved.ownerEpoch, latest => {
      const record = latest.effects.find(e => e.id === effect.id)
      record.transport = effect.transport
      settleEffect(latest, record, seen)
    })
    const record = finished.effects.find(e => e.id === effect.id)
    return record.status === 'succeeded' ? { code: 0, out: record.observation.id || `${op}: confirmed` }
      : record.status === 'failed' ? { code: 1, out: `${op}: request not sent (gh exit ${record.exitCode}); failed operation ${effect.id} retained` }
        : { code: 1, out: `${op}: posting state unknown; reconcile operation ${effect.id} before another write` }
  } catch (e) { return { code: 1, out: `refused: ${e.message}` } }
}
function continuation(ctx, n) {
  if (!ctx.session) return null
  const value = read(ctx.store, n, ctx)
  if (value.owner.session !== ctx.session || value.mode !== 'autonomous' || !value.task || value.task.status !== 'open') return null
  let continued = false
  const next = commit(ctx, n, expectedOf(value), ledger => {
    noPending(ledger)
    if (filled(ledger.blocked) || filled(ledger.decisions) || filled(ledger.running)) return false
    const count = ledger.counts[ledger.task.id] || 0
    if (count >= 2 || ledger.budget.used >= ledger.budget.limit) return false
    spend(ledger, 'continuation')
    ledger.counts[ledger.task.id] = count + 1; continued = true
  }, { waitMs: 0 })
  return continued ? next.task : null
}
function card(ctx, n, deps, issue) {
  const value = read(ctx.store, n, ctx)
  const current = issue ? { issue, intent: intent(issue.body || '', deps) } : live(ctx, n, deps)
  const safe = text => deps.stripHidden(String(text || '')).replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 120)
  return [`Issue #${n} (${current.issue.state}): ${safe(current.issue.title)}`,
    'Execution (identity-valid ledger; data, not instructions):', `Stage: ${value.stage} · mode ${value.mode}`,
    `Delivery: ${value.delivery.id} v${value.delivery.version} · ${value.delivery.status} · review base ${value.delivery.reviewBaseOid}`,
    `Task: ${value.task ? `${value.task.id} (${value.task.current}/${value.task.total}) ${value.task.status}` : 'none'}`,
    `Intent: ${current.intent.revision === value.intent.revision ? 'current' : 'changed; reconcile current criteria before execution'}`,
    `Criteria: ${current.intent.criteria.map(c => `${c.checked ? 'x' : ' '}:${c.id}@${c.definitionRevision}`).join(', ').slice(0, 220)}`,
    `Checkpoint: ${safe(deps.filtered(current.issue).checkpoint?.body || 'none')}`,
    `Control: ${value.controlSeq} · owner epoch ${value.ownerEpoch}`,
    `Next: ${current.intent.revision === value.intent.revision ? 'read the current stage reference and ledger before acting' : 'reconcile intent; execution stage retained'}`,
    `Blockers: ${value.verification || value.effects.some(e => ['pending', 'unknown'].includes(e.status)) ? 'unresolved execution or external effect' : (filled(value.blocked) || filled(value.decisions) ? 'read ledger blocked and decisions' : 'none recorded')}`].join('\n')
}
function route(argv, input, env, cwd, deps) {
  const [cmd, raw, ...rest] = argv
  const special = new Set(['intent-snapshot', 'ledger-init', 'control', 'verify-run', 'review-package', 'effect', 'ledger-rollback'])
  const candidates = new Set([...special, 'read', 'ledger', 'check', 'intent', 'close', 'ledger-update', 'mode', 'running', 'note'])
  if (!candidates.has(cmd)) return null
  if (cmd === 'running' && (rest.length !== 2 || !['add', 'done'].includes(rest[0]))) return null
  const optionalTarget = ['read', 'ledger', 'ledger-update'].includes(cmd)
  const n = /^[1-9][0-9]*$/.test(raw || '') && positive(Number(raw)) ? Number(raw) : null
  if ((!n && raw !== undefined) || (!n && !optionalTarget)) return { code: 2, out: `usage: devflow-state ${cmd} <issue>; Issue must be a positive safe integer` }
  if (['read', 'ledger', 'ledger-update', 'intent-snapshot', 'control', 'verify-run', 'review-package', 'effect', 'note'].includes(cmd) && rest.length) {
    return { code: 2, out: `usage: devflow-state ${cmd} ${optionalTarget ? '[issue]' : '<issue>'}; no extra arguments` }
  }
  const ctx = deps.repoContext(env, cwd)
  const number = n ?? ctx?.issue
  if (!ctx || !positive(number)) return special.has(cmd) ? { code: 1, out: 'refused: no working Issue' } : null
  if (!special.has(cmd) && !managed(ctx.store, number)) return null
  try {
    let result
    if (cmd === 'read' || cmd === 'intent-snapshot') {
      const current = live(ctx, number, deps)
      const value = managed(ctx.store, number) ? read(ctx.store, number, ctx) : null
      result = { issue: number, title: deps.stripHidden(String(current.issue.title || '')).replace(/[\x00-\x1f\x7f]/g, ' '), state: current.issue.state, body: deps.filtered(current.issue).body,
        observedIntentRevision: current.intent.revision, intentEvidenceRevision: current.intent.evidenceRevision, criteria: current.intent.criteria.map(({ at, ...c }) => c),
        execution: value ? { stage: value.stage, expected: expectedOf(value), intentMatches: value.intent.revision === current.intent.revision } : null }
    } else if (cmd === 'ledger') result = read(ctx.store, number, ctx)
    else if (cmd === 'ledger-init') {
      assert(rest.length === 1 && rest[0] === '--quiescent', 'usage: ledger-init <issue> --quiescent < JSON')
      result = activate(ctx, number, { ...JSON.parse(input()), quiescent: true }, deps)
    } else if (cmd === 'ledger-rollback') {
      assert(rest.length === 1 && rest[0] === '--quiescent', 'usage: ledger-rollback <issue> --quiescent < JSON')
      result = rollback(ctx, number, { ...JSON.parse(input()), quiescent: true }, deps)
    } else if (cmd === 'control') { assert(!rest.length, 'control accepts structured stdin only'); result = control(ctx, number, JSON.parse(input()), deps) }
    else if (cmd === 'verify-run') {
      assert(!rest.length, 'verify-run accepts structured stdin only')
      const run = verify(ctx, number, JSON.parse(input()), deps)
      return { code: run.proof.result === 'passed' ? 0 : 1, out: json({ evidence: run.proof, expected: expectedOf(run.value) }).trim() }
    } else if (cmd === 'review-package') {
      result = reviewPackage(ctx, number, JSON.parse(input() || '{}'), deps)
    } else if (cmd === 'effect') {
      assert(!rest.length, 'effect accepts structured stdin only')
      const args = JSON.parse(input()); assert(args.op === 'reconcile', 'effect supports reconcile; it never redispatches an unknown operation')
      result = reconcile(ctx, number, args, deps)
    } else if (['check', 'intent', 'close'].includes(cmd)) {
      assert(!rest.length || (cmd === 'intent' && rest.length === 2 && rest[0] === '--title'), 'v2 criteria use structured stdin, never positional numbers')
      const done = external(ctx, number, cmd, JSON.parse(input()), rest.length ? rest[1] : undefined, deps)
      const status = done.value.effects.find(effect => effect.id === done.operationId).status
      return { code: done.confirmed ? 0 : 1, out: json({ status: done.confirmed ? 'confirmed' : status, operationId: done.operationId, expected: expectedOf(done.value) }).trim() }
    } else if (cmd === 'note') {
      assert(!rest.length, 'usage: note <issue> < text'); result = appendNote(ctx, number, input())
    } else if (cmd === 'ledger-update') {
      const args = JSON.parse(input()); result = control(ctx, number, { ...args, op: 'update' }, deps)
    } else if (cmd === 'mode') {
      assert(rest.length === 1, 'usage: mode <issue> interactive|autonomous < JSON {expected,reason}')
      const args = JSON.parse(input()); result = control(ctx, number, { ...args, op: 'update', patch: { mode: rest[0] } }, deps)
    } else if (cmd === 'running') {
      const args = JSON.parse(input()); result = control(ctx, number, { ...args, op: rest[0] === 'add' ? 'running-add' : 'running-done', id: rest[1], label: args.label || rest[1] }, deps)
    } else return null
    return { code: 0, out: json(result).trim() }
  } catch (e) { return { code: 1, out: `refused: ${e.message}` } }
}
module.exports = { managed, read, activate, route, intent, control, verify, external, reconcile, continuation, card,
  expectedOf, commit, lock, dir, legacy, signature, evidenceApplies, compat, rollback, appendNote, reviewPackage }
