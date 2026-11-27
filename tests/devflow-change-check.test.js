'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const tmpdir = require('./tmpdir')
const { main, hashFile } = require('../bin/devflow-state')

function fixture(gitMode = true) {
  const root = fs.realpathSync(tmpdir('change-check-'))
  const branch = 'trial/example'
  const common = path.join(root, '.git')
  const directory = path.join(root, 'docs', 'changes', 'example')
  const recordFile = path.join(root, '.work', 'devflow', 'change.json')
  const contract = path.join(root, 'docs', 'specs', 'shared.md')
  const approval = Object.create(null)
  fs.mkdirSync(directory, { recursive: true })
  fs.mkdirSync(path.dirname(contract), { recursive: true })
  fs.mkdirSync(path.dirname(recordFile), { recursive: true })
  for (const kind of ['intent', 'spec', 'plan']) {
    const target = path.join(directory, kind + '.md')
    fs.writeFileSync(target, kind + '\n')
    approval[kind] = { by: 'operator', sha256: hashFile(target).sha256 }
  }
  fs.writeFileSync(contract, 'shared requirement\n')
  const record = { root, id: 'example', git: gitMode ? { branch, common } : null,
    approvals: approval, contracts: [{ path: 'docs/specs/shared.md', sha256: hashFile(contract).sha256 }] }
  const persist = () => fs.writeFileSync(recordFile, JSON.stringify(record))
  persist()
  const env = {
    vars: {},
    run(command, args) {
      assert.equal(command, 'git')
      if (!gitMode) return { code: 128, stderr: 'fatal: not a git repository' }
      const outputs = { '--show-toplevel': root, '--git-common-dir': common, HEAD: branch }
      assert.ok(Object.hasOwn(outputs, args.at(-1)), 'No network, revision, or write command')
      return { code: 0, stdout: outputs[args.at(-1)] }
    },
  }
  function check(stage, ...args) {
    const result = main(['change-check', stage, ...args], () => assert.fail('No stdin'), env, root)
    return { code: result.code, ...JSON.parse(result.out) }
  }
  return { root, record, directory, contract, persist, check }
}

test('a local assignment returns only its paths without tying approval to HEAD', () => {
  const f = fixture()
  const result = f.check('build')
  assert.equal(result.status, 'ready')
  assert.equal(result.artifacts.plan, 'docs/changes/example/plan.md')
  assert.deepEqual(result.contracts, ['docs/specs/shared.md'])
  assert.equal(f.check('build','other-change').status, 'hold')
  f.record.git.branch = 'trial/other'
  f.persist()
  assert.match(f.check('resume').reason, /repository or branch changed/)
})

test('resume classifies missing, current and stale handoff evidence without running the checks', () => {
  const f = fixture()
  const relative = 'artifacts/handoff/example.json'
  const unknown = f.check('resume').evidence
  assert.deepEqual(unknown, { path: relative, binding: unknown.binding, status: 'unknown' })
  assert.match(unknown.binding, /^[0-9a-f]{64}$/)
  assert.equal(f.check('plan').evidence, undefined)
  const files = ['src/code.js', 'tests/check.js']
  const inputs = files.map(name => {
    const target = path.join(f.root, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, name + '\n')
    return { path: name, sha256: hashFile(target).sha256 }
  })
  const check = (id, values) => ({
    id, command: 'node --test ' + id, exitCode: 0, node: process.version,
    platform: process.platform, arch: process.arch, inputs: values,
  })
  const receipt = {
    id: 'example', binding: unknown.binding,
    checks: [check('code', [inputs[0]]), check('tests', [inputs[1]])],
    review: { verdict: 'no-findings', inputs },
  }
  const file = path.join(f.root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const save = () => fs.writeFileSync(file, JSON.stringify(receipt))
  save()
  const current = f.check('resume').evidence
  assert.equal(current.status, 'recorded')
  assert.deepEqual(current.checks.map(entry => [entry.status, entry.exitCode]), [['current', 0], ['current', 0]])
  assert.deepEqual(current.review, { status: 'current', verdict: 'no-findings' })

  fs.appendFileSync(path.join(f.root, files[0]), 'changed\n')
  const selective = f.check('resume').evidence
  assert.deepEqual(selective.checks.map(entry => entry.status), ['stale', 'current'])
  assert.deepEqual(selective.review, { status: 'stale' })
  receipt.checks[1].node = 'other'
  save()
  assert.equal(f.check('resume').evidence.checks[1].status, 'stale')
  receipt.checks[1].inputs[0].path = '../outside'
  save()
  assert.equal(f.check('resume').evidence.checks[1].status, 'unknown')
  const spec = path.join(f.directory, 'spec.md')
  fs.appendFileSync(spec, 'updated design\n')
  f.record.approvals.spec.sha256 = hashFile(spec).sha256
  f.persist()
  const reapproved = f.check('resume').evidence
  assert.equal(reapproved.status, 'stale')
  assert.notEqual(reapproved.binding, unknown.binding)
  receipt.binding = reapproved.binding
  save()
  assert.equal(f.check('resume').evidence.status, 'recorded')
  fs.appendFileSync(f.contract, 'updated contract\n')
  f.record.contracts[0].sha256 = hashFile(f.contract).sha256
  f.persist()
  const contractChanged = f.check('resume').evidence
  assert.equal(contractChanged.status, 'stale')
  assert.notEqual(contractChanged.binding, reapproved.binding)
  receipt.id = 'different-assignment'
  save()
  assert.deepEqual(f.check('resume').evidence, { ...contractChanged, status: 'unknown' })
})

test('planning holds a stale specification while design only requires approved intent', () => {
  const f = fixture()
  fs.appendFileSync(path.join(f.directory, 'spec.md'), 'modified\n')
  assert.equal(f.check('design').status, 'ready')
  assert.match(f.check('plan').reason, /stale spec approval/)
  assert.match(f.check('build').reason, /stale spec approval/)
})

test('Git-free work confirms its hashes and declared shared contracts', () => {
  const f = fixture(false)
  assert.equal(f.check('review').status, 'ready')
  fs.appendFileSync(f.contract, 'new contract\n')
  assert.match(f.check('resume').reason, /contract changed/)
})

test('start distinguishes a missing intent from the same event on retry', () => {
  const f = fixture(false)
  const intent = path.join(f.directory, 'intent.md')
  fs.unlinkSync(intent)
  assert.equal(f.check('start').intentExists, false)
  fs.writeFileSync(intent, 'draft waiting signal\n')
  assert.equal(f.check('start').intentExists, true)
  assert.match(f.check('design').reason, /stale intent approval/)
})

test('a symlinked change directory holds even when the draft is absent', () => {
  const f = fixture(false)
  const other = path.join(f.root, 'elsewhere')
  fs.mkdirSync(other)
  const relocated = path.join(f.root, 'relocated')
  fs.renameSync(f.directory, relocated)
  fs.symlinkSync(other, f.directory, process.platform === 'win32' ? 'junction' : 'dir')
  assert.match(f.check('start').reason, /unsafe change artifact path/)
})
