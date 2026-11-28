'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
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

for (const withGit of [false, true]) {
  test(`verification-only report through the CLI in ${withGit ? 'a linked Git worktree' : 'a Git-free project'}`, () => {
    const parent = tmpdir('direct-verification-')
    const project = path.join(parent, 'project')
    const primary = path.join(parent, 'primary')
    function git(cwd, ...args) {
      const result = spawnSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false',
        '-c', 'user.name=Trial', '-c', 'user.email=trial@example.invalid', ...args],
      { cwd, encoding: 'utf8', timeout: 15000, windowsHide: true })
      assert.equal(result.status, 0, result.stderr || result.error?.message)
      return result.stdout.trim()
    }
    if (withGit) {
      fs.mkdirSync(primary)
      git(primary, 'init', '-q')
      git(primary, 'commit', '-qm', 'Fixture', '--allow-empty')
      git(primary, 'worktree', 'add', '-qb', 'trial/example', project)
      assert.ok(fs.statSync(path.join(project, '.git')).isFile())
    } else fs.mkdirSync(project)

    const f = fixture(withGit, project)
    if (withGit) f.record.git.common = git(f.root, 'rev-parse', '--path-format=absolute', '--git-common-dir')
    const source = path.join(f.root, 'source.cjs')
    const adapter = path.join(f.root, 'verify.cjs')
    const runs = path.join(f.root, 'runs.txt')
    const original = 'module.exports = true\n'
    fs.writeFileSync(source, original)
    fs.writeFileSync(adapter, "require('node:assert/strict').equal(require('./source.cjs'), true)\n" +
      "require('node:fs').appendFileSync('runs.txt', 'ran\\n')\n")
    const verification = { id: 'suite', command: 'node verify.cjs', paths: ['source.cjs', 'verify.cjs', 'docs/specs/shared.md'] }
    f.record.verification = [verification]
    f.record.reviewPaths = ['source.cjs', 'verify.cjs']
    f.persist()

    const env = withGit ? process.env : {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH')),
      PATH: path.join(parent, 'empty-path'),
    }
    if (!withGit) assert.equal(spawnSync('git', ['--version'], { cwd: f.root, env }).error?.code, 'ENOENT')
    const launch = (...args) => spawnSync(process.execPath, args,
      { cwd: f.root, env, encoding: 'utf8', timeout: 15000, windowsHide: true })
    const command = path.join(__dirname, '../bin/devflow-state')
    const review = (...extra) => {
      const result = launch(command, 'change-check', 'review', 'example', ...extra)
      assert.ok([0, 1].includes(result.status), result.stderr || result.error?.message)
      return { code: result.status, ...JSON.parse(result.status === 0 ? result.stdout : result.stderr) }
    }
    const scoped = () => review('--verification-only')
    const fallback = () => {
      const result = scoped()
      assert.deepEqual(result, review(), 'the caller receives the original review or hold result')
      return result
    }
    const start = review()
    assert.equal(launch('verify.cjs').status, 0)
    const receiptFile = path.join(f.root, start.evidence.path)
    fs.mkdirSync(path.dirname(receiptFile), { recursive: true })
    const receipt = JSON.stringify({ id: 'example', binding: start.evidence.binding,
      verificationBasis: start.evidence.verification.basis,
      checks: [{ id: verification.id, command: verification.command, exitCode: 0,
        node: process.version, platform: process.platform, arch: process.arch,
        inputs: verification.paths.map(name => checkInput(f.root, name)) }] })
    fs.writeFileSync(receiptFile, receipt)
    const assignment = path.join(f.root, '.work', 'devflow', 'change.json')
    const approved = fs.readFileSync(assignment, 'utf8')

    const direct = { code: 0, status: 'reported', id: 'example', stage: 'review', reused: ['suite'], executed: [] }
    assert.deepEqual(scoped(), direct)
    assert.equal(fs.readFileSync(runs, 'utf8'), 'ran\n')
    assert.equal(fs.readFileSync(assignment, 'utf8'), approved)
    assert.equal(fs.readFileSync(receiptFile, 'utf8'), receipt)

    fs.appendFileSync(source, '// Changed input\n')
    assert.deepEqual(fallback().evidence.verification.run, ['suite'])
    fs.writeFileSync(source, original)
    fs.unlinkSync(receiptFile)
    const missing = fallback()
    assert.equal(missing.evidence.status, 'unknown')
    assert.deepEqual(missing.evidence.verification.run, ['suite'])
    fs.writeFileSync(receiptFile, receipt)
    fs.appendFileSync(f.contract, '\nUnapproved contract\n')
    assert.match(fallback().reason, /contract changed/)
    fs.writeFileSync(f.contract, 'shared requirement\n')
    f.record.audit.verdict = 'HOLD'
    f.persist()
    assert.equal(scoped().reason, 'independent document audit HOLD')
    assert.equal(review().status, 'ready', 'legacy review stays available under a document audit hold')
    f.record.audit.verdict = 'READY'
    f.record.revision = 'spec'
    f.persist()
    assert.equal(scoped().reason, 'document revision is still open')
    assert.equal(review().status, 'ready')
    fs.writeFileSync(assignment, approved)

    const normal = review()
    assert.equal(normal.status, 'ready', 'a wider request uses the regular review command')
    assert.equal(normal.evidence.review.status, 'unknown', 'test reuse does not settle independent review')
    assert.ok(normal.evidence.reviewBinding)
    assert.match(normal.next, /requested rerun/)
    assert.deepEqual(normal.evidence.verification.reuse, ['suite'])
    assert.equal(fs.readFileSync(runs, 'utf8'), 'ran\n', 'report and all fallbacks are read-only')
    assert.equal(launch('verify.cjs').status, 0, 'an explicitly requested rerun can use the original command')
    assert.equal(fs.readFileSync(runs, 'utf8'), 'ran\nran\n')
    for (const args of [['review', '--verification-only'], ['build', 'example', '--verification-only'],
      ['review', 'example', '--verification-only', '--verification-only']]) {
      assert.equal(launch(command, 'change-check', ...args).status, 2)
    }
    if (withGit) assert.equal(git(primary, 'status', '--short'), '')
  })
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

test('finding history counts unique failed attempts across resumes and holds pending or conflicting results', () => {
  for (const gitMode of [true, false]) {
    const f = fixture(gitMode)
    const planSha256 = f.record.approvals.plan.sha256
    const failed = { id: 'retry-1', exitCode: 1, planSha256 }
    const pending = { id: 'timeout-2', exitCode: null, planSha256 }
    f.record.finding = { id: 'r-17', attempts: [failed, { ...failed }] }
    f.persist()
    assert.deepEqual(f.check('build').finding, { id: 'r-17', failedAttempts: 1, pending: [] })
    assert.equal(f.check('build').status, 'ready')
    f.record.finding.attempts.push(pending)
    f.persist()
    assert.equal(f.check('resume').buildStatus, 'hold')
    assert.deepEqual(f.check('resume').finding, { id: 'r-17', failedAttempts: 1, pending: ['timeout-2'] })
    assert.match(f.check('build').reason, /unresolved finding attempt/)
    f.record.finding.attempts.push({ ...pending, exitCode: 1 }, { ...pending })
    f.persist()
    assert.deepEqual(f.check('build').finding, { id: 'r-17', failedAttempts: 2, pending: [] })
    assert.match(f.check('build').reason, /two failed finding attempts/)
    assert.equal(f.check('resume').buildStatus, 'hold')
    assert.equal(f.check('plan').status, 'ready')
    f.record.finding.attempts.push({ ...pending, exitCode: 0 })
    f.persist()
    assert.match(f.check('build').reason, /conflicting finding attempt/)
    delete f.record.finding.attempts
    f.persist()
    assert.match(f.check('build').reason, /invalid finding history/)
  }
})

test('only an explicit finding reopen with a newly approved approach resets the active count', () => {
  const f = fixture(false)
  const planSha256 = f.record.approvals.plan.sha256
  f.record.finding = { id: 'r-17', attempts: [
    { id: 'one', exitCode: 1, planSha256 }, { id: 'two', exitCode: 1, planSha256 },
  ] }
  f.persist()
  f.record.finding.reopen = { after: 'two', planSha256 }
  f.persist()
  assert.match(f.check('build').reason, /invalid finding reopen/)
  const plan = path.join(f.directory, 'plan.md')
  fs.appendFileSync(plan, 'approved new approach\n')
  const newHash = hashFile(plan).sha256
  f.record.approvals.plan.sha256 = newHash
  f.record.audit.binding = f.check('plan').auditBinding
  delete f.record.finding.reopen
  f.persist()
  assert.match(f.check('build').reason, /two failed finding attempts/)
  f.record.finding.reopen = { after: 'two', planSha256: newHash }
  f.persist()
  assert.deepEqual(f.check('build').finding, { id: 'r-17', failedAttempts: 0, pending: [] })
  assert.equal(f.check('build').status, 'ready')
  f.record.finding.attempts.push({ id: 'new-1', exitCode: 1, planSha256: newHash })
  f.persist()
  assert.equal(f.check('build').finding.failedAttempts, 1)
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
  f.record.reviewPaths = ['src/', 'tests/']
  f.persist()
  const { reviewBinding } = f.check('review').evidence
  assert.match(reviewBinding, /^[0-9a-f]{64}$/)
  const receipt = {
    id: 'example', binding: unknown.binding,
    checks: [check('code', [inputs[0]]), check('tests', [inputs[1]])],
    review: { binding: reviewBinding, verdict: 'no-findings', inputs },
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

test('review evidence covers its declared file set independently of verification reuse', t => {
  for (const gitMode of [true, false]) {
    const f = fixture(gitMode)
    const source = 'src/code.js'
    const check = 'tests/check.js'
    const write = (file, content) => {
      const target = path.join(f.root, file)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content)
    }
    write(source, 'source\n')
    write(check, 'check\n')
    f.record.verification = [{ id: 'suite', command: 'node --test tests/check.js', paths: ['tests/'] }]
    f.persist()
    const before = f.check('review').evidence
    const receipt = {
      id: f.record.id,
      binding: before.binding,
      verificationBasis: before.verification.basis,
      checks: [{ id: 'suite', command: f.record.verification[0].command, exitCode: 0, node: process.version,
        platform: process.platform, arch: process.arch, inputs: [checkInput(f.root, check)] }],
      review: { verdict: 'no-findings', inputs: [checkInput(f.root, source), checkInput(f.root, check)] },
    }
    const save = () => write(before.path, JSON.stringify(receipt))
    const decide = () => f.check('review')
    save()
    assert.deepEqual(decide().evidence.review, { status: 'unknown' }, 'old receipts do not prove the file set')
    f.record.reviewPaths = ['src/', check]
    f.persist()
    const { reviewBinding } = decide().evidence
    assert.match(reviewBinding, /^[0-9a-f]{64}$/)
    assert.deepEqual(decide().evidence.review, { status: 'unknown' }, 'declaring a scope does not promote a legacy review')
    receipt.review.binding = reviewBinding
    save()
    const expectReview = (status, verdict) => {
      const result = decide()
      assert.deepEqual(result.evidence.review, verdict ? { status, verdict } : { status }, `${gitMode}: ${status}`)
      assert.deepEqual(result.evidence.verification.reuse, ['suite'])
      assert.deepEqual(result.evidence.verification.run, [])
      assert.match(result.next, /For a verification-only handoff/)
    }
    expectReview('current', 'no-findings')
    write('outside/other.js', 'outside review\n')
    expectReview('current', 'no-findings')
    f.record.reviewPaths.reverse()
    f.persist()
    expectReview('current', 'no-findings')
    write('src/added.js', 'unreviewed file\n')
    expectReview('stale')
    fs.unlinkSync(path.join(f.root, 'src/added.js'))
    fs.renameSync(path.join(f.root, source), path.join(f.root, 'src/moved.js'))
    expectReview('stale')
    fs.unlinkSync(path.join(f.root, 'src/moved.js'))
    expectReview('stale')
    write(source, 'source\n')
    expectReview('current', 'no-findings')
    let injected = false
    const open = fs.openSync
    const mock = t.mock.method(fs, 'openSync', (file, flags, ...args) => {
      if (!injected && file === path.join(f.root, source) && typeof flags === 'number') {
        injected = true
        write('src/during.js', 'added while hashing review inputs\n')
      }
      return open(file, flags, ...args)
    })
    try { expectReview('stale') } finally { mock.mock.restore() }
    assert.equal(injected, true)
    fs.unlinkSync(path.join(f.root, 'src/during.js'))
    injected = false
    const cross = t.mock.method(fs, 'openSync', (file, flags, ...args) => {
      if (!injected && file === path.join(f.root, source) && typeof flags === 'number') {
        injected = true
        write('tests/during.js', 'added while hashing the separate review scope\n')
      }
      return open(file, flags, ...args)
    })
    let result
    try { result = decide() } finally { cross.mock.restore() }
    assert.equal(injected, true)
    assert.deepEqual(result.evidence.review, { status: 'current', verdict: 'no-findings' })
    assert.deepEqual(result.evidence.verification.reuse, [])
    assert.deepEqual(result.evidence.verification.run, ['suite'])
    assert.equal(result.next, undefined, 'review reads must not hide check drift')
    fs.unlinkSync(path.join(f.root, 'tests/during.js'))
    f.record.reviewPaths = [source, check]
    f.persist()
    expectReview('stale')
    f.record.reviewPaths = ['../outside']
    f.persist()
    assert.equal(decide().evidence.reviewBinding, undefined)
    expectReview('unknown')
  }
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
  assert.equal(f.check('review').next, undefined, 'missing evidence cannot finish a handoff')
  assert.equal(f.check('review').verificationAction, undefined, 'missing evidence does not give a reuse shortcut')
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
  assert.match(f.check('review').next, /For a verification-only handoff, report the reused IDs and that no checks ran/)
  assert.match(f.check('review').next, /wider request, known check-input drift, or requested rerun/)
  fs.writeFileSync(path.join(f.root, 'tests/new.js'), 'another test')
  assert.deepEqual(decide().run, ['http'])
  assert.equal(f.check('review').next, undefined, 'a changed test requires normal routing')
  assert.match(f.check('review').verificationAction, /execute only authorized checks in evidence\.verification\.run/)
  assert.match(f.check('review').verificationAction, /independent review, drift outside declared inputs/)
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
  assert.equal(f.check('review').next, undefined, 'a stale contract binding requires normal routing')
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

test('an input that changes while checking evidence moves its check back to run', t => {
  const f = fixture(false)
  const names = ['changed.js', 'unchanged.js']
  const original = 'const value = 1;\n'
  for (const name of names) fs.writeFileSync(path.join(f.root, name), original)
  f.record.verification = names.map(name => ({
    id: path.basename(name, '.js'), command: 'node --check ' + name, paths: [name],
  }))
  f.persist()
  const before = f.check('review').evidence
  const receipt = path.join(f.root, before.path)
  fs.mkdirSync(path.dirname(receipt), { recursive: true })
  fs.writeFileSync(receipt, JSON.stringify({
    id: f.record.id, binding: before.binding, verificationBasis: before.verification.basis,
    checks: f.record.verification.map(({ id, command, paths }) => ({
      id, command, exitCode: 0, node: process.version, platform: process.platform, arch: process.arch,
      inputs: paths.map(name => checkInput(f.root, name)),
    })),
  }))
  assert.match(f.check('review').next, /For a verification-only handoff/)

  const changed = path.join(f.root, names[0])
  const open = fs.openSync
  for (const stage of ['build', 'resume', 'review']) {
    fs.writeFileSync(changed, original)
    let reads = 0
    const mock = t.mock.method(fs, 'openSync', (file, flags, ...args) => {
      if (file === changed && typeof flags === 'number' && ++reads === 2) {
        fs.writeFileSync(changed, 'const value = 2;\n')
      }
      return open(file, flags, ...args)
    })
    let result
    try { result = f.check(stage) } finally { mock.mock.restore() }
    assert.equal(reads, 2, stage)
    assert.equal(result.evidence.checks[0].status, 'stale', stage)
    assert.deepEqual(result.evidence.verification.reuse, ['unchanged'], stage)
    assert.deepEqual(result.evidence.verification.run, ['changed'], stage)
    if (stage === 'review') assert.equal(result.next, undefined, 'a stale check cannot finish a handoff')
  }
})

test('a new directory input during evidence checking invalidates only its check', t => {
  const f = fixture(false)
  const src = 'tests/existing.test.cjs'
  const added = path.join(f.root, 'tests/added.test.cjs')
  const stable = 'server.cjs'
  fs.mkdirSync(path.dirname(added))
  for (const name of [src, stable]) fs.writeFileSync(path.join(f.root, name), 'const value = 1;\n')
  f.record.verification = [
    { id: 'suite', command: 'node --test tests/*.test.cjs', paths: ['tests/'] },
    { id: 'syntax', command: 'node --check ' + stable, paths: [stable] },
  ]
  f.persist()
  const before = f.check('review').evidence
  const receipt = path.join(f.root, before.path)
  fs.mkdirSync(path.dirname(receipt), { recursive: true })
  fs.writeFileSync(receipt, JSON.stringify({
    id: f.record.id, binding: before.binding, verificationBasis: before.verification.basis,
    checks: f.record.verification.map(({ id, command }, index) => ({
      id, command, exitCode: 0, node: process.version, platform: process.platform, arch: process.arch,
      inputs: [checkInput(f.root, index ? stable : src)],
    })),
  }))
  assert.match(f.check('review').next, /For a verification-only handoff/)

  const open = fs.openSync
  const input = path.join(f.root, src)
  const checkDuringAddition = (stage, at) => {
    let reads = 0
    const mock = t.mock.method(fs, 'openSync', (file, flags, ...args) => {
      if (file === input && typeof flags === 'number' && ++reads === at) fs.writeFileSync(added, 'new test\n')
      return open(file, flags, ...args)
    })
    let result
    try { result = f.check(stage) } finally { mock.mock.restore() }
    assert.ok(reads >= at)
    assert.deepEqual(result.evidence.verification.reuse, ['syntax'], stage)
    assert.deepEqual(result.evidence.verification.run, ['suite'], stage)
    assert.match(result.evidence.verification.runReasons.suite, /input set changed/)
    fs.unlinkSync(added)
    return result
  }
  for (const stage of ['build', 'resume', 'review']) {
    const result = checkDuringAddition(stage, 2)
    assert.deepEqual(result.evidence.checks.map(check => check.status), ['stale', 'current'])
    if (stage === 'review') assert.equal(result.next, undefined, 'a late directory entry prevents early completion')
  }

  fs.appendFileSync(f.contract, 'approved unrelated contract change\n')
  f.record.contracts[0].sha256 = hashFile(f.contract).sha256
  f.persist()
  assert.deepEqual(f.check('review').evidence.verification.reuse, ['suite', 'syntax'])
  assert.equal(checkDuringAddition('review', 1).evidence.status, 'stale')
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
