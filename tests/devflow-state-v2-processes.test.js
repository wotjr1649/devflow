'use strict'
// Keep actual CLI timeouts and descendant observation separate from scope tests so each file fits the unchanged 120s gate.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const state = require('../bin/devflow-state')
const v2 = state.v2
const { fixture, refs, ghWrites, nodeCommand, liveJob, waitFor, actualCliFixture } = require('./fixtures/devflow-v2')

test('RUNTIME-02 actual CLI keeps a URL-less timeout unknown even after a new same-author object appears', liveJob, async () => {
  const r = actualCliFixture(), text = '### Checkpoint start — actual timeout\n- Retain the one uncertain request.'
  const remote = r.readRemote()
  remote.issue.comments.nodes.push({ body: text, authorAssociation: 'OWNER', author: { login: 'runtime-owner' },
    createdAt: new Date(Date.now() - 60000).toISOString(), url: remote.issue.url + '#issuecomment-existing' })
  remote.mode = 'timeout'; r.save(remote)
  const outcome = r.cli(['comment', '1'], text)
  assert.equal(outcome.code, 1); assert.match(outcome.err, /posting state unknown/)
  const receipt = r.ledger().effects.at(-1)
  assert.equal(receipt.status, 'unknown'); assert.equal(receipt.exitCode, 'unknown')
  assert.equal(receipt.transport.localState, 'unknown')
  assert.equal(r.readRemote().writes, 1); assert.equal(r.readRemote().issue.comments.nodes.length, 1)
  const reconcile = () => r.cli(['effect', '1'], { expected: r.expected(), op: 'reconcile', id: receipt.id })
  assert.equal(reconcile().code, 1)
  const late = r.readRemote()
  late.issue.comments.nodes.push({ ...late.issue.comments.nodes[0], author: { login: 'other-trusted-writer' }, url: late.issue.url + '#issuecomment-other' })
  r.save(late); assert.equal(reconcile().code, 1)
  late.issue.comments.nodes.push({ ...late.issue.comments.nodes[0], createdAt: new Date().toISOString(), url: late.issue.url + '#issuecomment-new-result' })
  r.save(late)
  assert.equal(reconcile().code, 1)
  assert.equal(r.ledger().effects.at(-1).transport.code, 'unknown')
  assert.equal(r.ledger().effects.at(-1).observation, undefined)
  assert.equal(r.readRemote().writes, 1)
  await waitFor(() => fs.existsSync(path.join(r.f.root, '.work', 'transport-root-complete')))
})

test('RUNTIME-02 actual CLI never accepts concurrent comment 8 while its own detached transport can later post comment 9', liveJob, async () => {
  const r = actualCliFixture(), text = '### Checkpoint start — correlated transport\n- Keep this request distinct from a concurrent request.'
  const remote = r.readRemote()
  remote.issue.comments.nodes.push({ body: text, authorAssociation: 'OWNER', author: { login: 'runtime-owner' },
    createdAt: new Date(Date.now() - 60000).toISOString(), url: remote.issue.url + '#issuecomment-7' })
  remote.mode = 'concurrent-timeout'; r.save(remote)
  const outcome = r.cli(['comment', '1'], text), receipt = r.ledger().effects.at(-1)
  assert.equal(outcome.code, 1); assert.match(outcome.err, /posting state unknown/)
  assert.equal(receipt.status, 'unknown'); assert.equal(receipt.transport.localState, 'unknown')
  const raw = JSON.parse(fs.readFileSync(path.join(v2.dir(r.f.root, 1), receipt.transport.artifact.path)))
  assert.equal(raw.stdout, ''); assert.equal(raw.job.state, 'unknown')
  assert.deepEqual(r.readRemote().issue.comments.nodes.map(c => c.url.split('#')[1]), ['issuecomment-7', 'issuecomment-8'])
  const pids = JSON.parse(fs.readFileSync(path.join(r.f.root, '.work', 'transport-pids.json')))
  assert.doesNotThrow(() => process.kill(pids.own, 0))
  const next = r.cli(['verify-run', '1'], { expected: r.expected(), scope: 'delivery', criteria: refs('a', 'b'), command: nodeCommand('process.exit(0)') })
  assert.equal(next.code, 1); assert.match(next.err, /external effect/)
  assert.equal(r.cli(['comment', '1'], text).code, 1)
  assert.equal(r.readRemote().writes, 1)
  await waitFor(() => fs.existsSync(path.join(r.f.root, '.work', 'transport-own-complete')))
  assert.deepEqual(r.readRemote().issue.comments.nodes.map(c => c.url.split('#')[1]), ['issuecomment-7', 'issuecomment-8', 'issuecomment-9'])
  const reconcile = r.cli(['effect', '1'], { expected: r.expected(), op: 'reconcile', id: receipt.id })
  assert.equal(reconcile.code, 1); assert.match(reconcile.err, /local transport exit remains unknown/)
  assert.equal(r.ledger().effects.at(-1).status, 'unknown')
  assert.equal(r.readRemote().writes, 1)
})

test('RUNTIME-02 a returned URL and matching remote state cannot replace actual descendant completion', liveJob, async () => {
  const r = actualCliFixture(), remote = r.readRemote()
  remote.mode = 'returned-live-child'; r.save(remote)
  const outcome = r.cli(['comment', '1'], '### Checkpoint start — live transport child\n- Remote readback is separate from local completion.')
  assert.equal(outcome.code, 1)
  const receipt = r.ledger().effects.at(-1)
  assert.equal(receipt.exitCode, 0); assert.equal(receipt.status, 'unknown')
  assert.equal(receipt.transport.localState, 'unknown'); assert.equal(receipt.transport.resultUrl, undefined)
  const raw = JSON.parse(fs.readFileSync(path.join(v2.dir(r.f.root, 1), receipt.transport.artifact.path)))
  assert.equal(raw.stdout, remote.issue.url + '#issuecomment-9')
  assert.equal(raw.job.rootExit.exitCode, 0)
  assert.equal(r.readRemote().issue.comments.nodes.length, 1)
  assert.equal(r.cli(['control', '1'], { expected: r.expected(), op: 'update', patch: { blocked: [] } }).code, 1)
  await waitFor(() => fs.existsSync(path.join(r.f.root, '.work', 'transport-own-complete')))
  assert.equal(r.cli(['effect', '1'], { expected: r.expected(), op: 'reconcile', id: receipt.id }).code, 1)
  assert.equal(r.ledger().effects.at(-1).status, 'unknown')
})

test('RUNTIME-05 actual CLI records authentication exit 4 and executable ENOENT as terminal not-sent', liveJob, () => {
  for (const mode of ['authfail', 'missing-executable']) {
    const r = actualCliFixture(), remote = r.readRemote()
    remote.mode = mode; r.save(remote)
    const outcome = r.cli(['comment', '1'], '### Checkpoint start — not sent\n- Preserve the raw failure.')
    assert.equal(outcome.code, 1); assert.match(outcome.err, /request not sent/)
    const receipt = r.ledger().effects.at(-1)
    assert.equal(receipt.status, 'failed'); assert.equal(receipt.transport.dispatchOutcome, 'not_sent')
    assert.equal(receipt.exitCode, mode === 'authfail' ? 4 : 'ENOENT')
    assert.equal(r.readRemote().issue.comments.nodes.length, 0)
    const update = r.cli(['control', '1'], { expected: r.expected(), op: 'update', patch: { blocked: [] } })
    assert.equal(update.code, 0, update.err)
  }
})

test('RUNTIME-03 actual detached descendant timeout retains reservation even after parent exit zero', { skip: process.platform !== 'linux' && 'Actual Linux subreaper lifecycle' }, async () => {
  const f = fixture(), marker = path.join(f.root, '.work', 'descendant-finished'), pid = marker + '.pid'
  const child = `const fs=require('node:fs');setTimeout(()=>{fs.writeFileSync('candidate.txt','late descendant mutation\\n');fs.writeFileSync(${JSON.stringify(marker)},'finished')},3000)`
  const parent = `const fs=require('node:fs');const p=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{detached:true,stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pid)},String(p.pid));p.unref()`
  f.env.onCommand = (cmd, args, opts) => state.realEnv.run(cmd, args, { ...opts, timeout: 100 })
  const proof = f.verify('delivery', refs('a', 'b'), { command: nodeCommand(parent) }).proof
  assert.equal(proof.exitCode, 0); assert.equal(proof.result, 'unknown'); assert.equal(proof.job.state, 'unknown')
  assert.equal(f.read().verification.id, proof.id)
  assert.equal(fs.existsSync(marker), false)
  process.kill(Number(fs.readFileSync(pid, 'utf8')), 0)
  assert.throws(() => f.control('delivery-complete', { evidenceIds: [proof.id], impactAnalysis: 'Cannot accept while child is live.' }), /verification/)
  assert.throws(() => f.effect('check', { criteria: refs('a'), evidenceIds: [proof.id] }), /verification/)
  assert.throws(() => f.verify(), /verification/)
  assert.equal(ghWrites(f).length, 0)
  const deadline = Date.now() + 7000
  while (!fs.existsSync(marker)) { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 20)) }
  assert.equal(fs.readFileSync(path.join(f.root, 'candidate.txt'), 'utf8'), 'late descendant mutation\n')
  assert.equal(f.read().verification.id, proof.id)
})
