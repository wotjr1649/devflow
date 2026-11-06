'use strict'
// Public CLI target guards, protected review routing and independent create policy.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const tmpdir = require('./tmpdir')
const state = require('../bin/devflow-state')
const v2 = state.v2
const { ok, refs, body, fixture, ghWrites, wholeTask } = require('./fixtures/devflow-v2')

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
