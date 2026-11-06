'use strict'
// Real repositories and child commands; only GitHub transport is substituted. The archived v1 code is executed verbatim.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync, spawn, spawnSync } = require('node:child_process')
const tmpdir = require('./tmpdir')
const state = require('../bin/devflow-state')
const oldState = require('./fixtures/v1/bin/devflow-state')
const oldHook = require('./fixtures/v1/hooks/devflow-hook.js')
const v2 = state.v2, deps = state.v2deps()
const { ok, modelJob, settled, refs, all, body, fixture, ghWrites, at, nodeCommand, local, wholeTask,
  liveJob, complete } = require('./fixtures/devflow-v2')

test('v2 resume keeps a bound build stage despite a start-phase Issue hint; CAS and other bindings refuse', () => {
  const f = fixture()
  f.control('update', { patch: { stage: 'design' }, reason: 'bounded design approved' })
  f.control('update', { patch: { stage: 'build' }, reason: 'design sufficient' })
  const card = state.card(f.env, f.root)
  assert.match(card, /Stage: build/); assert.doesNotMatch(card, /Stage: start/)
  const stale = f.expected(); f.control('update', { patch: { blocked: ['dependency'] } })
  assert.throws(() => f.control('update', { expected: stale, patch: { blocked: [] } }), /stale/)
  assert.throws(() => v2.read(f.root, 1, { ...f.ctx(), repo: 'other/repo' }), /identity mismatch/)
  assert.throws(() => v2.read(f.root, 1, { ...f.ctx(), branch: 'feat/2-other', issue: 2 }), /identity mismatch/)
  assert.throws(() => f.control('update', { patch: { stage: 'ship' }, reason: 'skip' }), /illegal stage/)
  assert.throws(() => f.control('update', { patch: { evidence: [{ result: 'passed' }] } }), /cannot replace/)
})

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

test('CF01 pure AC display reorder preserves original execution proof after raw intent reconciliation', liveJob, () => {
  const f = fixture()
  const old = complete(f), before = f.read()
  const rawArtifact = fs.readFileSync(path.join(v2.dir(f.root, 1), old.artifactPath))
  const rawInput = fs.readFileSync(path.join(v2.dir(f.root, 1), old.inputArtifact.path))
  f.issue.body = body(['b', 'a', 'c', 'd', 'e'])
  assert.notEqual(f.intent().revision, old.subject.intentRevision)
  assert.equal(f.intent().evidenceRevision, old.subject.intentEvidenceRevision)
  assert.throws(() => f.effect('check', { criteria: refs('a'), evidenceIds: [old.id] }), /intent changed/)
  f.control('intent-reconcile', { observedIntentRevision: f.intent().revision })
  assert.deepEqual(f.read().evidence, before.evidence)
  assert.equal(f.read().delivery.version, before.delivery.version)
  assert.equal(f.read().delivery.status, 'complete')
  assert.deepEqual(f.read().budget, before.budget)
  assert.ok(fs.readFileSync(path.join(v2.dir(f.root, 1), old.artifactPath)).equals(rawArtifact))
  assert.ok(fs.readFileSync(path.join(v2.dir(f.root, 1), old.inputArtifact.path)).equals(rawInput))
  assert.throws(() => f.effect('check', { observedIntentRevision: old.subject.intentRevision, criteria: refs('a'), evidenceIds: [old.id] }), /intent changed/)
  assert.equal(f.effect('check', { criteria: refs('a'), evidenceIds: [old.id] }).confirmed, true)
  assert.equal(f.intent().criteria.find(c => c.id === 'a').checked, true)
  assert.equal(f.intent().criteria.find(c => c.id === 'b').checked, false)
  assert.equal(f.intent().criteria.find(c => c.id === 'a').number, 2)
  const oldRevision = f.intent().revision
  assert.throws(() => f.effect('intent', { body: body().split('## 현재 상태')[0].trim().replace('requirement a', 'changed requirement a') }), /definition revision/)
  f.effect('intent', { body: body().split('## 현재 상태')[0].trim().replace('[AC:a@1] requirement a', '[AC:a@2] changed requirement a') })
  assert.equal(f.intent().criteria.find(c => c.id === 'a').checked, false)
  assert.throws(() => f.effect('check', { observedIntentRevision: oldRevision, criteria: refs('a'), evidenceIds: [old.id] }), /intent changed/)
  assert.throws(() => f.effect('check', { criteria: refs('a'), evidenceIds: [old.id] }), /definition changed/)
  const changed = [{ id: 'a', definitionRevision: 2 }, ...refs('b')]
  assert.throws(() => f.effect('check', { criteria: changed.slice(0, 1), evidenceIds: [old.id] }), /outside the selected delivery/)
  f.control('delivery-revise', { observedIntentRevision: f.intent().revision, criteria: changed })
  assert.throws(() => f.effect('check', { criteria: changed.slice(0, 1), evidenceIds: [old.id] }), /stale/)
})

test('CF01 order-only reconciliation preserves an open task and its original local proof', liveJob, () => {
  const f = fixture()
  f.control('task-start', { id: 'open-task', current: 1, total: 1, ...wholeTask('a') })
  const proof = f.verify('task', refs('a')).proof, before = f.read()
  f.issue.body = body(['e', 'd', 'c', 'b', 'a'])
  f.control('intent-reconcile', { observedIntentRevision: f.intent().revision, criteria: refs('b', 'a') })
  assert.deepEqual(f.read().task, before.task)
  assert.deepEqual(f.read().evidence, before.evidence)
  assert.deepEqual(f.read().budget, before.budget)
  assert.deepEqual(f.read().delivery.criteria, before.delivery.criteria)
  f.control('task-complete', { evidenceIds: [proof.id] })
  assert.equal(f.read().task.status, 'complete')
})

test('CF01 semantic context, selected scope and multiline layout changes still invalidate acceptance', liveJob, () => {
  for (const change of ['context', 'scope', 'multiline']) {
    const f = fixture({ activate: false })
    if (change === 'multiline') f.issue.body = body().replace('requirement a\n', 'requirement a\n  Additional dependency for a.\n')
    f.init()
    const proof = f.verify().proof, before = f.read()
    if (change === 'context') f.issue.body = f.issue.body.replace('Scoped delivery', 'Delivery has a different approved constraint')
    if (change === 'multiline') f.issue.body = body(['b', 'a', 'c', 'd', 'e']).replace('requirement a\n', 'requirement a\n  Additional dependency for a.\n')
    const criteria = change === 'scope' ? refs('a', 'b', 'c') : refs('a', 'b')
    f.control('intent-reconcile', { observedIntentRevision: f.intent().revision, criteria })
    assert.equal(f.read().delivery.version, before.delivery.version + 1, change)
    assert.throws(() => f.effect('check', { criteria: refs('a'), evidenceIds: [proof.id] }), /stale/)
    assert.deepEqual(f.read().evidence, before.evidence)
  }
  const duplicate = body().replace('[AC:b@1]', '[AC:a@1]')
  assert.throws(() => v2.intent(duplicate, deps), /duplicate/)
})

test('evidence rejects environment, config, artifact and candidate changes; a package or zero exit with changed inputs is not a pass', liveJob, () => {
  const f = fixture()
  const proof = f.verify().proof
  assert.equal(proof.result, 'passed')
  assert.equal(v2.evidenceApplies(f.read(), proof, f.original, 'delivery', f.ctx()), true)
  f.env.vars.DEVFLOW_TEST_VARIANT = 'changed'
  assert.equal(v2.evidenceApplies(f.read(), proof, f.original, 'delivery', f.ctx()), false)
  delete f.env.vars.DEVFLOW_TEST_VARIANT
  fs.writeFileSync(path.join(f.root, 'config.json'), '{"strict":false}\n')
  assert.equal(v2.evidenceApplies(f.read(), proof, f.original, 'delivery', f.ctx()), false)
  fs.writeFileSync(path.join(f.root, 'config.json'), '{"strict":true}\n')
  fs.appendFileSync(path.join(v2.dir(f.root, 1), 'evidence', proof.id + '.json'), ' ')
  assert.equal(v2.evidenceApplies(f.read(), proof, f.original, 'delivery', f.ctx()), false)
  assert.throws(() => f.effect('check', { criteria: refs('a'), evidenceIds: [proof.id] }), /artifact/)
  assert.throws(() => f.effect('check', { criteria: refs('a'), evidenceIds: ['review-package.diff'] }), /missing/)
  f.env.onCommand = () => { fs.writeFileSync(path.join(f.root, 'candidate.txt'), 'changed while running\n'); return settled('exit zero') }
  assert.equal(f.verify().proof.result, 'not_verified')
  assert.throws(() => f.verify('delivery'), /clean committed/)
  f.env.onCommand = null
})

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

test('unknown external effect is never redispatched; notes and quiescent ownership transfer permit read-only reconciliation', () => {
  const f = fixture()
  const text = '### Checkpoint start — interrupted delivery\n- Waiting for transport readback.'
  const returnedUrl = f.issue.url + '#issuecomment-91'
  // A settled transport returned this exact object identity; visibility alone is delayed.
  f.env.onTransport = () => settled(returnedUrl)
  const first = f.cli(['comment', '1'], text)
  assert.equal(first.code, 1); assert.match(first.out, /state unknown/)
  const receipt = f.read().effects.at(-1)
  assert.equal(receipt.status, 'unknown')
  const n = ghWrites(f).length
  assert.equal(f.cli(['comment', '1'], text).code, 1)
  assert.equal(ghWrites(f).length, n)
  const token = f.expected(); f.cli(['note', '1'], 'Record interruption without discarding effect.')
  assert.deepEqual(f.expected(), token)
  f.env.vars.CODEX_THREAD_ID = 'recovery-owner'
  f.control('claim', { quiescent: true, reason: 'Old host and in-flight command have stopped.' })
  assert.equal(f.read().recoveryOnly, true)
  f.issue.comments.nodes.push({ body: text, authorAssociation: 'OWNER', createdAt: new Date().toISOString(), url: returnedUrl })
  v2.reconcile(f.ctx(), 1, { expected: f.expected(), id: receipt.id }, deps)
  assert.equal(f.read().effects.at(-1).status, 'succeeded')
  assert.equal(f.read().recoveryOnly, undefined)
  assert.equal(ghWrites(f).length, n)
})

test('RUNTIME-02 neither existing nor new same-author objects can identify a URL-less timed-out request', () => {
  for (const op of ['comment', 'create']) {
    const f = fixture(), text = op === 'comment' ? '### Checkpoint start — same content\n- Retain this exact approved text.' : body()
    const title = 'Approved related work'
    const old = op === 'comment'
      ? { body: text, authorAssociation: 'OWNER', author: { login: 'runtime-owner' }, createdAt: new Date(Date.now() - 60000).toISOString(), url: f.issue.url + '#issuecomment-old' }
      : { body: text, title, user: { login: 'runtime-owner' }, created_at: new Date(Date.now() - 60000).toISOString(), html_url: 'https://github.com/o/r/issues/99' }
    const objects = op === 'comment' ? f.issue.comments.nodes : f.created
    objects.push(old)
    if (op === 'create') objects.push({ ...old, body: null, title: 'Prior Issue with no body', html_url: 'https://github.com/o/r/issues/90' })
    const oldIds = objects.map(item => op === 'comment' ? item.url : item.html_url)
    f.env.unknownWrite = true
    const result = op === 'comment' ? f.cli(['comment', '1'], text) : f.cli(['create', '--title', title], text)
    assert.equal(result.code, 1, result.out); assert.match(result.out, /state unknown/)
    let receipt = f.read().effects.at(-1)
    assert.equal(receipt.status, 'unknown'); assert.equal(receipt.exitCode, 'ETIMEDOUT')
    assert.equal(receipt.transport.code, 'ETIMEDOUT')
    const before = JSON.parse(fs.readFileSync(path.join(v2.dir(f.root, 1), receipt.before.path)))
    assert.deepEqual(before.ids, oldIds)
    const writes = ghWrites(f).length
    const reconcile = () => v2.reconcile(f.ctx(), 1, { expected: f.expected(), id: receipt.id }, deps)
    assert.throws(reconcile, /remains unknown/)
    objects.push(op === 'comment' ? { ...old, authorAssociation: 'COLLABORATOR', author: { login: 'other-trusted-writer' }, url: f.issue.url + '#issuecomment-other' }
      : { ...old, user: { login: 'other-trusted-writer' }, html_url: 'https://github.com/o/r/issues/100' })
    assert.throws(reconcile, /remains unknown/)
    assert.throws(() => f.control('update', { patch: { blocked: [] } }), /external effect/)
    objects.push(op === 'comment' ? { ...old, createdAt: new Date().toISOString(), url: f.issue.url + '#issuecomment-this-operation' }
      : { ...old, created_at: new Date().toISOString(), html_url: 'https://github.com/o/r/issues/101' })
    // New identity + author + text was the old unsafe inference: it may be another request.
    assert.throws(reconcile, /remains unknown/)
    receipt = f.read().effects.at(-1)
    assert.equal(receipt.status, 'unknown'); assert.equal(receipt.exitCode, 'ETIMEDOUT')
    assert.equal(receipt.transport.localState, 'unknown')
    assert.equal(receipt.observation, undefined)
    assert.equal(ghWrites(f).length, writes)
  }
})

test('RUNTIME-02 settled transports require their exact returned object URL, including create and concurrent identical content', () => {
  for (const op of ['comment', 'create']) for (const returned of [false, true]) {
    const f = fixture(), text = op === 'comment' ? '### Checkpoint start — exact identity\n- Read back the object returned by this request.' : body()
    const title = 'Approved related work', url = op === 'comment' ? f.issue.url + '#issuecomment-91' : 'https://github.com/o/r/issues/91'
    f.env.onTransport = () => {
      if (op === 'comment') for (const n of [90, 91]) f.issue.comments.nodes.push({ body: text, authorAssociation: 'OWNER', author: { login: 'runtime-owner' },
        createdAt: new Date().toISOString(), url: f.issue.url + '#issuecomment-' + n })
      else for (const n of [90, 91]) f.created.push({ body: text, title, user: { login: 'runtime-owner' }, created_at: new Date().toISOString(), html_url: 'https://github.com/o/r/issues/' + n })
      return settled(returned ? url : '')
    }
    const result = op === 'comment' ? f.cli(['comment', '1'], text) : f.cli(['create', '--title', title], text)
    const receipt = f.read().effects.at(-1)
    assert.equal(receipt.transport.localState, 'settled')
    assert.equal(result.code, returned ? 0 : 1)
    assert.equal(receipt.status, returned ? 'succeeded' : 'unknown')
    if (returned) {
      assert.equal(receipt.observation.id, url)
      assert.equal(receipt.observation.correlation.artifactSha256, receipt.transport.artifact.sha256)
    } else {
      const writes = ghWrites(f).length
      assert.throws(() => v2.reconcile(f.ctx(), 1, { expected: f.expected(), id: receipt.id }, deps), /remains unknown/)
      assert.equal(ghWrites(f).length, writes)
    }
  }
})

test('RUNTIME-02 missing or contradictory local execution metadata cannot clear an effect even with a returned matching URL', () => {
  for (const kind of ['bare-zero', 'bare-auth', 'contradictory', 'wrong-command']) {
    const f = fixture(), text = '### Checkpoint start — strict transport\n- Keep invalid lifecycle outcomes unresolved.'
    f.env.onTransport = (cmd, args, opts) => {
      const url = f.issue.url + '#issuecomment-91'
      f.issue.comments.nodes.push({ body: text, authorAssociation: 'OWNER', createdAt: new Date().toISOString(), url })
      if (kind === 'bare-zero') return ok(url)
      if (kind === 'bare-auth') return { code: 4, stdout: url, stderr: '' }
      const result = settled(url)
      if (kind === 'contradictory') result.job.observedExits = []
      if (kind === 'wrong-command') { delete result[modelJob]; result.job.command = { file: cmd, args: [...args, 'wrong-operation'], cwd: opts.cwd } }
      return result
    }
    assert.equal(f.cli(['comment', '1'], text).code, 1)
    const effect = f.read().effects.at(-1)
    assert.equal(effect.status, 'unknown'); assert.equal(effect.transport.localState, 'unknown')
    assert.equal(effect.transport.dispatchOutcome, 'unknown')
    assert.throws(() => v2.reconcile(f.ctx(), 1, { expected: f.expected(), id: effect.id }, deps), /local transport exit remains unknown/)
    assert.throws(() => f.control('update', { patch: { blocked: [] } }), /external effect/)
  }
})

test('RUNTIME-05 unsupported external execution launches nothing and records a terminal not-sent result', () => {
  const f = fixture(), unsupported = require('../lib/devflow-execution.js').createRunner({ platform: 'win32' })
  f.env.onTransport = (cmd, args, opts) => unsupported(cmd, args, opts)
  const result = f.cli(['comment', '1'], '### Checkpoint start — unsupported transport\n- Do not launch an unobserved remote mutation.')
  assert.equal(result.code, 1); assert.match(result.out, /request not sent/)
  const effect = f.read().effects.at(-1)
  assert.equal(effect.status, 'failed'); assert.equal(effect.transport.localState, 'not_started')
  assert.equal(effect.transport.job.reason, 'unsupported_platform')
  assert.equal(f.issue.comments.nodes.length, 0)
  f.control('update', { patch: { blocked: [] } })
})

test('RUNTIME-05 proven not-sent failures are terminal; uncertain transport still blocks without replay', () => {
  const f = fixture(), text = '### Checkpoint start — transport\n- Record the actual transport outcome.'
  for (const code of [4, 'ENOENT', 'EACCES']) {
    f.env.writeCode = code
    const result = f.cli(['comment', '1'], text)
    assert.equal(result.code, 1); assert.match(result.out, /request not sent/)
    const receipt = f.read().effects.at(-1)
    assert.equal(receipt.status, 'failed'); assert.equal(receipt.exitCode, code)
    assert.equal(receipt.transport.dispatchOutcome, 'not_sent')
    const raw = JSON.parse(fs.readFileSync(path.join(v2.dir(f.root, 1), receipt.transport.artifact.path)))
    assert.equal(raw.code, code); assert.equal(raw.operationId, receipt.id)
    f.control('update', { patch: { blocked: [] } })
  }
  f.env.writeCode = 4
  const structured = f.cli(['intent', '1'], { expected: f.expected(), observedIntentRevision: f.intent().revision,
    body: body().split('## 현재 상태')[0].trim() })
  assert.equal(structured.code, 1); assert.equal(JSON.parse(structured.out).status, 'failed')
  assert.equal(f.read().effects.at(-1).transport.code, 4)
  f.control('update', { patch: { blocked: [] } })
  delete f.env.writeCode
  assert.equal(f.cli(['comment', '1'], text).code, 0)
  f.env.unknownWrite = true
  assert.equal(f.cli(['comment', '1'], text).code, 1)
  const receipt = f.read().effects.at(-1), calls = ghWrites(f).length
  assert.equal(receipt.status, 'unknown')
  assert.throws(() => v2.reconcile(f.ctx(), 1, { expected: f.expected(), id: receipt.id }, deps), /remains unknown/)
  assert.throws(() => f.control('update', { patch: { blocked: [] } }), /external effect/)
  assert.equal(ghWrites(f).length, calls)
})

test('RUNTIME-06 unsupported effect outcomes and malformed execution shapes fail closed on read and mutation', () => {
  const f = fixture()
  f.env.unknownWrite = true
  f.cli(['comment', '1'], '### Checkpoint start — interrupted\n- Keep the unresolved original operation.')
  const file = path.join(v2.dir(f.root, 1), 'ledger.json'), valid = f.read(), count = ghWrites(f).length
  const corruptions = [
    v => { v.effects[0].status = 'pending-v3' }, v => { delete v.effects[0].status },
    v => { delete v.effects[0].id }, v => { delete v.effects[0].target },
    v => { v.effects[0].op = 'unrecognized-v3' }, v => { v.effects[0] = null },
    v => { v.effects[0].status = 'succeeded' }, v => { v.effects[0].status = 'failed' },
    v => { v.effects[0].target.issue = 2 }, v => { v.verification = [] },
    v => { v.verification = { id: 'missing-subject', scope: 'delivery' } }, v => { v.task = { id: 'missing-checks', status: 'open' } },
  ]
  for (const mutate of corruptions) {
    const corrupted = structuredClone(valid); mutate(corrupted)
    fs.writeFileSync(file, JSON.stringify(corrupted))
    const read = f.cli(['ledger', '1'])
    assert.equal(read.code, 1, read.out); assert.match(read.out, /invalid/)
    const update = f.cli(['control', '1'], { expected: v2.expectedOf(valid), op: 'update', patch: { blocked: [] } })
    assert.equal(update.code, 1); assert.match(update.out, /invalid/)
    assert.equal(f.cli(['comment', '1'], '### Checkpoint start — overlapping\n- Must remain unsent.').code, 1)
    assert.equal(ghWrites(f).length, count)
  }
  fs.writeFileSync(file, JSON.stringify(valid))
  assert.equal(f.read().effects[0].status, 'unknown')
})

test('RUNTIME-03 missing job metadata stays unknown; an unsupported adapter never launches and finishes not verified', () => {
  const f = fixture()
  f.env.onCommand = () => ok('parent zero without lifecycle metadata')
  const unknown = f.verify().proof
  assert.equal(unknown.result, 'unknown'); assert.equal(f.read().verification.id, unknown.id)
  f.control('verification-abandon', { quiescent: true, reason: 'Trusted test adapter confirms no process was launched.' })
  const marker = path.join(f.root, '.work', 'unsupported-must-not-launch')
  const unsupported = require('../lib/devflow-execution.js').createRunner({ platform: 'win32' })
  f.env.onCommand = (cmd, args, opts) => unsupported(cmd, args, opts)
  const proof = f.verify('delivery', refs('a', 'b'), { command: nodeCommand(`require('node:fs').writeFileSync(${JSON.stringify(marker)},'unsafe')`) }).proof
  assert.equal(proof.result, 'not_verified'); assert.equal(proof.provenance, 'not_started')
  assert.equal(proof.job.state, 'not_started'); assert.equal(proof.job.reason, 'unsupported_platform')
  assert.equal(fs.existsSync(marker), false); assert.equal(f.read().verification, undefined)
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

test('current-state ordering and duplicate AC identities fail closed before writes', () => {
  const f = fixture({ activate: false })
  f.issue.body = body().replace('[AC:b@1]', '[AC:a@1]')
  assert.throws(() => f.init(), /duplicate/)
  f.issue.body = '## 문제\nx\n\n## 현재 상태\n- 단계: start\n- 브랜치/PR: feat/1-x\n\n## 수용 기준\n- [ ] [AC:a@1] a\n'
  assert.throws(() => f.init(), /precede|criteria/)
  assert.equal(ghWrites(f).length, 0)
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

test('stage projection, checkpoint and reopen remain usable; integrated main permits only bound delivery cleanup', liveJob, () => {
  const f = fixture()
  assert.equal(f.cli(['state', '1'], '## 현재 상태\n\n- 단계: start\n- 브랜치/PR: feat/1-x\n- 다음 행동: build').code, 0)
  assert.equal(f.cli(['state', '1'], '## 현재 상태\n\n- 단계: ship\n- 브랜치/PR: feat/1-x').code, 1)
  assert.equal(f.cli(['comment', '1'], '### Checkpoint start — approved\n- Start from the retained delivery scope.').code, 0)
  assert.match(state.card(f.env, f.root), /approved/)
  f.control('update', { patch: { stage: 'design' }, reason: 'approved design' })
  f.control('update', { patch: { stage: 'build' }, reason: 'build approved' })
  f.committed('delivered\n')
  complete(f)
  f.control('update', { patch: { stage: 'verify' }, reason: 'verification complete' })
  f.control('update', { patch: { stage: 'review' }, reason: 'delivery accepted' })
  f.control('update', { patch: { stage: 'ship' }, reason: 'review accepted' })
  f.git('switch', 'main'); f.git('merge', '--no-ff', 'feat/1-x', '-m', 'integrate'); f.git('branch', '-d', 'feat/1-x')
  f.control('update', { patch: { stage: 'cleanup' }, reason: 'Integrated main and branch removal confirmed.' })
  f.cli(['note', '1'], 'Cleanup from the bound main tree.')
  f.control('update', { patch: { stage: 'learn' }, reason: 'cleanup complete' })
  f.control('update', { patch: { stage: 'done' }, reason: 'learning recorded' })
  assert.equal(f.read().stage, 'done')
  f.env.vars.CODEX_THREAD_ID = 'unrelated-main-session'
  assert.throws(() => f.read(), /identity mismatch/)
  const g = fixture(); g.issue.state = 'CLOSED'
  assert.equal(g.cli(['reopen', '1']).code, 0)
  assert.equal(g.issue.state, 'OPEN'); assert.equal(g.read().delivery.status, 'open')
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

test('shared store, Issue branch and session cannot authorize a different worktree', () => {
  const f = fixture()
  const other = path.join(tmpdir('devflow-other-worktree-'), 'checkout')
  f.git('worktree', 'add', '--force', other, 'feat/1-x')
  const ctx = state.repoContext(f.env, other)
  assert.equal(ctx.store, fs.realpathSync(f.root)); assert.equal(ctx.branch, f.ctx().branch); assert.equal(ctx.session, f.ctx().session)
  assert.throws(() => v2.read(f.root, 1, ctx), /identity mismatch/)
  assert.throws(() => v2.control(ctx, 1, { expected: f.expected(), op: 'update', patch: { blocked: [] } }, deps), /identity mismatch/)
  assert.equal(f.read().binding.worktreeRoot, fs.realpathSync(f.root))
})

test('large review manifests remain in private artifacts while repeated receipts and CLI responses stay compact', { ...liveJob, timeout: 120000 }, () => {
  const f = fixture({ activate: false })
  const source = path.join(f.root, 'many-files'); fs.mkdirSync(source)
  for (let i = 0; i < 2400; i++) fs.writeFileSync(path.join(source, `source-${i}-${'x'.repeat(160)}.txt`), 'payload\n')
  f.git('add', 'many-files'); f.git('commit', '-qm', 'large tree')
  f.init()
  f.env.onCommand = () => {
    assert.equal(f.read().verification.reviewManifest, undefined)
    assert.ok(fs.statSync(path.join(v2.dir(f.root, 1), 'ledger.json')).size < 16000)
    return null
  }
  const first = f.verify().proof
  const input = JSON.parse(fs.readFileSync(path.join(v2.dir(f.root, 1), first.inputArtifact.path)))
  assert.ok(Buffer.byteLength(JSON.stringify(input.reviewManifest, null, 2)) > 1024 * 1024)
  assert.ok(input.reviewManifest.inputs.length >= 2400)
  assert.equal(first.reviewManifest, undefined)
  const second = f.cli(['verify-run', '1'], { expected: f.expected(), scope: 'delivery', criteria: refs('a', 'b'),
    configFiles: ['config.json'], command: { file: process.execPath, args: ['-e', 'process.stdout.write("compact")'] } })
  assert.equal(second.code, 0, second.out); assert.ok(Buffer.byteLength(second.out) < 8000)
  assert.ok(fs.statSync(path.join(v2.dir(f.root, 1), 'ledger.json')).size < 20000)
  assert.equal(f.read().evidence.length, 2)
  assert.doesNotMatch(second.out, /reviewManifest|reviewDiff|payload/)
})

test('migrated object-shaped blockers remain visible and stop autonomous continuation', () => {
  const f = fixture({ legacy: { stage: 'build', blocked: { dependency: 'unresolved' }, decisions: { scope: 'pending' } } })
  assert.match(state.card(f.env, f.root), /read ledger blocked and decisions/)
  f.control('task-start', { id: 'task-one', current: 1, total: 1, ...wholeTask('a', 'b') })
  f.control('update', { patch: { mode: 'autonomous' }, reason: 'exercise blocked continuation' })
  assert.equal(v2.continuation(f.ctx(), 1), null)
})

test('legacy resume log disables repository configured signature executables', { skip: process.platform === 'win32' && 'POSIX executable-marker fixture' }, () => {
  const f = fixture({ activate: false })
  const marker = path.join(f.root, '.work', 'signature-executed')
  fs.mkdirSync(path.dirname(marker), { recursive: true })
  const program = path.join(f.root, '.work', 'signature-program')
  fs.writeFileSync(program, '#!/bin/sh\nprintf marker > "' + marker + '"\nexit 1\n', { mode: 0o700 })
  const parent = f.git('rev-parse', 'HEAD'), tree = f.git('rev-parse', 'HEAD^{tree}')
  const commit = `tree ${tree}\nparent ${parent}\nauthor Runtime Test <runtime@example.invalid> 1730000000 +0000\ncommitter Runtime Test <runtime@example.invalid> 1730000000 +0000\ngpgsig -----BEGIN PGP SIGNATURE-----\n \n ZmFrZQ==\n -----END PGP SIGNATURE-----\n\nSigned shape\n`
  const head = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], { cwd: f.root, encoding: 'utf8', input: commit }).trim()
  f.git('update-ref', 'refs/heads/feat/1-x', head)
  f.git('config', 'log.showSignature', 'true'); f.git('config', 'gpg.program', program)
  fs.mkdirSync(path.join(f.root, '.work/devflow/i1'), { recursive: true })
  fs.writeFileSync(path.join(f.root, '.work/devflow/i1/ledger.json'), JSON.stringify({ lastCommit: parent }))
  // The vulnerable profile really invokes the benign marker, so a missing marker is not an inert test fixture.
  f.git('log', '--format=%h %s', '-n', '5', `${parent}..HEAD`)
  assert.ok(fs.existsSync(marker)); fs.unlinkSync(marker)
  assert.match(state.card(f.env, f.root), /Signed shape/)
  assert.equal(fs.existsSync(marker), false)
})

test('CLI rejects invalid explicit Issue targets and surplus args before falling back to current scope', () => {
  const f = fixture(), before = f.read(), calls = f.calls.length
  for (const cmd of ['control', 'verify-run', 'review-package', 'effect', 'intent-snapshot', 'ledger-init', 'ledger-rollback', 'check', 'intent', 'close', 'note']) {
    for (const target of ['bogus', '0', '-1', '1.0', '9007199254740992', undefined]) {
      const argv = target === undefined ? [cmd] : [cmd, target]
      const result = f.cli(argv, { expected: f.expected(), op: 'update', patch: { blocked: ['wrong-target'] } })
      assert.notEqual(result.code, 0, `${argv.join(' ')} must not target current Issue`)
      assert.match(result.out, /usage:|positive safe integer/)
    }
  }
  for (const cmd of ['read', 'ledger', 'ledger-update']) {
    assert.notEqual(f.cli([cmd, 'bogus'], {}).code, 0)
    assert.notEqual(f.cli([cmd, '1', 'surplus'], {}).code, 0)
  }
  for (const cmd of ['control', 'verify-run', 'review-package', 'effect', 'intent-snapshot', 'note']) {
    assert.notEqual(f.cli([cmd, '1', 'surplus'], { op: 'reconcile', expected: f.expected() }).code, 0)
  }
  assert.deepEqual(f.read(), before)
  assert.equal(ghWrites(f).length, 0)
  assert.equal(f.cli(['read']).code, 0)
  assert.equal(f.cli(['ledger']).code, 0)
  assert.ok(f.calls.length >= calls)
})

test('CLI discovers v2 contracts and creates cumulative protected review input without acceptance', () => {
  const f = fixture()
  for (const cmd of ['ledger-init', 'control', 'verify-run', 'review-package', 'effect', 'intent-snapshot']) assert.match(f.cli([]).out, new RegExp(cmd))
  const first = f.committed('first delivery change\n')
  f.control('task-start', { id: 'second-task', current: 2, total: 2, ...wholeTask('a', 'b') })
  f.committed('second delivery change\n')
  const before = f.read(), result = f.cli(['review-package', '1'], { scope: 'delivery' })
  assert.equal(result.code, 0, result.out)
  const review = JSON.parse(result.out), manifest = JSON.parse(fs.readFileSync(review.manifestPath))
  assert.equal(review.status, 'NOT_VERIFIED'); assert.equal(review.baseOid, f.original)
  assert.notEqual(review.baseOid, first); assert.equal(manifest.devflow.scope, 'delivery')
  assert.match(fs.readFileSync(review.diffPath, 'utf8'), /second delivery change/)
  assert.deepEqual(f.read(), before)
  const task = JSON.parse(f.cli(['review-package', '1'], { scope: 'task' }).out)
  assert.equal(task.baseOid, first); assert.equal(f.read().evidence.length, 0)
})

test('migration retains the guarded interactive create policy for an independent worktree', () => {
  const f = fixture(), other = tmpdir('devflow-v2-independent-')
  f.git('worktree', 'add', '-b', 'independent-work', other, 'HEAD')
  const create = () => state.main(['create', '--title', 'Approved related work'], () => body(), f.env, other)
  f.control('update', { patch: { mode: 'autonomous' }, reason: 'unattended work in main Issue' })
  const blocked = create(); assert.notEqual(blocked.code, 0); assert.match(blocked.out, /unattended/)
  f.control('update', { patch: { mode: 'interactive' }, reason: 'user returned and approved independent Issue' })
  const allowed = create(); assert.equal(allowed.code, 0, allowed.out)
  assert.equal(ghWrites(f).filter(c => c.args[1] === 'create').length, 1)
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
