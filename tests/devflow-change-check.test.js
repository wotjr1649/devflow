'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const tmpdir = require('./tmpdir')
const { main, hashFile } = require('../bin/devflow-state')

function checkInput(root, name) {
  const { sha256, mode } = hashFile(path.join(root, name))
  return { path: name, sha256, mode }
}

function fixture(gitMode = true, folder = tmpdir('change-check-')) {
  const root = fs.realpathSync(folder)
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
  record.audit = { by: 'reviewer', verdict: 'READY', binding: check('plan').auditBinding }
  persist()
  return { root, record, directory, contract, persist, check, env }
}

test('document HOLD overrides plan approval and only a current independent READY opens build', () => {
  const f = fixture()
  f.record.audit.verdict = 'HOLD'
  f.persist()
  assert.match(f.check('build').reason, /document audit HOLD/)
  assert.equal(f.check('resume').status, 'ready', 'status is still read-only and available')
  assert.equal(f.check('resume').buildStatus, 'hold')
  assert.equal(f.check('resume').buildReason, f.check('build').reason)
  assert.equal(f.check('plan').auditBinding, f.record.audit.binding)
  delete f.record.audit
  f.persist()
  assert.match(f.check('build').reason, /missing or stale independent document audit/)
  const binding = f.check('plan').auditBinding
  const spec = path.join(f.directory, 'spec.md')
  fs.appendFileSync(spec, 'updated specification\n')
  f.record.approvals.spec.sha256 = hashFile(spec).sha256
  f.record.audit = { by: 'reviewer', verdict: 'READY', binding }
  f.persist()
  assert.match(f.check('build').reason, /missing or stale independent document audit/)
  for (const [file, update] of [
    [path.join(f.directory, 'intent.md'), sha256 => { f.record.approvals.intent.sha256 = sha256 }],
    [path.join(f.directory, 'plan.md'), sha256 => { f.record.approvals.plan.sha256 = sha256 }],
    [f.contract, sha256 => { f.record.contracts[0].sha256 = sha256 }],
  ]) {
    f.record.audit.binding = f.check('plan').auditBinding
    f.persist()
    assert.equal(f.check('build').status, 'ready')
    fs.appendFileSync(file, 'changed after audit\n')
    update(hashFile(file).sha256)
    f.persist()
    assert.match(f.check('build').reason, /missing or stale independent document audit/)
  }
  f.record.audit.binding = f.check('plan').auditBinding
  f.persist()
  assert.equal(f.check('build').status, 'ready')
})

test('a single document revision gates the other document stages and build', () => {
  const f = fixture(false)
  f.record.revision = 'spec'
  f.persist()
  assert.equal(f.check('design').status, 'ready')
  assert.match(f.check('plan').reason, /another stage/)
  assert.match(f.check('start').reason, /another stage/)
  assert.match(f.check('build').reason, /revision is still open/)
  assert.equal(f.check('resume').buildReason, f.check('build').reason)
  f.record.contracts = []
  delete f.record.audit
  delete f.record.revision
  f.persist()
  assert.equal(f.check('build').status, 'ready', 'simple non-contract assignment can use the existing approvals')
})

test('an explicit audit requirement applies without contracts and is bound to the reviewed plan', () => {
  const f = fixture(false)
  f.record.contracts = []
  f.persist()
  const old = f.check('plan').auditBinding
  f.record.auditRequired = true
  f.record.audit.binding = old
  f.persist()
  assert.equal(f.check('resume').buildReason, f.check('build').reason)
  assert.match(f.check('build').reason, /missing or stale independent document audit/)
  f.record.audit.binding = f.check('plan').auditBinding
  assert.notEqual(f.record.audit.binding, old)
  f.persist()
  assert.equal(f.check('build').status, 'ready')
  assert.equal(f.check('resume').buildStatus, 'ready')
  f.record.auditRequired = 'true'
  f.persist()
  assert.match(f.check('build').reason, /invalid audit requirement/)
})

test('a local assignment returns its own paths and the required next read without tying approval to HEAD', () => {
  const f = fixture()
  const result = f.check('build')
  assert.equal(result.status, 'ready')
  assert.match(result.next, /read its Resume reference before opening any returned work record or editing/)
  assert.match(f.check('resume').next, /read its Resume reference.*Status is read-only and does not rerun tests/)
  for (const stage of ['start', 'design', 'plan'])
    assert.match(f.check(stage).next, /read its references\/change\.md before opening any returned work record/)
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
    return checkInput(f.root, name)
  })
  const check = (id, values) => ({
    id, command: 'node --test ' + id, exitCode: 0, node: process.version,
    platform: process.platform, arch: process.arch, inputs: values,
  })
  const receipt = {
    id: 'example', binding: unknown.binding,
    checks: [check('code', [inputs[0]]), check('tests', [inputs[1]])],
    review: { verdict: 'no-findings', inputs: inputs.map(({ path, sha256 }) => ({ path, sha256 })) },
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

test('assigned review reuses only complete matching successful checks after a contract is reapproved', () => {
  const f = fixture(false)
  const src = 'src/code.js'
  const spec = 'docs/specs/shared.md'
  const suite = 'tests/check.js'
  for (const name of [src, suite]) {
    const target = path.join(f.root, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, name)
  }
  f.record.verification = [
    { id: 'http', command: 'node --test tests/*.js', paths: ['src/', 'tests/', spec] },
    { id: 'syntax', command: 'node --check ' + src, paths: [src] },
  ]
  f.persist()
  const before = f.check('review').evidence
  const decide = () => f.check('review').evidence.verification
  assert.deepEqual(before.verification.run, ['http', 'syntax'])
  assert.deepEqual(f.check('resume').evidence.verification, before.verification)
  const proof = { id: f.record.id, binding: before.binding, verificationBasis: before.verification.basis,
    checks: f.record.verification.map((policy, index) => ({
      id: policy.id, command: policy.command, exitCode: 0, node: process.version, platform: process.platform, arch: process.arch,
      inputs: (index ? [src] : [src, spec, suite]).map(name => checkInput(f.root, name)),
    })) }
  const target = path.join(f.root, before.path)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const save = () => fs.writeFileSync(target, JSON.stringify(proof))
  save()
  assert.deepEqual(decide().reuse, ['http', 'syntax'])
  fs.writeFileSync(path.join(f.root, 'tests/new.js'), 'another test')
  assert.deepEqual(decide().run, ['http'])
  fs.unlinkSync(path.join(f.root, 'tests/new.js'))
  assert.deepEqual(decide().run, [])
  proof.checks[0].command += ' --test-only'
  save()
  assert.deepEqual(decide().run, ['http'])
  proof.checks[0].command = f.record.verification[0].command
  proof.checks[0].exitCode = 1
  save()
  assert.deepEqual(decide().run, ['http'])
  assert.deepEqual(f.check('resume').evidence.checks[0], {
    id: 'http', command: f.record.verification[0].command, status: 'current', exitCode: 1,
  })
  proof.checks[0].exitCode = 0
  save()
  fs.appendFileSync(f.contract, 'approved requirement')
  assert.match(f.check('review').reason, /contract changed/)
  f.record.contracts[0].sha256 = hashFile(f.contract).sha256
  f.persist()
  assert.equal(f.check('review').evidence.status, 'stale')
  assert.deepEqual(decide().run, ['http'])
  assert.deepEqual(decide().reuse, ['syntax'])
  f.record.approvals.intent.by = 'next approver'
  f.persist()
  assert.deepEqual(decide().run, ['http', 'syntax'])
  f.record.verification[0].paths = ['../tests/']
  f.persist()
  assert.deepEqual(decide(), { status: 'invalid' })
})

test('verification rechecks the affected inputs, execution options and environment only', () => {
  const f = fixture(false)
  const names = ['package-lock.json', 'test-config.json', 'lint-config.json']
  for (const name of names) fs.writeFileSync(path.join(f.root, name), '{}\n')
  f.record.verification = [
    { id: 'http', command: 'node --test tests/*.cjs', paths: names.slice(0, 2), environment: ['TZ', 'NODE_OPTIONS'] },
    { id: 'lint', command: 'node validate.cjs', paths: names.slice(2) },
  ]
  f.persist()
  const state = f.check('review').evidence
  const decide = () => f.check('review').evidence.verification
  const receipt = { id: f.record.id, binding: state.binding, verificationBasis: state.verification.basis,
    checks: f.record.verification.map(policy => ({
      id: policy.id, command: policy.command, exitCode: 0, node: process.version, platform: process.platform, arch: process.arch,
      inputs: policy.paths.map(name => checkInput(f.root, name)),
    })) }
  const target = path.join(f.root, state.path)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const save = () => fs.writeFileSync(target, JSON.stringify(receipt))
  save()
  assert.deepEqual(decide().run, ['http'], 'legacy receipt without a required environment digest must rerun')
  receipt.checks[0].environmentSha256 = state.verification.environments.http
  save()
  assert.deepEqual(decide().reuse, ['http', 'lint'])
  const input = receipt.checks[0].inputs[0]
  const targetInput = path.join(f.root, input.path)
  try {
    fs.chmodSync(targetInput, input.mode & ~0o222)
    const changed = checkInput(f.root, input.path)
    assert.equal(changed.sha256, input.sha256)
    assert.notEqual(changed.mode, input.mode)
    assert.deepEqual(decide().run, ['http'])
    assert.deepEqual(decide().reuse, ['lint'])
    assert.equal(f.check('resume').evidence.checks[0].status, 'stale')
  } finally {
    fs.chmodSync(targetInput, input.mode)
  }
  const oldMode = input.mode
  delete input.mode
  save()
  assert.deepEqual(decide().run, ['http'], 'legacy input without a mode cannot authorize reuse')
  assert.deepEqual(decide().reuse, ['lint'])
  assert.equal(f.check('resume').evidence.checks[0].status, 'stale')
  input.mode = oldMode
  save()
  assert.deepEqual(decide().reuse, ['http', 'lint'])
  for (const name of names.slice(0, 2)) {
    fs.appendFileSync(path.join(f.root, name), '\n')
    assert.deepEqual(decide().run, ['http'])
    assert.deepEqual(decide().reuse, ['lint'])
    fs.writeFileSync(path.join(f.root, name), '{}\n')
  }
  f.env.vars.NODE_OPTIONS = '--no-warnings'
  assert.deepEqual(decide().run, ['http'])
  assert.equal(JSON.stringify(decide()).includes('--no-warnings'), false)
  for (const stage of ['build', 'resume', 'review']) {
    const evidence = f.check(stage).evidence
    assert.deepEqual(evidence.verification.run, ['http'], stage)
    assert.deepEqual(evidence.verification.reuse, ['lint'], stage)
    assert.deepEqual(evidence.checks.map(check => [check.status, check.exitCode]), [
      ['stale', undefined], ['current', 0],
    ], stage)
  }
  delete f.env.vars.NODE_OPTIONS
  f.env.vars.TZ = ''
  assert.deepEqual(decide().run, ['http'], 'unset and empty are different inputs')
  delete f.env.vars.TZ
  assert.deepEqual(decide().reuse, ['http', 'lint'])
  f.record.verification[0].command += ' --test-only'
  f.persist()
  assert.deepEqual(decide().run, ['http'])
  assert.equal(f.check('resume').evidence.checks[0].status, 'stale')
  f.record.verification[0].environment = ['GITHUB_TOKEN']
  f.persist()
  assert.deepEqual(decide(), { status: 'invalid' })
})

test('a malformed receipt cannot authorize reuse and oversized scopes explain reruns', () => {
  const f = fixture(false)
  const p = 'inputs/check.js'
  fs.mkdirSync(path.join(f.root, 'inputs'))
  fs.writeFileSync(path.join(f.root, p), 'check')
  const command = 'node --check inputs/check.js'
  f.record.verification = [{ id: 'syntax', command, paths: ['inputs/'] }]
  f.persist()
  const before = f.check('resume').evidence
  const filename = path.join(f.root, before.path)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const check = { id: 'syntax', command, exitCode: 0, node: process.version, platform: process.platform, arch: process.arch,
    inputs: [checkInput(f.root, p)] }
  const save = checks => fs.writeFileSync(filename, JSON.stringify({ id: f.record.id, binding: before.binding,
    verificationBasis: before.verification.basis, checks }))
  save([check])
  assert.deepEqual(f.check('resume').evidence.verification.reuse, ['syntax'])
  save([check, { id: 'incomplete' }])
  const invalid = f.check('resume').evidence
  assert.equal(invalid.status, 'unknown')
  assert.deepEqual(invalid.verification.reuse, [])
  assert.deepEqual(invalid.verification.run, ['syntax'])
  save([{ ...check, inputs: [{ ...check.inputs[0], mode: 0o040755 }] }])
  assert.equal(f.check('resume').evidence.status, 'unknown', 'a directory mode is invalid for a file receipt')
  assert.deepEqual(f.check('resume').evidence.verification.run, ['syntax'])
  save([check])
  for (let i = 0; i < 32; i++) fs.writeFileSync(path.join(f.root, 'inputs', `${i}.js`), '')
  const oversized = f.check('resume').evidence.verification
  assert.deepEqual(oversized.run, ['syntax'])
  assert.match(oversized.runReasons.syntax, /32 files/)
})

test('a linked receipt is refused without losing the required rerun plan', () => {
  const f = fixture(false)
  const name = 'app.js'
  fs.writeFileSync(path.join(f.root, name), 'module.exports = 1\n')
  const command = 'node --check app.js'
  f.record.verification = [{ id: 'syntax', command, paths: [name] }]
  f.persist()
  const before = f.check('resume').evidence
  assert.deepEqual(before.verification.run, ['syntax'])
  const backing = tmpdir('linked-receipts-')
  fs.writeFileSync(path.join(backing, 'example.json'), JSON.stringify({ id: f.record.id, binding: before.binding,
    verificationBasis: before.verification.basis, checks: [{ id: 'syntax', command, exitCode: 0,
      node: process.version, platform: process.platform, arch: process.arch, inputs: [checkInput(f.root, name)] }] }))
  const directory = path.dirname(path.join(f.root, before.path))
  fs.mkdirSync(path.dirname(directory), { recursive: true })
  fs.symlinkSync(backing, directory, process.platform === 'win32' ? 'junction' : 'dir')
  for (const stage of ['build', 'resume', 'review']) {
    assert.deepEqual(f.check(stage).evidence, { status: 'unknown', verification: before.verification }, stage)
  }
})

test('Git-free work confirms its hashes and declared shared contracts', () => {
  const f = fixture(false)
  assert.equal(f.check('review').status, 'ready')
  fs.appendFileSync(f.contract, 'new contract\n')
  assert.match(f.check('resume').reason, /contract changed/)
})

test('Git-free assignments work without Git but hold for repository markers and stale approval', () => {
  const parent = tmpdir('change-check-parent-')
  const child = path.join(parent, 'work')
  fs.mkdirSync(child)
  const f = fixture(false, child)
  f.env.run = () => ({ code: 'ENOENT' })
  assert.equal(f.check('build').status, 'ready')
  fs.writeFileSync(path.join(parent, '.git'), 'gitdir: elsewhere')
  assert.match(f.check('build').reason, /Git-free assignment cannot be verified/)
  fs.unlinkSync(path.join(parent, '.git'))
  fs.writeFileSync(path.join(parent, 'HEAD'), 'ref: refs/heads/example')
  fs.mkdirSync(path.join(parent, 'objects'))
  assert.match(f.check('build').reason, /Git-free assignment cannot be verified/)
  fs.unlinkSync(path.join(parent, 'HEAD'))
  f.env.vars.GIT_DIR = 'elsewhere'
  assert.match(f.check('build').reason, /Git-free assignment cannot be verified/)
  delete f.env.vars.GIT_DIR
  fs.appendFileSync(path.join(f.directory, 'spec.md'), 'modified\n')
  assert.match(f.check('build').reason, /stale spec approval/)
})

test('nested stage checks keep the verified root and stop at a nested Git boundary', () => {
  for (const gitMode of [false, true]) {
    const f = fixture(gitMode)
    if (gitMode) fs.mkdirSync(path.join(f.root, '.git'))
    const env = { ...f.env, run(command, args, options) {
      assert.equal(options.cwd, f.root, 'Git identity is checked at the assignment root')
      return f.env.run(command, args)
    } }
    const check = directory => {
      const result = main(['change-check', 'design', 'example'], () => assert.fail('No stdin'), env, directory)
      return { code: result.code, ...JSON.parse(result.out) }
    }
    const ready = check(f.directory)
    assert.equal(ready.status, 'ready')
    assert.equal(ready.assignmentRoot, path.relative(f.directory, f.root))
    assert.equal(path.resolve(f.directory, ready.assignmentRoot, ready.artifacts.spec), path.join(f.directory, 'spec.md'))
    assert.equal(check(f.root).assignmentRoot, undefined)
    fs.mkdirSync(path.join(f.directory, '.git'))
    assert.match(check(f.directory).reason, /missing or mismatched operator assignment/)
  }
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
