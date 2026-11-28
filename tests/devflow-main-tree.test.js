'use strict'
// Issue #14: the Issue folder (ledger, sessions, lock) lives in the main work tree, whichever worktree a
// session works in. git runs for real here; gh answers from a stub, and nothing reaches GitHub.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const tmpdir = require('./tmpdir')
const { execFile, spawnSync } = require('child_process')
const crypto = require('node:crypto')
const state = require('../bin/devflow-state')

const GITC = ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', '-c', 'user.name=t',
  '-c', 'user.email=t@example.com']
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
const git = (cwd, ...args) => {
  const r = spawnSync('git', [...GITC, ...args], { cwd, encoding: 'utf8', env: cleanEnv })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
const tmp = () => fs.realpathSync.native(tmpdir('dfmt-'))
const ok = stdout => ({ code: 0, stdout, stderr: '' })

// A devflow project whose main work tree is on mainBranch, with a worktree beside it on wtBranch.
function project(mainBranch, wtBranch) {
  const base = tmp()
  const main = path.join(base, 'main')
  fs.mkdirSync(main)
  git(main, 'init', '-q')
  fs.writeFileSync(path.join(main, '.devflow.json'), '{}')
  git(main, 'add', '.devflow.json')
  git(main, 'commit', '-q', '-m', 'a')
  git(main, 'remote', 'add', 'origin', 'https://github.com/o/r.git')
  if (mainBranch !== 'main') git(main, 'switch', '-q', '-c', mainBranch)
  const wt = path.join(base, 'wt')
  git(main, 'worktree', 'add', '-q', '-b', wtBranch, wt)
  return { base, main, wt }
}

test('assigned worktrees share reserved finding attempts without changing approvals or counting a replay', async t => {
  const { main, wt, base } = project('main', 'trial/finding')
  const third = path.join(base, 'third')
  git(main, 'worktree', 'add', '-q', '-b', 'trial/third', third)
  const store = path.join(main, '.work', 'devflow', 'findings', 'example.json')
  fs.mkdirSync(path.dirname(store), { recursive: true })
  fs.writeFileSync(store, JSON.stringify({ id: 'r-17', attempts: [] }))
  const assignments = []
  const repro = ["const fs = require('node:fs')", "const assert = require('node:assert/strict')",
    "if (process.env.FIXTURE_PRIVATE || process.env.NODE_OPTIONS) process.exit(3)",
    "const input = fs.readFileSync('input.txt', 'utf8')",
    "if (input === 'setup-error') fs.readFileSync('missing-fixture.cjs')",
    "if (input === 'interrupted') { fs.writeSync(1, JSON.stringify({ finding: 'r-17', outcome: 'reproduced' })); process.kill(process.pid, 'SIGTERM') }",
    "let outcome = 'passed'", "try { assert.equal(input, 'pass') } catch { outcome = 'reproduced' }",
    "console.log(JSON.stringify({ finding: 'r-17', outcome }))", ''].join('\n')
  for (const root of [wt, third]) {
    const directory = path.join(root, 'docs', 'changes', 'example')
    fs.mkdirSync(directory, { recursive: true })
    const approvals = {}
    for (const kind of ['intent', 'spec', 'plan']) {
      const file = path.join(directory, `${kind}.md`)
      fs.writeFileSync(file, kind + '\n')
      approvals[kind] = { by: 'operator', sha256: state.hashFile(file).sha256 }
    }
    const file = path.join(root, '.work', 'devflow', 'change.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(path.join(root, 'repro.cjs'), repro)
    fs.writeFileSync(path.join(root, 'input.txt'), 'pass')
    const body = JSON.stringify({ root, id: 'example', approvals, contracts: [],
      git: { common: path.join(main, '.git'), branch: git(root, 'branch', '--show-current') },
      verification: [{ id: 'repro', command: 'node repro.cjs', paths: ['repro.cjs', 'input.txt'], environment: ['NODE_ENV'] }],
      finding: { id: 'r-17', shared: true, attempts: [],
        reproduction: { check: 'repro', sha256: state.hashFile(path.join(root, 'repro.cjs')).sha256 } } })
    fs.writeFileSync(file, body)
    assignments.push({ file, body })
  }
  const e = env('trial/finding')
  e.vars = { FIXTURE_PRIVATE: 'synthetic', NODE_OPTIONS: '--invalid-test-option', NODE_ENV: 'test' }
  function call(root, ...args) {
    return JSON.parse(state.main(args, () => assert.fail('No stdin'), e, root).out)
  }
  const write = (root, id, value) => call(root, 'finding-attempt', 'example', id, value)
  const status = root => call(root, 'change-check', 'resume', 'example')
  const executions = () => e.calls.filter(({ cmd }) => cmd === process.execPath).length
  const lock = path.join(path.dirname(store), 'example.lock')
  function changeBeforeLock(file, contents, invoke, reason) {
    const original = fs.readFileSync(file)
    const history = fs.readFileSync(store)
    const before = executions()
    const writeFile = fs.writeFileSync
    let changed = false
    const intercepted = t.mock.method(fs, 'writeFileSync', (name, data, options) => {
      if (!changed && name === lock && options?.flag === 'wx') {
        changed = true
        writeFile(file, contents)
      }
      return writeFile(name, data, options)
    })
    try {
      assert.match(invoke().reason, reason)
      assert.ok(changed, 'the operator change precedes lock acquisition')
      assert.equal(executions(), before)
      assert.deepEqual(fs.readFileSync(store), history)
      assert.equal(fs.readFileSync(file, 'utf8'), contents)
    } finally {
      intercepted.mock.restore()
      writeFile(file, original)
    }
  }
  const contenders = [{ root: wt, id: 'race-one' }, { root: third, id: 'race-two' }]
  const started = await Promise.all(contenders.map(({ root, id }) => new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(__dirname, '../bin/devflow-state'), 'finding-attempt', 'example', id, 'start'],
      { cwd: root, env: { ...cleanEnv, NODE_ENV: 'test' }, timeout: 30000 }, (error, stdout, stderr) => {
        if (error && error.code !== 1) return reject(error)
        try { resolve(JSON.parse(stdout || stderr)) } catch (parseError) { reject(parseError) }
      })
  })))
  assert.deepEqual(started.map(result => result.status).sort(), ['hold', 'reserved'])
  assert.equal(JSON.parse(fs.readFileSync(store, 'utf8')).attempts.length, 1)
  const winner = contenders[started.findIndex(result => result.status === 'reserved')]
  assert.equal(write(winner.root, winner.id, 'check').status, 'recorded')
  assert.equal(status(wt).finding.failedAttempts, 0)
  changeBeforeLock(assignments[0].file, JSON.stringify({ ...JSON.parse(assignments[0].body), audit: { verdict: 'HOLD' } }),
    () => write(wt, 'revoked', 'start'), /document audit HOLD/)
  assert.equal(run(e, wt, ['finding-attempt', 'example', 'one', '1']).code, 2)
  assert.equal(write(wt, 'one', 'check').status, 'hold')
  assert.equal(write(wt, 'one', 'start').status, 'reserved')
  const plan = path.join(wt, 'docs', 'changes', 'example', 'plan.md')
  changeBeforeLock(plan, 'Changed plan\n', () => write(wt, 'one', 'check'), /stale plan approval/)
  changeBeforeLock(assignments[0].file, JSON.stringify({ ...JSON.parse(assignments[0].body), audit: { verdict: 'HOLD' } }),
    () => write(wt, 'one', 'check'), /document audit HOLD/)
  const assignment = assignments[0]
  const held = JSON.stringify({ ...JSON.parse(assignment.body), audit: { verdict: 'HOLD' } })
  const historyBeforeHash = fs.readFileSync(store)
  const executionsBeforeHash = executions()
  const openFile = fs.openSync
  let revokedWhileHashing = false
  const hashing = t.mock.method(fs, 'openSync', (file, ...args) => {
    if (!revokedWhileHashing && file === path.join(wt, 'input.txt') && fs.existsSync(lock)) {
      revokedWhileHashing = true
      fs.writeFileSync(assignment.file, held)
    }
    return openFile(file, ...args)
  })
  try {
    assert.match(write(wt, 'one', 'check').reason, /document audit HOLD/)
    assert.ok(revokedWhileHashing)
    assert.equal(executions(), executionsBeforeHash)
    assert.deepEqual(fs.readFileSync(store), historyBeforeHash)
    assert.equal(fs.readFileSync(assignment.file, 'utf8'), held)
  } finally {
    hashing.mock.restore()
    fs.writeFileSync(assignment.file, assignment.body)
  }
  assert.equal(write(third, 'one', 'start').status, 'already-pending')
  assert.equal(write(third, 'different', 'start').status, 'hold')
  assert.deepEqual(status(third).finding.pending, ['one'])
  assert.match(write(third, 'one', 'check').reason, /original worktree/)
  // Matching the branch name alone does not let a different worktree settle the reservation.
  git(third, 'symbolic-ref', 'HEAD', 'refs/heads/trial/finding')
  fs.writeFileSync(assignments[1].file, JSON.stringify({ ...JSON.parse(assignments[1].body),
    git: { common: path.join(main, '.git'), branch: 'trial/finding' } }))
  assert.match(write(third, 'one', 'check').reason, /original worktree/)
  git(third, 'symbolic-ref', 'HEAD', 'refs/heads/trial/third')
  fs.writeFileSync(assignments[1].file, assignments[1].body)
  const pending = fs.readFileSync(store, 'utf8')
  const alternate = JSON.parse(assignments[0].body)
  alternate.verification[0].environment = ['LANG']
  fs.writeFileSync(assignments[0].file, JSON.stringify(alternate))
  assert.match(write(wt, 'one', 'check').reason, /reproduction policy changed/)
  fs.writeFileSync(assignments[0].file, assignments[0].body)
  const beforeMismatch = executions()
  e.vars.NODE_ENV = 'changed'
  assert.match(write(wt, 'one', 'check').reason, /reproduction environment changed/)
  assert.equal(executions(), beforeMismatch)
  assert.equal(fs.readFileSync(store, 'utf8'), pending)
  e.vars.NODE_ENV = 'test'
  fs.writeFileSync(path.join(wt, 'input.txt'), 'setup-error')
  assert.match(write(wt, 'one', 'check').reason, /did not establish/)
  assert.equal(status(third).finding.failedAttempts, 0)
  const unresolved = status(wt).finding.executions.one
  const previousBytes = fs.readFileSync(store, 'utf8')
  const beforeRetry = executions()
  assert.match(write(wt, 'one', 'check').reason, /execution must be reconciled/)
  assert.equal(executions(), beforeRetry)
  assert.equal(fs.readFileSync(store, 'utf8'), previousBytes)

  const fingerprint = root => crypto.createHash('sha256').update(process.platform === 'win32' ? root.toLowerCase() : root).digest('hex')
  const retry = JSON.parse(assignments[0].body)
  retry.finding.recovery = { attempt: 'one', fromWorktree: fingerprint(wt), toWorktree: fingerprint(wt),
    action: 'retry', execution: 'b'.repeat(16), by: 'operator', reason: 'process tree and file effects checked' }
  fs.writeFileSync(assignments[0].file, JSON.stringify(retry))
  assert.match(write(wt, 'one', 'recover').reason, /operator finding recovery/)
  retry.finding.recovery.execution = unresolved
  fs.writeFileSync(assignments[0].file, JSON.stringify(retry))
  changeBeforeLock(assignments[0].file, assignments[0].body, () => write(wt, 'one', 'recover'),
    /operator assignment changed while waiting/)
  assert.equal(write(wt, 'one', 'recover').status, 'recovered')
  fs.writeFileSync(path.join(wt, 'input.txt'), 'interrupted')
  const interrupted = spawnSync(process.execPath, [path.join(__dirname, '../bin/devflow-state'),
    'finding-attempt', 'example', 'one', 'check'], { cwd: wt, env: { ...cleanEnv, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 10000 })
  assert.equal(interrupted.status, 1)
  assert.match(JSON.parse(interrupted.stderr).reason, /did not establish/)
  const interruptedExecution = status(wt).finding.executions.one
  assert.notEqual(interruptedExecution, unresolved)
  assert.equal(write(wt, 'one', 'recover').status, 'already-recovered')
  assert.equal(status(wt).finding.executions.one, interruptedExecution)

  const moved = path.join(base, 'moved')
  git(main, 'worktree', 'move', wt, moved)
  const movedRecord = JSON.parse(assignments[0].body)
  movedRecord.root = moved
  const movedFile = path.join(moved, '.work', 'devflow', 'change.json')
  fs.writeFileSync(movedFile, JSON.stringify(movedRecord))
  assert.match(write(moved, 'one', 'check').reason, /original worktree/)
  assert.match(write(moved, 'one', 'recover').reason, /operator finding recovery/)
  movedRecord.finding.recovery = { attempt: 'one', fromWorktree: fingerprint(wt), toWorktree: fingerprint(third),
    action: 'rebind', execution: interruptedExecution, by: 'operator', reason: 'previous process and partial changes checked' }
  fs.writeFileSync(movedFile, JSON.stringify(movedRecord))
  assert.match(write(moved, 'one', 'recover').reason, /operator finding recovery/)
  movedRecord.finding.recovery.toWorktree = fingerprint(moved)
  const approvedMoved = JSON.stringify(movedRecord)
  fs.writeFileSync(movedFile, approvedMoved)
  assert.equal(write(moved, 'one', 'recover').status, 'recovered')
  assert.equal(write(moved, 'one', 'recover').status, 'already-recovered')
  fs.writeFileSync(path.join(moved, 'input.txt'), 'fail')
  assert.equal(write(moved, 'one', 'check').status, 'recorded')
  const saved = fs.readFileSync(store, 'utf8')
  assert.equal(write(third, 'one', 'check').status, 'already-recorded')
  assert.equal(run(e, third, ['finding-attempt', 'example', 'one', '0']).code, 2)
  assert.equal(fs.readFileSync(store, 'utf8'), saved)
  assert.equal(status(third).finding.failedAttempts, 1)
  const recorded = JSON.parse(saved).attempts.find(attempt => attempt.id === 'one')
  assert.equal(recorded.proof.environmentSha256, recorded.environmentSha256)
  assert.match(recorded.environmentSha256, /^[0-9a-f]{64}$/)
  e.vars.NODE_ENV = 'changed'
  assert.match(write(third, 'different-environment', 'start').reason, /reproduction environment changed/)
  assert.equal(fs.readFileSync(store, 'utf8'), saved)
  e.vars.NODE_ENV = 'test'
  assert.equal(write(third, 'cancelled', 'start').status, 'reserved')
  const abandon = JSON.parse(assignments[1].body)
  abandon.finding.recovery = { attempt: 'cancelled', fromWorktree: fingerprint(third), toWorktree: fingerprint(third),
    action: 'abandon', by: 'operator', reason: 'no check ran and partial effects reconciled' }
  fs.writeFileSync(assignments[1].file, JSON.stringify(abandon))
  assert.equal(write(third, 'cancelled', 'recover').status, 'abandoned')
  assert.equal(write(third, 'cancelled', 'start').status, 'already-abandoned')
  assert.deepEqual(status(moved).finding, { id: 'r-17', failedAttempts: 1, pending: [] })
  fs.writeFileSync(assignments[1].file, assignments[1].body)
  assert.equal(write(third, 'two', 'start').status, 'reserved')
  fs.writeFileSync(path.join(third, 'input.txt'), 'fail')
  assert.equal(write(third, 'two', 'check').finding.failedAttempts, 2)
  assert.equal(status(moved).buildStatus, 'hold')
  assert.equal(write(moved, 'three', 'start').status, 'hold')
  assert.equal(fs.readFileSync(movedFile, 'utf8'), approvedMoved)
  assert.equal(fs.readFileSync(assignments[1].file, 'utf8'), assignments[1].body)
  const valid = fs.readFileSync(store, 'utf8')
  const legacy = JSON.parse(valid)
  delete legacy.attempts[0].proof
  fs.writeFileSync(store, JSON.stringify(legacy))
  assert.match(status(moved).buildReason, /unverified/)
  const invalid = JSON.parse(valid)
  invalid.attempts.push(invalid.attempts[0])
  fs.writeFileSync(store, JSON.stringify(invalid))
  assert.match(status(moved).buildReason, /unsafe shared finding history/)
  fs.unlinkSync(store)
  assert.match(status(third).buildReason, /unsafe shared finding history/)
  assert.equal(write(moved, 'three', 'start').status, 'hold')
  assert.equal(fs.existsSync(store), false)
})

const block = branch => ['## 현재 상태', '', '- 단계: build', `- 브랜치/PR: ${branch}`].join('\n')
function env(branch) {
  const calls = []
  const issue = { number: 14, title: 'T', state: 'OPEN', url: 'https://github.com/o/r/issues/14', authorAssociation: 'OWNER',
    body: `## 문제\nx\n\n## 수용 기준\n- [ ] a\n\n${block(branch)}\n`, comments: { nodes: [] } }
  return {
    calls,
    vars: {},
    run(cmd, args, opts = {}) {
      calls.push({ cmd, args })
      // Real git, without the GIT_* variables a pre-push gate exports, which would point it at this repository.
      if (cmd === 'git') {
        const r = spawnSync('git', args, { cwd: opts.cwd, encoding: 'utf8', env: cleanEnv, timeout: 10000 })
        return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
      }
      if (cmd === process.execPath) {
        const r = spawnSync(cmd, args, { cwd: opts.cwd, env: opts.env, encoding: 'utf8', timeout: 10000 })
        return { code: r.status ?? r.error?.code, stdout: r.stdout || '', stderr: r.stderr || '' }
      }
      if (cmd === 'gh' && args[0] === 'api') return ok(JSON.stringify({ data: { repository: { issue } } }))
      if (cmd === 'gh') return ok('https://github.com/o/r/issues/14#issuecomment-9\n')
      return { code: 127, stdout: '', stderr: '' }
    },
  }
}
const run = (e, cwd, argv, input = '') => state.main(argv, () => input, e, cwd)
const ledgerIn = (root, n) => path.join(root, '.work', 'devflow', `i${n}`, 'ledger.json')
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'))

test('a worktree session writes the main tree ledger, and it outlives the worktree', () => {
  const { main, wt } = project('feat/14-x', 'fix/14-wt')
  const e = env('fix/14-wt')
  assert.equal(run(e, wt, ['ledger-update', '14'], '{"stage":"build"}').code, 0)
  assert.deepEqual(run(e, wt, ['note', '14'], 'from the worktree'), { code: 0, out: 'notes 1' })
  assert.equal(fs.existsSync(ledgerIn(wt, 14)), false, 'nothing is written in the worktree')
  assert.deepEqual(readJson(ledgerIn(main, 14)), { stage: 'build', notes: ['from the worktree'] })
  // The main tree session sees the same ledger.
  assert.deepEqual(run(env('feat/14-x'), main, ['note', '14'], 'from main'), { code: 0, out: 'notes 2' })
  git(main, 'worktree', 'remove', wt)
  assert.deepEqual(readJson(ledgerIn(main, 14)).notes, ['from the worktree', 'from main'])
})

// Linked worktrees use their own Issue branch; isolation worktrees leave writes to the main session.
test('a worktree on a branch that is no Issue branch writes no Issue ledger, the main tree one included', () => {
  const { main, wt } = project('feat/14-x', 'task-1')
  const e = env('task-1')
  assert.equal(run(env('feat/14-x'), main, ['ledger-update', '14'], '{"stage":"build"}').code, 0)
  fs.mkdirSync(path.dirname(ledgerIn(main, 7)), { recursive: true })
  fs.writeFileSync(ledgerIn(main, 7), '{}')
  for (const argv of [['note', '14'], ['note', '7'], ['ledger-update', '7']]) {
    const r = run(e, wt, argv, argv[0] === 'note' ? 'x' : '{"x":1}')
    assert.equal(r.code, 1, argv.join(' '))
    assert.match(r.out, /need an Issue branch here/)
  }
  assert.deepEqual(readJson(ledgerIn(main, 14)), { stage: 'build' })
  assert.deepEqual(readJson(ledgerIn(main, 7)), {})
})

test('a worktree with no Issue here or in the main tree writes no ledger', () => {
  const { main, wt } = project('main', 'task-1')
  fs.mkdirSync(path.dirname(ledgerIn(main, 7)), { recursive: true })
  fs.writeFileSync(ledgerIn(main, 7), '{}')
  for (const argv of [['note', '7'], ['ledger-update', '7']]) {
    const r = run(env('task-1'), wt, argv, argv[0] === 'ledger-update' ? '{"x":1}' : 'x')
    assert.equal(r.code, 1, argv.join(' '))
  }
  assert.deepEqual(readJson(ledgerIn(main, 7)), {})
  // The main work tree on main still records cleanup, as #12 decided.
  assert.equal(run(env('main'), main, ['note', '7'], 'cleanup').code, 0)
})

test('a ledger left in a worktree is warned about and blocks every write until it is moved', () => {
  const { main, wt } = project('feat/14-x', 'fix/14-wt')
  fs.mkdirSync(path.dirname(ledgerIn(wt, 14)), { recursive: true })
  fs.writeFileSync(ledgerIn(wt, 14), JSON.stringify({ stage: 'build', mode: 'autonomous' }))
  const e = env('fix/14-wt')
  assert.match(state.card(e, wt), /Warning: Issue #14's ledger is in this worktree \(\.work\/devflow\/i14\); move it into the main work tree's \.work\/devflow\//)
  for (const argv of [['note', '14'], ['ledger-update', '14'], ['comment', '14'], ['release', '14']]) {
    const input = argv[0] === 'ledger-update' ? '{"x":1}' : argv[0] === 'comment' ? '### Checkpoint build — x\n- a' : 'x'
    const r = run(e, wt, argv, input)
    assert.equal(r.code, 1, argv.join(' '))
    assert.match(r.out, /ledger is in this worktree/, argv.join(' '))
  }
  assert.equal(e.calls.filter(c => c.cmd === 'gh' && c.args[0] === 'issue').length, 0, 'nothing was posted')
  assert.equal(fs.existsSync(path.join(main, '.work', 'devflow', 'i14')), false, 'the main tree folder is not created')
  // In the main tree, with the main ledger, there is nothing to warn about.
  fs.mkdirSync(path.dirname(ledgerIn(main, 14)), { recursive: true })
  fs.writeFileSync(ledgerIn(main, 14), '{}')
  assert.doesNotMatch(state.card(env('feat/14-x'), main), /ledger is in this worktree/)
  // Once moved away from the worktree, writes go on.
  fs.rmSync(path.join(wt, '.work'), { recursive: true })
  assert.equal(run(e, wt, ['note', '14'], 'moved').code, 0)
})

test('a separate git dir keeps the ledger where the work tree is', () => {
  const base = tmp()
  git(base, 'init', '-q', '--separate-git-dir', path.join(base, 'gd'), 'wt')
  const wt = path.join(base, 'wt')
  fs.writeFileSync(path.join(wt, '.devflow.json'), '{}')
  assert.equal(path.resolve(state.repoContext(env('main'), wt).store), wt)
  // Writes go on there, with no worktree warning: the work tree in hand is the store.
  assert.equal(run(env('main'), wt, ['ledger-update', '3'], '{"stage":"start"}').code, 0)
  assert.equal(run(env('main'), wt, ['note', '3'], 'separate git dir').code, 0)
  assert.deepEqual(readJson(ledgerIn(wt, 3)).notes, ['separate git dir'])
})

test('a .git file that only claims a repository does not make it the store (#14 security review)', () => {
  const { main: victim } = project('feat/7-x', 'fix/7-wt')
  fs.mkdirSync(path.dirname(ledgerIn(victim, 7)), { recursive: true })
  fs.writeFileSync(ledgerIn(victim, 7), '{"mode":"interactive"}')
  // An extracted archive: its own gitdir, pointed at the victim's common dir, with a back link to itself.
  const x = tmp()
  fs.writeFileSync(path.join(x, '.devflow.json'), '{}')
  fs.mkdirSync(path.join(x, 'wt'))
  fs.writeFileSync(path.join(x, '.git'), 'gitdir: wt\n')
  fs.writeFileSync(path.join(x, 'wt', 'commondir'), path.join(victim, '.git') + '\n')
  fs.writeFileSync(path.join(x, 'wt', 'gitdir'), '../.git\n')
  fs.writeFileSync(path.join(x, 'wt', 'HEAD'), 'ref: refs/heads/feat/7-y\n')
  const ctx = state.repoContext(env('feat/7-y'), x)
  assert.equal(ctx.linked, false)
  assert.equal(path.resolve(ctx.store), x)
  run(env('feat/7-y'), x, ['ledger-update', '7'], '{"mode":"autonomous","pendingPosts":[1]}')
  assert.deepEqual(readJson(ledgerIn(victim, 7)), { mode: 'interactive' }, 'the victim ledger is untouched')
  // Pointed at the victim's real worktree gitdir: git follows it, but the back link there names that worktree.
  const y = tmp()
  fs.writeFileSync(path.join(y, '.devflow.json'), '{}')
  fs.writeFileSync(path.join(y, '.git'), `gitdir: ${path.join(victim, '.git', 'worktrees', 'wt')}\n`)
  assert.equal(state.repoContext(env('fix/7-wt'), y).linked, false)
  run(env('fix/7-wt'), y, ['ledger-update', '7'], '{"mode":"autonomous"}')
  assert.deepEqual(readJson(ledgerIn(victim, 7)), { mode: 'interactive' }, 'still untouched')
})

test('the main tree stays the store while it has a commit without .devflow.json checked out', () => {
  const { main, wt } = project('feat/14-x', 'fix/14-wt')
  git(main, 'switch', '-q', '--orphan', 'bare-history')
  fs.rmSync(path.join(main, '.devflow.json'), { force: true })
  assert.equal(path.resolve(state.repoContext(env('fix/14-wt'), wt).store), main)
})

test('with a ledger in both trees the worktree copy is not warned about, and writes go to the main tree', () => {
  const { main, wt } = project('feat/14-x', 'fix/14-wt')
  for (const root of [main, wt]) {
    fs.mkdirSync(path.dirname(ledgerIn(root, 14)), { recursive: true })
    fs.writeFileSync(ledgerIn(root, 14), JSON.stringify({ where: root === main ? 'main' : 'wt' }))
  }
  const e = env('fix/14-wt')
  assert.doesNotMatch(state.card(e, wt), /ledger is in this worktree/)
  assert.equal(run(e, wt, ['note', '14'], 'x').code, 0)
  assert.deepEqual(readJson(ledgerIn(main, 14)), { where: 'main', notes: ['x'] })
  assert.deepEqual(readJson(ledgerIn(wt, 14)), { where: 'wt' })
})

const posts = e => e.calls.filter(c => c.cmd === 'gh' && c.args[0] === 'issue').length

test('a remark from an Issue-branch worktree follows the main tree ledger of that Issue (#77)', () => {
  const { main, wt } = project('main', 'fix/14-wt')
  fs.mkdirSync(path.dirname(ledgerIn(main, 14)), { recursive: true })
  fs.writeFileSync(ledgerIn(main, 14), JSON.stringify({ mode: 'autonomous' }))
  let e = env('fix/14-wt')
  let r = run(e, wt, ['remark', '14'], '의견')
  assert.equal(r.code, 1)
  assert.match(r.out, /Issue #14's ledger is autonomous; keep the content in ledger notes for the user/)
  assert.equal(posts(e), 0)
  fs.writeFileSync(ledgerIn(main, 14), JSON.stringify({ mode: 'interactive' }))
  e = env('fix/14-wt')
  r = run(e, wt, ['remark', '14'], '의견')
  assert.equal(r.code, 0, r.out)
  assert.deepEqual(readJson(ledgerIn(main, 14)), { mode: 'interactive' })
})

test('a task worktree and a detached worktree post no remark (#77 security review)', () => {
  const { main, wt } = project('feat/14-x', 'task-1')
  fs.mkdirSync(path.dirname(ledgerIn(main, 14)), { recursive: true })
  fs.writeFileSync(ledgerIn(main, 14), JSON.stringify({ mode: 'interactive' }))
  let e = env('task-1')
  assert.match(run(e, wt, ['remark', '14'], '의견').out, /a task worktree posts no Issue text/)
  assert.equal(posts(e), 0)
  git(wt, 'switch', '-q', '--detach')
  e = env('task-1')
  assert.match(run(e, wt, ['remark', '14'], '의견').out, /not a detached HEAD/)
  assert.equal(posts(e), 0)
})

test('a remark from a worktree holding the old ledger is refused until it is moved (#77 security review)', () => {
  const { wt } = project('main', 'fix/14-wt')
  fs.mkdirSync(path.dirname(ledgerIn(wt, 14)), { recursive: true })
  fs.writeFileSync(ledgerIn(wt, 14), JSON.stringify({ mode: 'autonomous' }))
  const e = env('fix/14-wt')
  const r = run(e, wt, ['remark', '7'], '의견')
  assert.equal(r.code, 1)
  assert.match(r.out, /refused: /)
  assert.equal(posts(e), 0)
})

test('Issue writes from a task worktree stay refused: only the branch Issue is written', () => {
  const { main, wt } = project('feat/14-x', 'task-1')
  const e = env('task-1')
  const r = run(e, wt, ['comment', '14'], '### Checkpoint build — x\n- a')
  assert.equal(r.code, 1)
  assert.match(r.out, /writes go only to the branch's Issue #\?/)
  assert.equal(e.calls.filter(c => c.cmd === 'gh' && c.args[0] === 'issue').length, 0)
  assert.ok(main)
})

test('a FIFO in a worktree git dir cannot hold mainTree open (#43)', { skip: process.platform === 'win32' }, () => {
  const { wt } = project('feat/43-x', 'fix/43-wt')
  // git keeps the worktree's back link in <common>/worktrees/<name>/gitdir; git itself does not read it here.
  const own = git(wt, 'rev-parse', '--path-format=absolute', '--git-dir')
  fs.rmSync(path.join(own, 'gitdir'))
  assert.equal(spawnSync('mkfifo', [path.join(own, 'gitdir')]).status, 0)
  const r = spawnSync(process.execPath, ['-e', 'const s = require(process.argv[1]); console.log(JSON.stringify(s.mainTree(s.realEnv, process.argv[2])))',
    path.resolve(__dirname, '../bin/devflow-state'), wt], { encoding: 'utf8', env: cleanEnv, timeout: 8000 })
  assert.equal(r.signal, null, 'mainTree did not return before the timeout')
  assert.equal(r.stdout.trim(), 'null')
})

test('N2 A10: with the legacy-ledger warning, a Tool too long for any card ends in the terminal error that keeps the warning', () => {
  const { wt } = project('feat/14-x', 'fix/14-wt')
  fs.mkdirSync(path.dirname(ledgerIn(wt, 14)), { recursive: true })
  fs.writeFileSync(ledgerIn(wt, 14), JSON.stringify({ stage: 'build' }))
  const e = env('fix/14-wt')
  e.tool = `plugin/${'가'.repeat(990)}`
  const out = state.card(e, wt)
  assert.match(out, /Warning: Issue #14's ledger is in this worktree/)
  assert.match(out, /resume card unavailable/)
  assert.equal(out.split('\n').filter(l => l.startsWith('Tool:')).length, 0)
  assert.ok(state.estTokens(out) < 1000, `card is ${state.estTokens(out)} tokens`)
})
