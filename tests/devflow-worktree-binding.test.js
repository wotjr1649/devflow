'use strict'
// Issue #73 G1: a linked worktree that is not on an Issue branch no longer works for the main work tree's Issue. Only
// an explicit M3 delegation shares the parent Issue: a record the main session leaves before launching, the same
// session, and an agent worktree git proves. A task worktree never writes the ledger or the Issue, and one whose
// delegation cannot be confirmed counts as locked. git runs for real; gh answers from a stub; nothing reaches GitHub.
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const tmpdir = require('./tmpdir')
const { spawnSync } = require('child_process')
const state = require('../bin/devflow-state')
const hook = require('../hooks/devflow-hook')
const { doctor } = require('../bin/devflow-doctor')

// The session decides a delegation, so none may leak in from the shell that runs the tests.
for (const k of ['DEVFLOW_SESSION_ID', 'CLAUDE_CODE_SESSION_ID', 'CODEX_THREAD_ID']) delete process.env[k]

const GITC = ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', '-c', 'user.name=t',
  '-c', 'user.email=t@example.com', '-c', 'core.autocrlf=false']
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
const git = (cwd, ...args) => {
  const r = spawnSync('git', [...GITC, ...args], { cwd, encoding: 'utf8', env: cleanEnv })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
const hashOf = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12)

// A devflow project with tests/** locked by profile, its main work tree on mainBranch.
function project(mainBranch = 'main') {
  const base = fs.realpathSync.native(tmpdir('dfwb-'))
  const main = path.join(base, 'main')
  fs.mkdirSync(path.join(main, 'tests'), { recursive: true })
  git(main, 'init', '-q')
  fs.writeFileSync(path.join(main, '.devflow.json'), '{ "tests": ["tests/**"] }\n')
  fs.writeFileSync(path.join(main, 'tests', 'a.test.js'), 'ok\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'a')
  git(main, 'remote', 'add', 'origin', 'https://github.com/o/r.git')
  if (mainBranch !== 'main') git(main, 'switch', '-q', '-c', mainBranch)
  return { base, main, at: git(main, 'rev-parse', '--short', 'HEAD') }
}
const worktree = (p, where, branch) => { git(p.main, 'worktree', 'add', '-q', '-b', branch, where); return where }
// Where Claude Code puts an Agent call's isolation worktree, and the branch it gives it (2.1.310).
const agent = (p, name = 'agent-a1', branch = `worktree-${name}`) => worktree(p, path.join(p.main, '.claude', 'worktrees', name), branch)
const plain = (p, branch = 'task-1') => worktree(p, path.join(p.base, `wt-${branch.replace(/\W/g, '-')}`), branch)

const folder = (root, n) => path.join(root, '.work', 'devflow', `i${n}`)
const put = (root, n, file, value) => {
  fs.mkdirSync(folder(root, n), { recursive: true })
  fs.writeFileSync(path.join(folder(root, n), file), typeof value === 'string' ? value : JSON.stringify(value))
}
const ledger = (root, n, value) => put(root, n, 'ledger.json', value)
const delegate = (root, n, session, label = 't1') =>
  put(root, n, 'delegates.json', { [label]: { session: hashOf(session), host: 'claude', at: '2026-10-24T00:00:00.000Z' } })
const read = (root, n, file) => { const f = path.join(folder(root, n), file); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null }
const snapshot = (root, n) => ['ledger.json', 'sessions.json', 'guard-events.jsonl', 'delegates.json'].map(f => read(root, n, f))
const guards = (root, n) => (read(root, n, 'guard-events.jsonl') || '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).guard)

const block = branch => ['## 현재 상태', '', '- 단계: build', `- 브랜치/PR: ${branch}`].join('\n')
const BODY = '## 문제\nx\n\n## 수용 기준\n- [ ] a\n'
// gh answers every lookup with an Issue whose state names branch; a post answers with a URL.
function env(branch, session) {
  const calls = []
  return {
    calls,
    vars: session ? { DEVFLOW_SESSION_ID: session } : {},
    run(cmd, args, opts = {}) {
      calls.push({ cmd, args })
      if (cmd === 'git') {
        const r = spawnSync('git', args, { cwd: opts.cwd, encoding: 'utf8', env: cleanEnv, timeout: 10000 })
        return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
      }
      if (cmd === 'gh' && args[0] === 'api') {
        const n = Number((args.find(a => /^n=\d+$/.test(a)) || 'n=7').slice(2))
        const issue = { number: n, title: 'T', state: 'OPEN', url: `https://github.com/o/r/issues/${n}`, authorAssociation: 'OWNER',
          body: `${BODY}\n${block(branch)}\n`, comments: { nodes: [] } }
        return { code: 0, stdout: JSON.stringify({ data: { repository: { issue } } }), stderr: '' }
      }
      if (cmd === 'gh') return { code: 0, stdout: 'https://github.com/o/r/issues/9\n', stderr: '' }
      return { code: 127, stdout: '', stderr: '' }
    },
  }
}
const run = (e, cwd, argv, input = '') => state.main(argv, () => input, e, cwd)
const posts = e => e.calls.filter(c => c.cmd === 'gh' && c.args[0] === 'issue').length

const pre = (cwd, toolInput, { tool = 'Edit', session } = {}) => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool,
  tool_input: toolInput, cwd, ...(session ? { session_id: session } : {}) })
const editTest = (cwd, opts) => hook.handle(pre(cwd, { file_path: path.join(cwd, 'tests', 'a.test.js') }, opts))
const decision = out => (out ? JSON.parse(out).hookSpecificOutput.permissionDecision : 'allow')
const reason = out => JSON.parse(out).hookSpecificOutput.permissionDecisionReason
const lockTests = (p, n) => ledger(p.main, n, { stage: 'build', testsLocked: { at: p.at } })
const testFails = root => doctor(root).lines.filter(l => l.startsWith('FAIL tests'))

test('R1: an independent worktree changes nothing of the main work tree Issue', () => {
  const p = project('feat/14-x')
  const wt = plain(p)
  const fresh = () => ledger(p.main, 14, { stage: 'build', mode: 'interactive', testsLocked: { at: p.at },
    pendingPosts: [{ id: 'p1', op: 'comment', issue: 14, text: 'x', at: '2026-10-24T00:00:00.000Z' }] })
  const cases = [[['note', '14'], 'x'], [['ledger-update', '14'], '{"x":1}'], [['mode', '14', 'autonomous'], 'away'],
    [['pending', 'drop', '14', 'p1'], 'stale'], [['tests', '14', 'unlock'], 'wrong test']]
  for (const [argv, input] of cases) {
    fresh()
    const before = snapshot(p.main, 14)
    const r = run(env('feat/14-x', 'S'), wt, argv, input)
    assert.equal(r.code, 1, argv.join(' '))
    assert.match(r.out, /^refused: /, argv.join(' '))
    assert.deepEqual(snapshot(p.main, 14), before, argv.join(' '))
  }
})

test('R2: create from an independent worktree is refused while the main work tree Issue runs unattended, and queues nowhere', () => {
  const p = project('feat/14-x')
  const wt = plain(p)
  ledger(p.main, 14, { stage: 'build', mode: 'autonomous', modeChanged: { to: 'autonomous', at: '2026-10-24T00:00:00.000Z', session: hashOf('T') } })
  const before = snapshot(p.main, 14)
  const e = env('없음', 'S')
  const r = run(e, wt, ['create', '--title', 'new'], BODY)
  assert.equal(r.code, 1)
  assert.match(r.out, /runs unattended/)
  assert.match(r.out, /mode 14 interactive/)
  assert.equal(posts(e), 0)
  assert.deepEqual(snapshot(p.main, 14), before)
})

test('R3: an independent worktree takes neither the main work tree Issue test lock nor its guard log', () => {
  const p = project('feat/14-x')
  const wt = plain(p)
  lockTests(p, 14)
  assert.equal(decision(editTest(wt, { session: 'S' })), 'allow')
  assert.equal(read(p.main, 14, 'guard-events.jsonl'), null)
})

test('R5: a recorded delegation follows its parent Issue, wherever the parent session works', () => {
  const p = project('main')
  plain(p, 'feat/7-parent')
  const child = agent(p)
  lockTests(p, 7)
  delegate(p.main, 7, 'S')
  const out = editTest(child, { session: 'S' })
  assert.equal(decision(out), 'deny')
  assert.match(reason(out), /tests\/a\.test\.js is a test file, locked/)
  assert.deepEqual(guards(p.main, 7), ['test-locked'])
})

test('R6: an agent worktree with no delegation counts as locked, posts nothing and fails doctor', () => {
  const p = project('main')
  const child = agent(p)
  const out = editTest(child, { session: 'S' })
  assert.equal(decision(out), 'deny')
  assert.match(reason(out), /no confirmed delegation/)
  assert.match(reason(out), /running <issue> add <label> --worktree/)
  const e = env('없음', 'S')
  const r = run(e, child, ['create', '--title', 'new'], BODY)
  assert.equal(r.code, 1)
  assert.match(r.out, /task worktree/)
  assert.equal(posts(e), 0)
  assert.match(testFails(child).join('\n'), /^FAIL tests: .*no confirmed delegation/)
})

test('R6b: a delegation taken out while its agent still works leaves the agent locked, not independent', () => {
  const p = project('main')
  const child = agent(p)
  lockTests(p, 7)
  delegate(p.main, 7, 'S')
  assert.equal(decision(editTest(child, { session: 'S' })), 'deny')
  fs.rmSync(path.join(folder(p.main, 7), 'delegates.json'))
  const out = editTest(child, { session: 'S' })
  assert.equal(decision(out), 'deny')
  assert.match(reason(out), /no confirmed delegation/)
  const e = env('없음', 'S')
  assert.equal(run(e, child, ['create', '--title', 'new'], BODY).code, 1)
  assert.equal(posts(e), 0)
})

test('R7: a bound task worktree writes neither its parent ledger nor the Issue', () => {
  const p = project('feat/7-x')
  const child = agent(p)
  const cases = [[['create', '--title', 'new'], BODY], [['note', '7'], 'x'], [['tests', '7', 'unlock'], 'wrong test'],
    [['ledger-update'], '{"x":1}'], [['mode', '7', 'autonomous'], 'away'], [['pending', 'drop', '7', 'p1'], 'stale'],
    [['release', '7'], '']]
  for (const [argv, input] of cases) {
    ledger(p.main, 7, { stage: 'build', mode: 'interactive', testsLocked: { at: p.at },
      pendingPosts: [{ id: 'p1', op: 'comment', issue: 7, text: 'x', at: '2026-10-24T00:00:00.000Z' }] })
    put(p.main, 7, 'sessions.json', { [hashOf('S')]: { host: 'claude', at: Date.now() } })
    delegate(p.main, 7, 'S')
    const before = snapshot(p.main, 7)
    const e = env('feat/7-x', 'S')
    const r = run(e, child, argv, input)
    assert.equal(r.code, 1, argv.join(' '))
    assert.match(r.out, /^refused: .*task worktree/, argv.join(' '))
    assert.equal(posts(e), 0, argv.join(' '))
    assert.deepEqual(snapshot(p.main, 7).slice(0, 2), before.slice(0, 2), argv.join(' '))
  }
})

test('R10: create from a detached HEAD is refused, in the main work tree and in a linked one', () => {
  const p = project('main')
  const wt = plain(p)
  git(wt, 'switch', '-q', '--detach')
  git(p.main, 'switch', '-q', '--detach')
  for (const where of [p.main, wt]) {
    const e = env('없음', 'S')
    const r = run(e, where, ['create', '--title', 'new'], BODY)
    assert.equal(r.code, 1, where)
    assert.match(r.out, /detached HEAD/, where)
    assert.equal(posts(e), 0, where)
  }
})

test('R11: an unattended run this session started still refuses its create after half an hour without writes', () => {
  const p = project('main')
  const wt = plain(p)
  ledger(p.main, 14, { stage: 'build', mode: 'autonomous', modeChanged: { to: 'autonomous', at: '2026-10-24T00:00:00.000Z', session: hashOf('S') } })
  put(p.main, 14, 'sessions.json', { [hashOf('S')]: { host: 'claude', at: Date.now() - 31 * 60000 } })
  const e = env('없음', 'S')
  const r = run(e, wt, ['create', '--title', 'new'], BODY)
  assert.equal(r.code, 1)
  assert.match(r.out, /Issue #14 runs unattended/)
  assert.equal(posts(e), 0)
})

test('R11b: a session that takes over an unattended run claims it, and its create from a worktree is refused', () => {
  const p = project('main')
  const own = plain(p, 'feat/14-x')
  const wt = plain(p)
  ledger(p.main, 14, { stage: 'build', mode: 'autonomous', modeChanged: { to: 'autonomous', at: '2026-10-24T00:00:00.000Z', session: hashOf('S1') } })
  const claimed = run(env('feat/14-x', 'S2'), own, ['mode', '14', 'autonomous'], 'resumed unattended after /clear')
  assert.equal(claimed.code, 0, claimed.out)
  const l = JSON.parse(read(p.main, 14, 'ledger.json'))
  assert.equal(l.mode, 'autonomous')
  assert.equal(l.modeChanged.to, 'autonomous')
  assert.equal(l.modeChanged.session, hashOf('S2'))
  assert.ok(l.notes.some(s => s.includes('resumed unattended after /clear')))
  const e = env('없음', 'S2')
  assert.equal(run(e, wt, ['create', '--title', 'new'], BODY).code, 1)
  assert.equal(posts(e), 0)
  assert.match(run(env('feat/14-x', 'S2'), own, ['mode', '14', 'autonomous'], 'again').out, /already autonomous/)
})

test('R11c: an unattended ledger nobody is recorded for refuses create from a worktree, naming the way out', () => {
  const p = project('main')
  const wt = plain(p)
  ledger(p.main, 8, { stage: 'build', mode: 'autonomous' })
  const e = env('없음', 'S')
  const r = run(e, wt, ['create', '--title', 'new'], BODY)
  assert.equal(r.code, 1)
  assert.match(r.out, /Issue #8 runs unattended/)
  assert.match(r.out, /mode 8 interactive/)
  assert.equal(posts(e), 0)
})

test('R13: without a session id an agent worktree counts as unconfirmed', () => {
  const p = project('main')
  const child = agent(p)
  assert.equal(decision(editTest(child, {})), 'deny')
  const e = env('없음')
  assert.equal(run(e, child, ['create', '--title', 'new'], BODY).code, 1)
  assert.equal(posts(e), 0)
})

test('R14: an agent worktree that switches to an Issue branch gains no Issue writes', () => {
  const p = project('main')
  const child = agent(p)
  git(child, 'switch', '-q', '-c', 'feat/7-t1')
  ledger(p.main, 7, { stage: 'build', mode: 'interactive', testsLocked: { at: p.at },
    pendingPosts: [{ id: 'p1', op: 'comment', issue: 7, text: 'x', at: '2026-10-24T00:00:00.000Z' }] })
  const cases = [[['state', '7'], block('feat/7-t1')], [['remark', '7'], '의견'], [['flush'], ''],
    [['tests', '7', 'unlock'], 'wrong test'], [['create', '--title', 'new'], BODY]]
  for (const [argv, input] of cases) {
    const before = snapshot(p.main, 7)
    const e = env('feat/7-t1', 'S')
    const r = run(e, child, argv, input)
    assert.equal(r.code, 1, argv.join(' '))
    assert.equal(posts(e), 0, argv.join(' '))
    assert.deepEqual(snapshot(p.main, 7).slice(0, 2), before.slice(0, 2), argv.join(' '))
  }
})

// git can still read the worktree, but its back link no longer names it, so git's records do not prove whose it is.
function unproven(p, child) {
  const own = git(child, 'rev-parse', '--path-format=absolute', '--git-dir')
  fs.writeFileSync(path.join(own, 'gitdir'), path.join(p.base, 'elsewhere', '.git') + '\n')
  return child
}

test('R15: an agent worktree git cannot prove posts nothing, keeps no ledger of its own and fails doctor', () => {
  const p = project('main')
  const child = unproven(p, agent(p))
  for (const [argv, input] of [[['create', '--title', 'new'], BODY], [['remark', '7'], '의견'], [['ledger-update', '7'], '{"x":1}']]) {
    const e = env('없음', 'S')
    const r = run(e, child, argv, input)
    assert.equal(r.code, 1, argv.join(' '))
    assert.equal(posts(e), 0, argv.join(' '))
  }
  assert.equal(fs.existsSync(path.join(child, '.work')), false)
  assert.equal(decision(editTest(child, { session: 'S' })), 'deny')
  assert.match(testFails(child).join('\n'), /^FAIL tests: .*no confirmed delegation/)
})

test('R16: the hook decides by the session in its input, not by its own environment, also when analysis fails', () => {
  const p = project('main')
  plain(p, 'feat/7-parent')
  const child = agent(p)
  lockTests(p, 7)
  delegate(p.main, 7, 'S')
  const other = { ...state.realEnv, vars: { DEVFLOW_SESSION_ID: 'T' } }
  assert.equal(decision(hook.handle(pre(child, { file_path: path.join(child, 'tests', 'a.test.js') }, { session: 'S' }), other)), 'deny')
  assert.deepEqual(guards(p.main, 7), ['test-locked'])
  // The logger the hook starts when its analysis runs out of time.
  const raw = pre(child, { command: 'gh issue close 1' }, { tool: 'Bash', session: 'S' })
  const r = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main("analysis-deadline")', require.resolve('../hooks/devflow-hook')],
    { input: raw, encoding: 'utf8', env: { ...cleanEnv, DEVFLOW_SESSION_ID: 'T' }, timeout: 20000 })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(decision(r.stdout.trim()), 'deny')
  assert.deepEqual(guards(p.main, 7), ['test-locked', 'analysis-deadline'])
})

test('R17: a refusal in an independent worktree is logged under no Issue', () => {
  const p = project('feat/14-x')
  const wt = plain(p)
  ledger(p.main, 14, { stage: 'build' })
  ledger(p.main, 99, { stage: 'build' })
  const before = [snapshot(p.main, 14), snapshot(p.main, 99)]
  assert.equal(run(env('feat/14-x', 'S'), wt, ['note', '99'], 'x').code, 1)
  assert.deepEqual([snapshot(p.main, 14), snapshot(p.main, 99)], before)
})

test('R18: release names only what this session holds and creates nothing', () => {
  const p = project('main')
  const wt = plain(p)
  const r = run(env('없음', 'S'), wt, ['release', '99'])
  assert.equal(r.code, 0, r.out)
  assert.equal(fs.existsSync(folder(p.main, 99)), false)
})

test('R19: a worktree with no agent marker is independent even when its session delegates elsewhere', () => {
  const p = project('feat/14-x')
  lockTests(p, 14)
  delegate(p.main, 14, 'S')
  const outside = plain(p)
  const slot = worktree(p, path.join(p.main, '.claude', 'worktrees', 'analysis'), 'task-analysis')
  for (const wt of [outside, slot]) {
    assert.equal(decision(editTest(wt, { session: 'S' })), 'allow', wt)
    const ctx = state.repoContext(env('feat/14-x', 'S'), wt)
    assert.equal(ctx.issue, null, wt)
    assert.doesNotMatch(state.card(env('feat/14-x', 'S'), wt), /#14/, wt)
  }
  assert.equal(read(p.main, 14, 'guard-events.jsonl'), null)
})

test('R20: a bound task worktree card points at the main session instead of the parent state', () => {
  const p = project('feat/7-x')
  const child = agent(p)
  ledger(p.main, 7, { stage: 'build' })
  delegate(p.main, 7, 'S')
  const card = state.card(env('feat/7-x', 'S'), child)
  assert.match(card, /task worktree of Issue #7/i)
  assert.match(card, /main session/)
  assert.doesNotMatch(card, /state names another branch/)
})

test('R21: a worktree that keeps the agent branch after moving out of the isolation folder stays a task worktree', () => {
  const p = project('feat/7-x')
  lockTests(p, 7)
  const moved = worktree(p, path.join(p.base, 'moved'), 'worktree-agent-a2')
  assert.equal(decision(editTest(moved, { session: 'S' })), 'deny')
  const e = env('feat/7-x', 'S')
  const r = run(e, moved, ['create', '--title', 'new'], BODY)
  assert.equal(r.code, 1)
  assert.match(r.out, /task worktree/)
  assert.equal(posts(e), 0)
  assert.match(testFails(moved).join('\n'), /^FAIL tests: .*no confirmed delegation/)
})

test('R22: a delegation record inside a worktree git cannot prove binds nothing', () => {
  const p = project('main')
  const child = unproven(p, agent(p))
  delegate(child, 7, 'S')
  ledger(child, 7, { stage: 'build' })
  assert.match(testFails(child).join('\n'), /^FAIL tests: .*no confirmed delegation/)
  const e = env('없음', 'S')
  assert.equal(run(e, child, ['create', '--title', 'new'], BODY).code, 1)
  assert.equal(posts(e), 0)
})

test('P1: a recorded delegation keeps its parent test lock and guard log', () => {
  const p = project('feat/7-x')
  const child = agent(p)
  lockTests(p, 7)
  delegate(p.main, 7, 'S')
  assert.equal(decision(editTest(child, { session: 'S' })), 'deny')
  assert.deepEqual(guards(p.main, 7), ['test-locked'])
  assert.equal(fs.existsSync(path.join(child, '.work')), false)
})

test('P12: a normal start from an independent worktree posts while another session runs its own Issue unattended', () => {
  const p = project('main')
  const wt = plain(p)
  ledger(p.main, 14, { stage: 'build', mode: 'autonomous', modeChanged: { to: 'autonomous', at: '2026-10-24T00:00:00.000Z', session: hashOf('T') } })
  const before = snapshot(p.main, 14)
  const e = env('없음', 'S')
  const r = run(e, wt, ['create', '--title', 'new'], BODY)
  assert.equal(r.code, 0, r.out)
  assert.equal(posts(e), 1)
  assert.deepEqual(snapshot(p.main, 14), before)
})

test('new: the main session records a worktree delegation before launching and takes it out after', () => {
  const p = project('main')
  const own = plain(p, 'feat/7-x')
  ledger(p.main, 7, { stage: 'build' })
  const e = env('feat/7-x', 'S')
  assert.equal(run(e, own, ['running', '7', 'add', 't1', '--worktree']).code, 0)
  const rec = JSON.parse(read(p.main, 7, 'delegates.json'))
  assert.deepEqual(Object.keys(rec), ['t1'])
  assert.equal(rec.t1.session, hashOf('S'))
  assert.equal(rec.t1.host, 'claude')
  assert.deepEqual(JSON.parse(read(p.main, 7, 'ledger.json')).running, ['t1'])
  // One session delegates for one Issue at a time, so a task worktree's Issue is never ambiguous.
  const other = plain(p, 'feat/9-x')
  ledger(p.main, 9, { stage: 'build' })
  const r = run(env('feat/9-x', 'S'), other, ['running', '9', 'add', 't2', '--worktree'])
  assert.equal(r.code, 1)
  assert.match(r.out, /already delegates worktree tasks for Issue #7/)
  // Only from the Issue's own branch, and with a session id.
  assert.equal(run(env('없음', 'S'), p.main, ['running', '7', 'add', 't3', '--worktree']).code, 1)
  assert.equal(run(env('feat/7-x'), own, ['running', '7', 'add', 't4', '--worktree']).code, 1)
  assert.equal(run(e, own, ['running', '7', 'done', 't1']).code, 0)
  assert.deepEqual(JSON.parse(read(p.main, 7, 'delegates.json')), {})
  assert.deepEqual(JSON.parse(read(p.main, 7, 'ledger.json')).running, [])
})

test('new: two Issues holding the same session make its agent worktree unconfirmed', () => {
  const p = project('main')
  const child = agent(p)
  lockTests(p, 7)
  delegate(p.main, 7, 'S')
  delegate(p.main, 9, 'S', 't9')
  const out = editTest(child, { session: 'S' })
  assert.equal(decision(out), 'deny')
  assert.match(reason(out), /no confirmed delegation/)
})

test('new: mode records the session that switched it', () => {
  const p = project('main')
  const own = plain(p, 'feat/14-x')
  ledger(p.main, 14, { stage: 'build' })
  assert.equal(run(env('feat/14-x', 'S'), own, ['mode', '14', 'autonomous'], 'away').code, 0)
  assert.equal(JSON.parse(read(p.main, 14, 'ledger.json')).modeChanged.session, hashOf('S'))
})
