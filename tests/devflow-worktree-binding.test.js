'use strict'
// Linked worktrees use their own Issue branch; Claude isolation worktrees leave all writes to the main session.
// git runs for real; gh answers from a stub; nothing reaches GitHub.
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const tmpdir = require('./tmpdir')
const { spawnSync } = require('child_process')
const state = require('../bin/devflow-state')

// Session identity must not leak in from the shell that runs the tests.
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

// An old devflow profile stays readable, with the main work tree on mainBranch.
function project(mainBranch = 'main', name = 'main') {
  const base = fs.realpathSync.native(tmpdir('dfwb-'))
  const main = path.join(base, name)
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
const read = (root, n, file) => { const f = path.join(folder(root, n), file); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null }
// Historical delegation records are fixture data only; isolation worktrees ignore them.
const delegate = (root, n, session, label = 't1') => {
  put(root, n, 'delegates.json', { [label]: { session: hashOf(session), host: 'claude', at: '2026-10-24T00:00:00.000Z' } })
  const l = JSON.parse(read(root, n, 'ledger.json') || '{}')
  ledger(root, n, { ...l, running: [...(Array.isArray(l.running) ? l.running : []), label] })
}
const snapshot = (root, n) => ['ledger.json', 'sessions.json', 'guard-events.jsonl', 'delegates.json'].map(f => read(root, n, f))

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

const oldLedger = (p, n) => ledger(p.main, n, { stage: 'build', testsLocked: { at: p.at } })
// The recovery a create refusal names: the run's owner or the user, never a mode change or a route without this check.
const ownerOnly = out => {
  assert.doesNotMatch(out, /devflow-state mode|mode \d+ interactive/)
  assert.doesNotMatch(out, /main work tree/)
  assert.match(out, /; ask the session that owns it, or the user, to .+ before retrying; keep the content in ledger notes for the user$/)
}
// What fn reads through link or in target: an lstat of link itself only tells it is a link; anything else follows it.
function followed(link, target, fn) {
  const seen = []
  const watch = ['lstatSync', 'statSync', 'readFileSync', 'readdirSync', 'openSync']
  const orig = Object.fromEntries(watch.map(k => [k, fs[k]]))
  // path.resolve turns either separator into the platform's, so a path spelled with / or \ is matched alike.
  const low = s => path.resolve(String(s)).toLowerCase()
  for (const k of watch) fs[k] = (q, ...a) => {
    const at = low(q)
    if (at.startsWith(low(target)) || at.startsWith(low(link) + path.sep) || (at === low(link) && k !== 'lstatSync')) seen.push(`${k} ${q}`)
    return orig[k](q, ...a)
  }
  try {
    return [fn(), seen]
  } finally {
    Object.assign(fs, orig)
  }
}

test('R1: an independent worktree changes nothing of the main work tree Issue', () => {
  const p = project('feat/14-x')
  const wt = plain(p)
  const fresh = () => ledger(p.main, 14, { stage: 'build', mode: 'interactive', testsLocked: { at: p.at },
    pendingPosts: [{ id: 'p1', op: 'comment', issue: 14, text: 'x', at: '2026-10-24T00:00:00.000Z' }] })
  const cases = [[['note', '14'], 'x'], [['ledger-update', '14'], '{"x":1}'], [['mode', '14', 'autonomous'], 'away']]
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
  assert.match(r.out, /Issue #14 runs unattended/)
  ownerOnly(r.out)
  assert.equal(posts(e), 0)
  assert.deepEqual(snapshot(p.main, 14), before)
})

test('R6: an agent worktree with no delegation posts nothing', () => {
  const p = project('main')
  const child = agent(p)
  const e = env('없음', 'S')
  const r = run(e, child, ['create', '--title', 'new'], BODY)
  assert.equal(r.code, 1)
  assert.match(r.out, /task worktree/)
  assert.equal(posts(e), 0)
})

test('R7: a task worktree writes neither its parent ledger nor the Issue', () => {
  const p = project('feat/7-x')
  const child = agent(p)
  const cases = [[['create', '--title', 'new'], BODY], [['note', '7'], 'x'],
    [['ledger-update', '7'], '{"x":1}'], [['mode', '7', 'autonomous'], 'away'],
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
  const before = snapshot(p.main, 8)
  const e = env('없음', 'S')
  const r = run(e, wt, ['create', '--title', 'new'], BODY)
  assert.equal(r.code, 1)
  assert.match(r.out, /Issue #8 runs unattended/)
  ownerOnly(r.out)
  assert.equal(posts(e), 0)
  assert.deepEqual(snapshot(p.main, 8), before)
})

test('R13: without a session id an agent worktree stays a task worktree', () => {
  const p = project('main')
  const child = agent(p)
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
  const cases = [[['state', '7'], block('feat/7-t1')], [['remark', '7'], '의견'],
     [['create', '--title', 'new'], BODY]]
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

test('R15: an agent worktree git cannot prove posts nothing, keeps no ledger of its own', () => {
  const p = project('main')
  const child = unproven(p, agent(p))
  for (const [argv, input] of [[['create', '--title', 'new'], BODY], [['remark', '7'], '의견'], [['ledger-update', '7'], '{"x":1}']]) {
    const e = env('없음', 'S')
    const r = run(e, child, argv, input)
    assert.equal(r.code, 1, argv.join(' '))
    assert.equal(posts(e), 0, argv.join(' '))
  }
  assert.equal(fs.existsSync(path.join(child, '.work')), false)
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
  oldLedger(p, 14)
  delegate(p.main, 14, 'S')
  const outside = plain(p)
  const slot = worktree(p, path.join(p.main, '.claude', 'worktrees', 'analysis'), 'task-analysis')
  for (const wt of [outside, slot]) {
    const ctx = state.repoContext(env('feat/14-x', 'S'), wt)
    assert.equal(ctx.issue, null, wt)
    assert.doesNotMatch(state.card(env('feat/14-x', 'S'), wt), /#14/, wt)
  }
})

test('R20: a task worktree card points at the main session instead of the parent state', () => {
  const p = project('feat/7-x')
  const child = agent(p)
  ledger(p.main, 7, { stage: 'build' })
  delegate(p.main, 7, 'S')
  const card = state.card(env('feat/7-x', 'S'), child)
  assert.match(card, /task worktree/i)
  assert.doesNotMatch(card, /Issue #7|bound|unconfirmed|locked/i)
  assert.match(card, /main session/)
  assert.doesNotMatch(card, /state names another branch/)
})

test('R21: a worktree that keeps the agent branch after moving out of the isolation folder stays a task worktree', () => {
  const p = project('feat/7-x')
  oldLedger(p, 7)
  const moved = worktree(p, path.join(p.base, 'moved'), 'worktree-agent-a2')
  const e = env('feat/7-x', 'S')
  const r = run(e, moved, ['create', '--title', 'new'], BODY)
  assert.equal(r.code, 1)
  assert.match(r.out, /task worktree/)
  assert.equal(posts(e), 0)
})

test('R22: a delegation record inside a worktree git cannot prove binds nothing', () => {
  const p = project('main')
  const child = unproven(p, agent(p))
  delegate(child, 7, 'S')
  ledger(child, 7, { stage: 'build' })
  const e = env('없음', 'S')
  assert.equal(run(e, child, ['create', '--title', 'new'], BODY).code, 1)
  assert.equal(posts(e), 0)
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

test('new: mode records the session that switched it', () => {
  const p = project('main')
  const own = plain(p, 'feat/14-x')
  ledger(p.main, 14, { stage: 'build' })
  assert.equal(run(env('feat/14-x', 'S'), own, ['mode', '14', 'autonomous'], 'away').code, 0)
  assert.equal(JSON.parse(read(p.main, 14, 'ledger.json')).modeChanged.session, hashOf('S'))
})

test('R25: when the Issue folders cannot be listed, a worktree create is refused and an agent stays a task worktree', () => {
  const p = project('main')
  const wt = plain(p)
  const child = agent(p)
  oldLedger(p, 7)
  delegate(p.main, 7, 'S')
  const list = fs.readdirSync
  const base = path.join(p.main, '.work', 'devflow')
  fs.readdirSync = (d, ...a) => {
    if (path.resolve(String(d)).toLowerCase() === base.toLowerCase()) throw Object.assign(new Error('denied'), { code: 'EACCES' })
    return list(d, ...a)
  }
  try {
    const e = env('없음', 'S')
    const r = run(e, wt, ['create', '--title', 'new'], BODY)
    assert.equal(r.code, 1)
    ownerOnly(r.out)
    assert.equal(posts(e), 0)
  } finally {
    fs.readdirSync = list
  }
})

// #73 G2: an independent create judges every Issue folder entry by the name listed and follows none. An entry it cannot
// tell is the folder devflow reads, or a ledger it cannot read, is unknown and refuses rather than being skipped.
const create = (e, wt) => run(e, wt, ['create', '--title', 'new'], BODY)

test('R44: an Issue folder that is a plain file makes a worktree create refuse, naming it', () => {
  const p = project('main')
  const wt = plain(p)
  fs.mkdirSync(path.join(p.main, '.work', 'devflow'), { recursive: true })
  fs.writeFileSync(folder(p.main, 7), 'not a folder')
  const e = env('없음', 'S')
  const r = create(e, wt)
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  ownerOnly(r.out)
  assert.match(r.out, /\.work\/devflow\/i7\b/)
})

test('R45: an Issue folder that is a link refuses without reading anything through it', () => {
  const p = project('main')
  const wt = plain(p)
  const outside = path.join(p.base, 'outside')
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, 'ledger.json'), JSON.stringify({ mode: 'interactive' }))
  fs.mkdirSync(path.join(p.main, '.work', 'devflow'), { recursive: true })
  fs.symlinkSync(outside, folder(p.main, 7), 'junction')
  const e = env('없음', 'S')
  const [r, seen] = followed(folder(p.main, 7), outside, () => create(e, wt))
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  assert.deepEqual(seen, [])
  assert.match(r.out, /\.work\/devflow\/i7 is not the plain folder/)
  ownerOnly(r.out)
  assert.equal(fs.readFileSync(path.join(outside, 'ledger.json'), 'utf8'), JSON.stringify({ mode: 'interactive' }))
})

test('R46: a ledger that cannot be read makes a worktree create refuse, naming the ledger', () => {
  const p = project('main')
  const wt = plain(p)
  ledger(p.main, 7, '{not json')
  const e = env('없음', 'S')
  const r = create(e, wt)
  assert.equal(r.code, 1)
  assert.equal(posts(e), 0)
  ownerOnly(r.out)
  assert.match(r.out, /\.work\/devflow\/i7\/ledger\.json/)
  assert.equal(read(p.main, 7, 'ledger.json'), '{not json')
})

test('R47: where names keep case, a case variant I7 makes a worktree create refuse rather than skip it', t => {
  const p = project('main')
  const wt = plain(p)
  fs.mkdirSync(path.join(p.main, '.work', 'devflow', 'I7'), { recursive: true })
  if (fs.existsSync(folder(p.main, 7))) return t.skip('this file system ignores case (R24 covers it)')
  fs.writeFileSync(path.join(p.main, '.work', 'devflow', 'I7', 'ledger.json'), JSON.stringify({ stage: 'build', mode: 'autonomous' }))
  const e = env('없음', 'S')
  const r = create(e, wt)
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  ownerOnly(r.out)
  assert.match(r.out, /\.work\/devflow\/I7\b/)
})

test('R48: a .work/devflow that is a link refuses without listing through it', () => {
  const p = project('main')
  const wt = plain(p)
  const outside = path.join(p.base, 'outside')
  fs.mkdirSync(path.join(outside, 'i7'), { recursive: true })
  fs.mkdirSync(path.join(p.main, '.work'), { recursive: true })
  const link = path.join(p.main, '.work', 'devflow')
  fs.symlinkSync(outside, link, 'junction')
  const e = env('없음', 'S')
  const [r, seen] = followed(link, outside, () => create(e, wt))
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  assert.deepEqual(seen, [])
  ownerOnly(r.out)
})

// Where names keep case, i7 and I7 can both be listed; lstat answers for them with the file ids given (dev 1).
function twoNames(p, ids) {
  const wt = plain(p)
  const base = path.join(p.main, '.work', 'devflow')
  fs.mkdirSync(base, { recursive: true })
  const low = s => path.resolve(String(s)).toLowerCase()
  const fake = (ino, big) => ({ isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false,
    ino: big ? ino : Number(ino), dev: big ? 1n : 1 })
  const list = fs.readdirSync
  const lstat = fs.lstatSync
  fs.readdirSync = (d, ...a) => (low(d) === low(base) ? Object.keys(ids) : list(d, ...a))
  fs.lstatSync = (q, o) => {
    const name = path.basename(String(q))
    return low(path.dirname(String(q))) === low(base) && Object.hasOwn(ids, name) ? fake(ids[name], o && o.bigint) : lstat(q, o)
  }
  const e = env('없음', 'S')
  try {
    return [create(e, wt), e]
  } finally {
    fs.readdirSync = list
    fs.lstatSync = lstat
  }
}

test('R49: two folders whose 64-bit file ids differ only past Number precision are not taken for one', () => {
  const [r, e] = twoNames(project('main'), { i7: 2n ** 53n, I7: 2n ** 53n + 1n })
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  ownerOnly(r.out)
})

test('R50: a case variant whose file id the file system does not give (0) is unknown, not taken for the Issue folder', () => {
  const [r, e] = twoNames(project('main'), { i7: 0n, I7: 0n })
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  ownerOnly(r.out)
  assert.match(r.out, /\.work\/devflow\/I7\b/)
})

// A Windows short name (SetFileShortNameW needs no privilege since 1903): the listing shows only the folder's own name,
// while .work/devflow/<alias> opens that folder. Modeled by sending the alias path to the folder.
function shortName(p, real, alias, fn) {
  const base = path.join(p.main, '.work', 'devflow')
  const low = s => path.resolve(String(s)).toLowerCase()
  const from = low(path.join(base, alias))
  const to = path.join(base, real)
  const map = q => {
    const at = low(q)
    return at === from || at.startsWith(from + path.sep) ? to + path.resolve(String(q)).slice(from.length) : q
  }
  const watch = ['lstatSync', 'statSync', 'readFileSync', 'readdirSync', 'openSync', 'existsSync']
  const orig = Object.fromEntries(watch.map(k => [k, fs[k]]))
  for (const k of watch) fs[k] = (q, ...a) => orig[k](typeof q === 'string' ? map(q) : q, ...a)
  try {
    return fn()
  } finally {
    Object.assign(fs, orig)
  }
}
const unattended = session => ({ stage: 'build', mode: 'autonomous', modeChanged: { to: 'autonomous', at: '2026-10-24T00:00:00.000Z', session: hashOf(session) } })

test('R51: a folder listed under another name that the short name i7 opens, holding an unattended ledger this session switched, refuses a worktree create', () => {
  const p = project('main')
  const wt = plain(p)
  const dir = path.join(p.main, '.work', 'devflow', 'friendly-folder')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'ledger.json'), JSON.stringify(unattended('S')))
  const e = env('없음', 'S')
  const r = shortName(p, 'friendly-folder', 'i7', () => create(e, wt))
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  ownerOnly(r.out)
  assert.match(r.out, /\.work\/devflow\/friendly-folder\b/)
})

test('R52: an Issue folder i8 that the short name i7 opens is read as the main work tree Issue #7 too', () => {
  const p = project('feat/7-x')
  const wt = plain(p)
  ledger(p.main, 8, unattended('T'))
  const before = snapshot(p.main, 8)
  const e = env('없음', 'S')
  const r = shortName(p, 'i8', 'i7', () => create(e, wt))
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  assert.match(r.out, /Issue #7 runs unattended/)
  ownerOnly(r.out)
  assert.deepEqual(snapshot(p.main, 8), before)
})

test('R53: a folder under another name whose ledger cannot be told to be absent refuses a worktree create', () => {
  const p = project('main')
  const wt = plain(p)
  const dir = path.join(p.main, '.work', 'devflow', 'friendly-folder')
  fs.mkdirSync(dir, { recursive: true })
  const lstat = fs.lstatSync
  const denied = path.resolve(dir, 'ledger.json').toLowerCase()
  fs.lstatSync = (q, ...a) => {
    if (path.resolve(String(q)).toLowerCase() === denied) throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
    return lstat(q, ...a)
  }
  const e = env('없음', 'S')
  let r
  try {
    r = create(e, wt)
  } finally {
    fs.lstatSync = lstat
  }
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  ownerOnly(r.out)
  assert.match(r.out, /\.work\/devflow\/friendly-folder\b/)
})

test('R54: a link under another name, which a short name i7 can open, refuses a worktree create without following it', () => {
  const p = project('main')
  const wt = plain(p)
  const outside = path.join(p.base, 'outside')
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, 'ledger.json'), JSON.stringify(unattended('S')))
  fs.mkdirSync(path.join(p.main, '.work', 'devflow'), { recursive: true })
  const link = path.join(p.main, '.work', 'devflow', 'jx')
  fs.symlinkSync(outside, link, 'junction')
  const e = env('없음', 'S')
  const [r, seen] = followed(link, outside, () => create(e, wt))
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  assert.deepEqual(seen, [])
  ownerOnly(r.out)
  assert.match(r.out, /\.work\/devflow\/jx\b/)
})

test('P13: folders with no ledger under other names, and no main work tree Issue folder, leave a worktree create posting', () => {
  const p = project('feat/7-x')
  const wt = plain(p)
  fs.mkdirSync(path.join(p.main, '.work', 'devflow', 'analysis'), { recursive: true })
  fs.writeFileSync(path.join(p.main, '.work', 'devflow', 'notes.md'), 'x')
  const e = env('없음', 'S')
  const r = create(e, wt)
  assert.equal(r.code, 0, r.out)
  assert.equal(posts(e), 1)
})

// Node lists a long name holding a lone UTF-16 surrogate with U+FFFD, a name nothing can be opened by, so the folder
// behind it is only reached through its short name. Modeled by listing that name for .work/devflow.
const LOSSY = '���x'
function listing(p, names, fn) {
  const base = path.resolve(p.main, '.work', 'devflow').toLowerCase()
  const list = fs.readdirSync
  fs.readdirSync = (d, ...a) => (path.resolve(String(d)).toLowerCase() === base ? [...names] : list(d, ...a))
  try {
    return fn()
  } finally {
    fs.readdirSync = list
  }
}
// The folder only the short name reaches, holding an unattended ledger this session switched.
const hidden = p => {
  const dir = path.join(p.main, '.work', 'devflow', 'hidden')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'ledger.json'), JSON.stringify(unattended('S')))
}

test('R55: a listed name that opens nothing, behind which the short name i7 holds this session\'s ledger, refuses a worktree create', () => {
  const p = project('main')
  const wt = plain(p)
  hidden(p)
  const e = env('없음', 'S')
  const r = shortName(p, 'hidden', 'i7', () => listing(p, [LOSSY], () => create(e, wt)))
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  ownerOnly(r.out)
})

test('R56: a name listed twice, one of them a plain folder with no ledger, refuses a worktree create', () => {
  const p = project('main')
  const wt = plain(p)
  fs.mkdirSync(path.join(p.main, '.work', 'devflow', LOSSY), { recursive: true })
  hidden(p)
  const e = env('없음', 'S')
  const r = shortName(p, 'hidden', 'i7', () => listing(p, [LOSSY, LOSSY], () => create(e, wt)))
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  ownerOnly(r.out)
})

test('R57: a lossy name that opens, by case, another listed entry with no ledger refuses a worktree create', () => {
  const p = project('main')
  const wt = plain(p)
  const upper = '���X'
  fs.mkdirSync(path.join(p.main, '.work', 'devflow', LOSSY), { recursive: true })
  hidden(p)
  const e = env('없음', 'S')
  // Where names ignore case, the listed upper spelling opens the real lower one.
  const r = shortName(p, 'hidden', 'i7', () => shortName(p, LOSSY, upper, () => listing(p, [upper, LOSSY], () => create(e, wt))))
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  ownerOnly(r.out)
})

test('R58: an unattended ledger whose sessions record cannot be read refuses a worktree create, naming the record', () => {
  const p = project('main')
  const wt = plain(p)
  ledger(p.main, 7, unattended('T'))
  fs.mkdirSync(path.join(folder(p.main, 7), 'sessions.json'))
  const e = env('없음', 'S')
  const r = create(e, wt)
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  ownerOnly(r.out)
  assert.match(r.out, /\.work\/devflow\/i7\/sessions\.json/)
})

test('R59: with the main work tree detached (an Issue branch mid-rebase), any unattended ledger refuses a worktree create', () => {
  const p = project('feat/7-x')
  const wt = plain(p)
  git(p.main, 'switch', '-q', '--detach')
  ledger(p.main, 7, unattended('T'))
  const e = env('없음', 'S')
  const r = create(e, wt)
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  assert.match(r.out, /Issue #7 runs unattended/)
  ownerOnly(r.out)
})

test('P14: with the main work tree detached and no unattended ledger, a worktree create posts', () => {
  const p = project('feat/7-x')
  const wt = plain(p)
  git(p.main, 'switch', '-q', '--detach')
  ledger(p.main, 7, { stage: 'build', mode: 'interactive' })
  const e = env('없음', 'S')
  const r = create(e, wt)
  assert.equal(r.code, 0, r.out)
  assert.equal(posts(e), 1)
})

// A reftable repository keeps the stub "ref: refs/heads/.invalid" in its HEAD file. Main work tree on feat/7-x, its
// Issue #7 unattended; extra(main) runs before the create. Null where this git has no reftable.
function reftableCreate(extra = () => {}) {
  const base = fs.realpathSync.native(tmpdir('dfwb-'))
  const main = path.join(base, 'main')
  fs.mkdirSync(path.join(main, 'tests'), { recursive: true })
  const init = spawnSync('git', [...GITC, 'init', '-q', '--ref-format=reftable'], { cwd: main, encoding: 'utf8', env: cleanEnv })
  if (init.status !== 0) return null
  fs.writeFileSync(path.join(main, '.devflow.json'), '{ "tests": ["tests/**"] }\n')
  fs.writeFileSync(path.join(main, 'tests', 'a.test.js'), 'ok\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'a')
  git(main, 'remote', 'add', 'origin', 'https://github.com/o/r.git')
  git(main, 'switch', '-q', '-c', 'feat/7-x')
  const wt = plain({ base, main })
  ledger(main, 7, unattended('T'))
  extra(main)
  const e = env('없음', 'S')
  return [create(e, wt), e]
}
const refusedAsMain = ([r, e]) => {
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  assert.match(r.out, /Issue #7 runs unattended/)
  ownerOnly(r.out)
}

test('R60: in a reftable repository, whose HEAD file is a stub, the main work tree Issue running unattended refuses a worktree create', t => {
  const got = reftableCreate()
  if (!got) return t.skip('this git has no reftable')
  refusedAsMain(got)
})

test('R61: a tag named like the main work tree branch does not hide its Issue in a reftable repository', t => {
  const got = reftableCreate(main => git(main, 'tag', 'feat/7-x'))
  if (!got) return t.skip('this git has no reftable')
  refusedAsMain(got)
})

// Entry names come from the working tree: a refusal names only plain ones and describes any other.
const UNSHOWN = /an entry of \.work\/devflow with an unusual name/g

test('R62: a refusal for an entry under another name does not echo a name holding a bidi control or a newline', () => {
  for (const name of ['ok\u202Eevil', 'ok\nevil']) {
    const p = project('main')
    const wt = plain(p)
    const dir = path.join(p.main, '.work', 'devflow', name)
    // Windows names cannot hold a newline: there the listing stands in for one.
    const real = !name.includes('\n') || process.platform !== 'win32'
    const e = env('없음', 'S')
    let r
    if (real) {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'ledger.json'), JSON.stringify(unattended('S')))
      r = create(e, wt)
    } else {
      fs.mkdirSync(path.dirname(dir), { recursive: true })
      r = listing(p, [name], () => create(e, wt))
    }
    assert.equal(posts(e), 0, r.out)
    assert.equal(r.code, 1)
    assert.doesNotMatch(r.out, /evil|[\u202E\n]/)
    assert.equal((r.out.match(UNSHOWN) || []).length, 2, r.out)
    ownerOnly(r.out)
    if (real) assert.equal(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8'), JSON.stringify(unattended('S')))
  }
})

test('R63: two names opening one file id are refused without echoing either unusual name, and plain names are shown', () => {
  for (const [a, b, shown] of [['one\u202Eevil', 'two\u202Eevil', false], ['one-a', 'two-b', true]]) {
    const p = project('main')
    const wt = plain(p)
    const base = path.join(p.main, '.work', 'devflow')
    fs.mkdirSync(base, { recursive: true })
    fs.writeFileSync(path.join(base, a), 'x')
    fs.linkSync(path.join(base, a), path.join(base, b))
    const e = env('없음', 'S')
    const r = create(e, wt)
    assert.equal(posts(e), 0, r.out)
    assert.equal(r.code, 1)
    assert.match(r.out, /opens the same entry as/)
    ownerOnly(r.out)
    if (shown) {
      assert.match(r.out, /\.work\/devflow\/one-a\b/)
      assert.match(r.out, /\.work\/devflow\/two-b\b/)
    } else {
      assert.doesNotMatch(r.out, /evil|\u202E/)
      assert.equal((r.out.match(UNSHOWN) || []).length, 3, r.out)
    }
  }
})

test('R64: an Issue folder whose number is past the safe integer range refuses a worktree create rather than reading another number', () => {
  const p = project('main')
  const wt = plain(p)
  // Number('9007199254740993') is 9007199254740992: read by number, this folder's ledger would be missed.
  const dir = path.join(p.main, '.work', 'devflow', 'i9007199254740993')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'ledger.json'), JSON.stringify(unattended('S')))
  const e = env('없음', 'S')
  const r = create(e, wt)
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  ownerOnly(r.out)
})

test('R65: an Issue folder missing from an earlier listing but present when the entries are judged has its ledger read', () => {
  const p = project('main')
  const wt = plain(p)
  ledger(p.main, 7, unattended('S'))
  const base = path.resolve(p.main, '.work', 'devflow').toLowerCase()
  const list = fs.readdirSync
  let calls = 0
  // The folder appears between two listings, as when a run creates its ledger meanwhile.
  fs.readdirSync = (d, ...a) => (path.resolve(String(d)).toLowerCase() === base && calls++ === 0 ? [] : list(d, ...a))
  const e = env('없음', 'S')
  let r
  try {
    r = create(e, wt)
  } finally {
    fs.readdirSync = list
  }
  assert.ok(calls > 1, 'the folder is listed more than once')
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  assert.match(r.out, /Issue #7 runs unattended/)
})

test('R66: a sessions record that reads once and then fails refuses a worktree create rather than passing as empty', () => {
  const p = project('main')
  const wt = plain(p)
  ledger(p.main, 7, unattended('T'))
  put(p.main, 7, 'sessions.json', { [hashOf('S')]: { host: 'claude', at: Date.now() } })
  const target = path.resolve(folder(p.main, 7), 'sessions.json').toLowerCase()
  const readFile = fs.readFileSync
  let reads = 0
  fs.readFileSync = (f, ...a) => {
    if (typeof f === 'string' && path.resolve(f).toLowerCase() === target && reads++ > 0) {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    }
    return readFile(f, ...a)
  }
  const e = env('없음', 'S')
  let r
  try {
    r = create(e, wt)
  } finally {
    fs.readFileSync = readFile
  }
  assert.equal(posts(e), 0, r.out)
  assert.equal(r.code, 1)
  ownerOnly(r.out)
})

test('isolation worktrees ignore historical delegation records and have no Issue', () => {
  const p = project('feat/7-x')
  const child = agent(p)
  ledger(p.main, 7, { mode: 'interactive', running: ['old'] })
  put(p.main, 7, 'delegates.json', 'invalid historical JSON')
  const before = snapshot(p.main, 7)
  const e = env('feat/7-x', 'S')
  const ctx = state.repoContext(e, child)
  assert.equal(ctx.bind, 'task')
  assert.equal(ctx.issue, null)
  assert.equal(ctx.branchIssue, null)
  assert.doesNotMatch(state.card(e, child), /bound|unconfirmed|locked/i)
  assert.equal(run(e, child, ['ledger-update', '7'], '{"stage":"build"}').code, 1)
  assert.deepEqual(snapshot(p.main, 7), before)
})

test('ordinary running labels leave historical delegates.json untouched', () => {
  const p = project('feat/7-x')
  ledger(p.main, 7, { mode: 'interactive' })
  put(p.main, 7, 'delegates.json', 'invalid historical JSON')
  const e = env('feat/7-x', 'S')
  assert.equal(run(e, p.main, ['running', '7', 'add', 'task']).code, 0)
  assert.equal(run(e, p.main, ['running', '7', 'done', 'task']).code, 0)
  assert.equal(read(p.main, 7, 'delegates.json'), 'invalid historical JSON')
})
