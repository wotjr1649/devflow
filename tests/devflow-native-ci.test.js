'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readReceipt, writeReceipt, passed, caseIds, startupError } = require('./ci/codex-native-boundary.cjs')

test('native CI receipts reject execution errors, empty reads and unrelated negative errors', () => {
  assert.equal(readReceipt('source', { exitCode: 0, stdout: '', stderr: '' }, 'source\n', true, '/fixture/source').pass, false)
  assert.equal(readReceipt('outside', { exitCode: 1, stdout: '', stderr: 'bwrap: Permission denied' }, 'sentinel\n', false, '/fixture/outside').pass, false)
  assert.equal(readReceipt('outside', { exitCode: 1, stdout: 'sentinel\n', stderr: '/usr/bin/cat: /fixture/outside: Permission denied' }, 'sentinel\n', false, '/fixture/outside').pass, false)
  assert.equal(readReceipt('outside', { exitCode: 1, stdout: '', stderr: '/usr/bin/cat: /fixture/outside: Permission denied' }, 'sentinel\n', false, '/fixture/outside').pass, true)
  assert.equal(readReceipt('hidden', { exitCode: 1, stdout: '', stderr: '/usr/bin/cat: /fixture/outside: No such file or directory' }, 'sentinel\n', false, '/fixture/outside').pass, true)
})

test('native CI writes require tool denial and host-observed absence', () => {
  const denied = { exitCode: 1, stdout: '', stderr: "/usr/bin/touch: cannot touch '/fixture/new': Read-only file system" }
  assert.equal(writeReceipt('write', denied, false, '/fixture/new').pass, true)
  assert.equal(writeReceipt('write', denied, true, '/fixture/new').pass, false)
  assert.equal(writeReceipt('write', { ...denied, exitCode: 0 }, false, '/fixture/new').pass, false)
})

test('aggregate cannot pass with missing cases, process uncertainty or bootstrap failure', () => {
  const rows = caseIds.map(id => ({ id, pass: true }))
  assert.equal(passed(rows, true, true, null), true)
  assert.equal(passed(rows.slice(1), true, true, null), false)
  assert.equal(passed(rows, false, true, null), false)
  assert.equal(passed(rows, true, false, null), false)
  assert.equal(passed(rows, true, true, 'RPC_ERROR'), false)
  assert.equal(passed([{ pass: false }, ...rows.slice(1)], true, true, null), false)
  assert.equal(passed(rows.map(() => rows[0]), true, true, null), false)
})

test('startup diagnostics select one bounded error and replace fixture/vendor paths', () => {
  assert.equal(startupError('warning\nError: cannot open /fixture/db\nmore data', [['/fixture', '<fixture>']]), 'Error: cannot open <fixture>/db')
  assert.equal(startupError('unrecognized log', []), null)
  assert.equal(startupError('Error: ' + 'x'.repeat(1000), []).length, 500)
})
