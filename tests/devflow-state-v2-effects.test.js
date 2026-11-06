'use strict'
// Unknown external effects and read-only reconciliation never replay an uncertain request.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const tmpdir = require('./tmpdir')
const state = require('../bin/devflow-state')
const v2 = state.v2, deps = state.v2deps()
const { settled, body, fixture, ghWrites, at } = require('./fixtures/devflow-v2')

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
