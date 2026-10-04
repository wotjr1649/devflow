'use strict'
// Issue #14: the Issue folder (ledger, guard log, sessions, lock) lives in the main work tree, whichever worktree a
// session works in. git runs for real here; gh answers from a stub, and nothing reaches GitHub.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const tmpdir = require('./tmpdir')
const { spawnSync } = require('child_process')
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

test('a worktree on a branch that is no Issue branch speaks for the main tree Issue only', () => {
  const { main, wt } = project('feat/14-x', 'task-1')
  const e = env('task-1')
  assert.equal(run(env('feat/14-x'), main, ['ledger-update', '14'], '{"stage":"build"}').code, 0)
  fs.mkdirSync(path.dirname(ledgerIn(main, 7)), { recursive: true })
  fs.writeFileSync(ledgerIn(main, 7), '{}')
  assert.deepEqual(run(e, wt, ['note', '14'], 'task worktree'), { code: 0, out: 'notes 1' })
  for (const argv of [['note', '7'], ['ledger-update', '7']]) {
    const r = run(e, wt, argv, argv[0] === 'note' ? 'x' : '{"x":1}')
    assert.equal(r.code, 1, argv.join(' '))
    assert.match(r.out, /only to the branch's Issue #14/)
  }
  assert.deepEqual(readJson(ledgerIn(main, 7)), {})
})

test('a worktree with no Issue here or in the main tree writes no ledger', () => {
  const { main, wt } = project('main', 'task-1')
  fs.mkdirSync(path.dirname(ledgerIn(main, 7)), { recursive: true })
  fs.writeFileSync(ledgerIn(main, 7), '{}')
  for (const argv of [['note', '7'], ['metric', '7', 'interventions'], ['ledger-update', '7']]) {
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
  for (const argv of [['note', '14'], ['metric', '14', 'interventions'], ['ledger-update', '14'], ['comment', '14'], ['release', '14']]) {
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
