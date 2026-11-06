'use strict'
// Stable intent identity, proof applicability and bounded private evidence artifacts.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const tmpdir = require('./tmpdir')
const state = require('../bin/devflow-state')
const v2 = state.v2, deps = state.v2deps()
const { ok, settled, refs, body, fixture, ghWrites, nodeCommand, local, wholeTask, liveJob, complete } = require('./fixtures/devflow-v2')

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

test('current-state ordering and duplicate AC identities fail closed before writes', () => {
  const f = fixture({ activate: false })
  f.issue.body = body().replace('[AC:b@1]', '[AC:a@1]')
  assert.throws(() => f.init(), /duplicate/)
  f.issue.body = '## 문제\nx\n\n## 현재 상태\n- 단계: start\n- 브랜치/PR: feat/1-x\n\n## 수용 기준\n- [ ] [AC:a@1] a\n'
  assert.throws(() => f.init(), /precede|criteria/)
  assert.equal(ghWrites(f).length, 0)
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
