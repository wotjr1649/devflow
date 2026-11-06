'use strict'
// Operation-bound object identity and strict local transport execution evidence.
const test = require('node:test')
const assert = require('node:assert/strict')
const tmpdir = require('./tmpdir')
const state = require('../bin/devflow-state')
const v2 = state.v2, deps = state.v2deps()
const { ok, modelJob, settled, body, fixture, ghWrites, at, local } = require('./fixtures/devflow-v2')

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
