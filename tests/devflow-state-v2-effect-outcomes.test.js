'use strict'
// Validated non-dispatch and stored effect outcomes remain distinct from unknown execution.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const tmpdir = require('./tmpdir')
const state = require('../bin/devflow-state')
const v2 = state.v2, deps = state.v2deps()
const { body, fixture, ghWrites, at } = require('./fixtures/devflow-v2')

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
