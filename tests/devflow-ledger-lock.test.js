'use strict'
// Issue #10: every ledger write holds a short lock, so two sessions (or a session and the Stop hook) keep each other's
// changes; queued posts are claimed so two flushes never post the same item twice.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const tmpdir = require('./tmpdir')
const { spawn, spawnSync, execFileSync } = require('child_process')
const state = require('../bin/devflow-state')

const BRANCH = 'feat/1-x'
const ok = stdout => ({ code: 0, stdout, stderr: '' })
const block = () => ['## 현재 상태', '', '- 단계: build', `- 브랜치/PR: ${BRANCH}`].join('\n')
const issue = () => ({
  number: 1, title: 'T', state: 'OPEN', url: 'https://github.com/o/r/issues/1', authorAssociation: 'OWNER',
  body: `## 문제\nx\n\n## 수용 기준\n- [ ] a\n\n${block()}\n`, comments: { nodes: [] },
})

function repo(ledger) {
  const root = tmpdir('devflow-lock-')
  fs.writeFileSync(path.join(root, '.devflow.json'), '{}')
  if (ledger) {
    fs.mkdirSync(path.join(root, '.work/devflow/i1'), { recursive: true })
    fs.writeFileSync(path.join(root, '.work/devflow/i1/ledger.json'), JSON.stringify(ledger))
  }
  return root
}

function env(root, { gh = null, vars = {}, branch = BRANCH } = {}) {
  const calls = []
  return {
    calls,
    vars,
    run(cmd, args, opts = {}) {
      calls.push({ cmd, args, input: opts.input })
      const a = args.join(' ')
      if (cmd === 'git') {
        if (a === 'rev-parse --show-toplevel') return ok(root + '\n')
        if (a === 'branch --show-current') return ok(branch + '\n')
        if (a === 'rev-parse --short HEAD') return ok('abc1234\n')
        if (a === 'remote get-url origin') return ok('https://github.com/o/r.git\n')
      }
      if (cmd === 'gh' && gh) return gh
      if (cmd === 'gh' && args[0] === 'api') return ok(JSON.stringify({ data: { repository: { issue: issue() } } }))
      if (cmd === 'gh') return ok('https://github.com/o/r/issues/1#issuecomment-9\n')
      return { code: 127, stdout: '', stderr: '' }
    },
  }
}

const dir = root => path.join(root, '.work', 'devflow', 'i1')
const ledgerOf = root => JSON.parse(fs.readFileSync(path.join(dir(root), 'ledger.json'), 'utf8'))
const lockFile = root => path.join(dir(root), 'ledger.lock')
const ghWrites = e => e.calls.filter(c => c.cmd === 'gh' && c.args[0] === 'issue')
const guards = root => {
  const f = path.join(dir(root), 'guard-events.jsonl')
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l).guard) : []
}

// A child spawned for a concurrency test is waited on from the moment it starts, and gives up its own wait for the start
// signal after a while, so neither a child that ends early nor a test that fails first leaves anything hanging (#15).
const exitOf = kid => new Promise((resolve, reject) => { kid.once('exit', resolve); kid.once('error', reject) })
const awaitStart = start => `const end = Date.now() + 30000; while (!fs.existsSync(${JSON.stringify(start)})) if (Date.now() > end) process.exit(9);`

test('concurrent ledger writes from several processes keep every change', { timeout: 60000 }, async () => {
  const root = repo({ stage: 'build' })
  const start = path.join(root, 'start')
  const mod = JSON.stringify(path.resolve(__dirname, '../bin/devflow-state'))
  const kid = body => `const s = require(${mod}); const fs = require('fs'); const r = ${JSON.stringify(root)};` +
    `${awaitStart(start)} for (let i = 0; i < 20; i++) { ${body} }`
  const kids = [
    ...[0, 1, 2].map(k => kid(`if (!s.updateLedger(r, 1, l => ({ ledger: { ...l, ['k${k}_' + i]: i } }), { waitMs: 30000 }).ok) process.exit(3)`)),
    ...[0, 1, 2].map(k => kid(`if (!s.updateLedger(r, 1, l => ({ ledger: { ...l, notes: [...(l.notes || []), '${k}-' + i] } }), { waitMs: 30000 }).ok) process.exit(3)`)),
    ...[0, 1].map(() => kid(`if (!s.updateLedger(r, 1, l => ({ ledger: { ...l, count: (l.count || 0) + 1 } }), { waitMs: 30000 }).ok) process.exit(3)`)),
  ].map(script => spawn(process.execPath, ['-e', script], { stdio: 'ignore' }))
  const exits = kids.map(exitOf)
  await new Promise(r => setTimeout(r, 300))
  fs.writeFileSync(start, '')
  const codes = await Promise.all(exits)
  assert.deepEqual(codes, kids.map(() => 0))
  const l = ledgerOf(root)
  assert.equal(l.stage, 'build')
  for (const k of [0, 1, 2]) for (let i = 0; i < 20; i++) assert.equal(l[`k${k}_${i}`], i)
  assert.equal(l.notes.length, 60)
  assert.equal(l.count, 40)
  assert.ok(!fs.existsSync(lockFile(root)), 'the lock is gone')
  assert.deepEqual(fs.readdirSync(dir(root)).filter(f => /\.tmp$/.test(f)), [], 'no temp file is left')
})

// Issue #15: a stale lock that cannot be moved aside (Windows refuses to rename a file another process holds open) must
// not spin past the wait limit. A spin is synchronous, so no timer in this process could stop it: it runs in a child.
test('a stale lock that cannot be moved aside still ends at the wait limit', () => {
  const root = repo({ a: 1 })
  fs.writeFileSync(lockFile(root), 'old-token')
  const old = (Date.now() - 60000) / 1000
  fs.utimesSync(lockFile(root), old, old)
  const script = `const fs = require('fs'); const s = require(${JSON.stringify(path.resolve(__dirname, '../bin/devflow-state'))});` +
    `const lock = ${JSON.stringify(lockFile(root))}; const rename = fs.renameSync;` +
    `fs.renameSync = (a, b) => { if (a === lock) { const e = new Error('held'); e.code = 'EPERM'; throw e } return rename(a, b) };` +
    `const t = Date.now(); const r = s.withLock(${JSON.stringify(root)}, 1, () => 'ran', { waitMs: 200 });` +
    `process.stdout.write(JSON.stringify({ r, ms: Date.now() - t }))`
  const run = require('child_process').spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 8000 })
  assert.equal(run.error, undefined, 'withLock did not return within 8 seconds')
  const { r, ms } = JSON.parse(run.stdout)
  assert.deepEqual(r, { ok: false, why: 'busy' })
  assert.ok(ms < 2000, `returned after ${ms} ms`)
  assert.equal(fs.readFileSync(lockFile(root), 'utf8'), 'old-token', 'the lock it could not move is left as it was')
})

test('a stale lock is moved aside and the write goes on; a fresh one is waited for, then refused', () => {
  const root = repo({ a: 1 })
  fs.writeFileSync(lockFile(root), 'old-token')
  const old = (Date.now() - 11000) / 1000
  fs.utimesSync(lockFile(root), old, old)
  assert.equal(state.updateLedger(root, 1, l => ({ ledger: { ...l, b: 2 } })).ok, true)
  assert.deepEqual(ledgerOf(root), { a: 1, b: 2 })
  assert.ok(!fs.existsSync(lockFile(root)))
  fs.writeFileSync(lockFile(root), 'live-token')
  const t = Date.now()
  assert.deepEqual(state.updateLedger(root, 1, l => ({ ledger: { ...l, c: 3 } }), { waitMs: 200 }), { ok: false, why: 'busy' })
  assert.ok(Date.now() - t >= 150, 'it waited')
  assert.equal(fs.readFileSync(lockFile(root), 'utf8'), 'live-token', 'another holder keeps its lock')
  assert.deepEqual(ledgerOf(root), { a: 1, b: 2 })
})

test('a lock is released only by the holder whose token it carries', () => {
  const root = repo({ a: 1 })
  const r = state.updateLedger(root, 1, l => {
    fs.writeFileSync(lockFile(root), 'someone-else')
    return { ledger: { ...l, b: 2 }, result: 'done' }
  })
  assert.deepEqual(r, { ok: true, ledger: { a: 1, b: 2 }, result: 'done' })
  assert.equal(fs.readFileSync(lockFile(root), 'utf8'), 'someone-else')
})

test('nothing is written when fn returns no ledger, and the result comes back', () => {
  const root = repo({ a: 1 })
  assert.deepEqual(state.updateLedger(root, 1, () => ({ result: 7 })), { ok: true, ledger: undefined, result: 7 })
  assert.deepEqual(ledgerOf(root), { a: 1 })
})

test('no lock, temp file or ledger is written through a linked Issue folder', () => {
  const root = repo()
  const outside = tmpdir('devflow-out-')
  fs.mkdirSync(path.join(root, '.work', 'devflow'), { recursive: true })
  fs.symlinkSync(outside, dir(root), 'junction')
  assert.deepEqual(state.updateLedger(root, 1, l => ({ ledger: { ...l, a: 1 } })), { ok: false, why: 'unsafe' })
  assert.deepEqual(fs.readdirSync(outside), [])
})

test('a failed rename leaves no temp file behind', () => {
  const root = repo()
  fs.mkdirSync(path.join(dir(root), 'ledger.json'), { recursive: true })
  assert.throws(() => state.writeLedger(root, 1, { a: 1 }))
  assert.deepEqual(fs.readdirSync(dir(root)).filter(f => /\.tmp$/.test(f)), [])
})

test('note appends one line to the branch Issue ledger under the lock', () => {
  const root = repo({ notes: ['a'], stage: 'build' })
  assert.deepEqual(state.note(env(root), '.', 1, 'second\nignored'), { code: 0, out: 'notes 2' })
  assert.deepEqual(ledgerOf(root).notes, ['a', 'second'])
  assert.equal(state.note(env(root), '.', 7, 'x').code, 1)
  assert.equal(state.note(env(root), '.', 1, '  ').code, 2)
})

// Issue #12: cleanup runs on main after the Issue branch is gone, and the ledger is where it is recorded.
const ledgerCmd = (root, branch, argv, input = '') => state.main(argv, () => input, env(root, { branch }), '.')
const issueDir = (root, n) => path.join(root, '.work', 'devflow', `i${n}`)

test('on a named branch that is no Issue branch, note and metric append only to a ledger that exists (#12)', () => {
  const root = repo({ notes: ['a'], stage: 'done' })
  assert.deepEqual(ledgerCmd(root, 'main', ['note', '1'], 'cleanup: branch deleted'), { code: 0, out: 'notes 2' })
  assert.equal(ledgerCmd(root, 'main', ['metric', '1', 'interventions'], 'x').code, 0)
  assert.deepEqual(ledgerOf(root).notes, ['a', 'cleanup: branch deleted', 'interventions +1: x'])
  assert.equal(ledgerOf(root).metrics.interventions, 1)
  // A number with no ledger is refused without creating its folder, so nothing is logged for it either.
  for (const argv of [['note', '7'], ['metric', '7', 'interventions']]) {
    const r = ledgerCmd(root, 'main', argv, 'x')
    assert.equal(r.code, 1)
    assert.match(r.out, /no ledger for Issue #7/)
  }
  assert.equal(fs.existsSync(issueDir(root, 7)), false)
  // ledger-update still creates a ledger there: start does that before the Issue branch exists.
  assert.equal(ledgerCmd(root, 'main', ['ledger-update', '7'], '{"stage":"start"}').code, 0)
  assert.equal(JSON.parse(fs.readFileSync(path.join(issueDir(root, 7), 'ledger.json'), 'utf8')).stage, 'start')
})

test('on another Issue branch or a detached HEAD no ledger command writes that ledger, and each refusal is logged (#12)', () => {
  const root = repo({ stage: 'build' })
  fs.mkdirSync(issueDir(root, 7), { recursive: true })
  fs.writeFileSync(path.join(issueDir(root, 7), 'ledger.json'), JSON.stringify({ stage: 'build', notes: [] }))
  const before = fs.readFileSync(path.join(issueDir(root, 7), 'ledger.json'), 'utf8')
  const cmds = [['note', '7'], ['metric', '7', 'interventions'], ['ledger-update', '7']]
  const input = argv => (argv[0] === 'ledger-update' ? '{"x":1}' : 'x')
  for (const argv of cmds) {
    const r = ledgerCmd(root, BRANCH, argv, input(argv))
    assert.equal(r.code, 1, argv.join(' '))
    assert.match(r.out, /only to the branch's Issue #1/)
  }
  assert.deepEqual(guards(root), ['state-other-issue', 'state-other-issue', 'state-other-issue'])
  // A detached HEAD may be an Issue branch in the middle of a rebase: no ledger is written, and the refusal is logged
  // under the Issue named, whose folder exists.
  for (const argv of cmds) {
    const r = ledgerCmd(root, '', argv, input(argv))
    assert.equal(r.code, 1, 'detached ' + argv.join(' '))
    assert.match(r.out, /detached HEAD/)
  }
  assert.equal(fs.readFileSync(path.join(issueDir(root, 7), 'ledger.json'), 'utf8'), before)
  const logged = fs.readFileSync(path.join(issueDir(root, 7), 'guard-events.jsonl'), 'utf8').trim().split('\n')
  assert.deepEqual(logged.map(l => JSON.parse(l).guard), ['state-detached', 'state-detached', 'state-detached'])
})

test('a held lock refuses metric and note with a fixed guard id', () => {
  const root = repo({ stage: 'build' })
  fs.writeFileSync(lockFile(root), 'live-token')
  const r = state.metric(env(root), '.', 1, 'interventions', 'x')
  assert.deepEqual(r, { code: 1, out: 'refused: another write holds the ledger of Issue #1; try again' })
  assert.deepEqual(guards(root), ['state-ledger-locked'])
  assert.match(state.note(env(root), '.', 1, 'x').out, /another write holds the ledger/)
  assert.deepEqual(guards(root), ['state-ledger-locked', 'state-ledger-locked'])
})

test('flush claims the whole queue: a queue another flush claimed is left to it', () => {
  const root = repo({ mode: 'interactive', pendingPosts: [
    { id: 'a', op: 'comment', issue: 1, text: '### Checkpoint build — x\n- y', claimed: { by: 'other', at: Date.now() } },
  ] })
  const e = env(root)
  const r = state.flush(e, '.')
  assert.equal(r.code, 1)
  assert.match(r.out, /another flush is posting/)
  assert.equal(ghWrites(e).length, 0)
  assert.equal(ledgerOf(root).pendingPosts.length, 1)
})

test('flush posts two same-millisecond items once each and an expired claim again', () => {
  const at = new Date().toISOString()
  const text = '### Checkpoint build — x\n- y'
  const root = repo({ mode: 'interactive', pendingPosts: [
    { op: 'comment', issue: 1, text, at }, { op: 'comment', issue: 1, text, at },
    { id: 'c', op: 'comment', issue: 1, text, at, claimed: { by: 'dead', at: Date.now() - 11 * 60000 } },
  ] })
  const e = env(root)
  assert.equal(state.flush(e, '.').code, 0)
  assert.equal(ghWrites(e).length, 3)
  assert.deepEqual(ledgerOf(root).pendingPosts, [])
})

test('a failed post keeps it and the later items unclaimed for the next flush', () => {
  const text = '### Checkpoint build — x\n- y'
  const root = repo({ mode: 'interactive', pendingPosts: [{ op: 'comment', issue: 1, text }, { op: 'comment', issue: 1, text }] })
  const e = env(root, { gh: { code: 1, stdout: '', stderr: '' } })
  assert.equal(state.flush(e, '.').code, 1)
  const left = ledgerOf(root).pendingPosts
  assert.equal(left.length, 2)
  assert.ok(left.every(p => p.id && !p.claimed))
})

// Sessions: a write records its session (hashed); another session's write in the last 30 minutes is warned about.
const A = { CLAUDE_CODE_SESSION_ID: 'aaaaaaaa-1111' }
const B = { CLAUDE_CODE_SESSION_ID: 'bbbbbbbb-2222' }
const run = (root, vars, argv, input = '') => state.main(argv, () => input, env(root, { vars }), '.')
const sessionsFile = root => path.join(dir(root), 'sessions.json')
const WARN = /^Warning: another claude session \([0-9a-f]{6}\) wrote to Issue #1 \d+ min ago/m

test('a write by another session in the last 30 minutes is warned about; the same session is not', () => {
  const root = repo({ stage: 'build' })
  assert.doesNotMatch(run(root, A, ['note', '1'], 'a').out, WARN)
  assert.doesNotMatch(run(root, A, ['note', '1'], 'again').out, WARN, 'the same session')
  const r = run(root, B, ['note', '1'], 'b')
  assert.equal(r.code, 0)
  assert.match(r.out, WARN)
  assert.match(r.out, /release 1/)
  assert.match(run(root, A, ['ledger-update', '1'], '{"x":1}').out, WARN, 'A now sees B')
})

test('activity older than 30 minutes is ignored and dropped', () => {
  const root = repo({ stage: 'build' })
  run(root, A, ['note', '1'], 'a')
  const s = JSON.parse(fs.readFileSync(sessionsFile(root), 'utf8'))
  const [hash] = Object.keys(s)
  s[hash].at = Date.now() - 31 * 60000
  fs.writeFileSync(sessionsFile(root), JSON.stringify(s))
  assert.doesNotMatch(run(root, B, ['note', '1'], 'b').out, WARN)
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(sessionsFile(root), 'utf8'))).length, 1, 'the old entry is gone')
  s[hash].at = Date.now() - 29 * 60000
  fs.writeFileSync(sessionsFile(root), JSON.stringify(s))
  assert.match(run(root, B, ['note', '1'], 'b').out, /29 min ago/)
})

test('release takes the session out of the warnings', () => {
  const root = repo({ stage: 'build' })
  run(root, A, ['note', '1'], 'a')
  assert.match(run(root, B, ['note', '1'], 'b').out, WARN)
  assert.deepEqual(run(root, A, ['release', '1']), { code: 0, out: 'released this session from Issue #1' })
  assert.doesNotMatch(run(root, B, ['note', '1'], 'c').out, WARN)
})

test('the session id is kept only as a hash, the Codex id wins, and no id means no record', () => {
  const root = repo({ stage: 'build' })
  run(root, { CODEX_THREAD_ID: 'cccc-3333', CLAUDE_CODE_SESSION_ID: 'aaaaaaaa-1111' }, ['note', '1'], 'a')
  const text = fs.readFileSync(sessionsFile(root), 'utf8')
  assert.doesNotMatch(text, /cccc-3333|aaaaaaaa-1111/)
  assert.deepEqual(Object.values(JSON.parse(text)).map(v => v.host), ['codex'])
  assert.match(run(root, A, ['note', '1'], 'b').out, /another codex session/)
  const root2 = repo({ stage: 'build' })
  run(root2, {}, ['note', '1'], 'a')
  assert.ok(!fs.existsSync(sessionsFile(root2)))
  run(root2, A, ['note', '1'], 'a')
  assert.doesNotMatch(run(root2, {}, ['note', '1'], 'b').out, WARN, 'without an id there is nothing to compare')
})

test('the resume card warns about another active session and not about its own', () => {
  const root = repo({ stage: 'build' })
  run(root, A, ['note', '1'], 'a')
  const ownByHook = state.card(env(root, { vars: {} }), '.', { sessionId: A.CLAUDE_CODE_SESSION_ID })
  assert.doesNotMatch(ownByHook, WARN)
  const hookAndShellDiffer = state.card(env(root, { vars: B }), '.', { sessionId: A.CLAUDE_CODE_SESSION_ID })
  assert.doesNotMatch(hookAndShellDiffer, WARN, 'the id the hook received counts as its own too')
  assert.doesNotMatch(state.card(env(root, { vars: A }), '.'), WARN)
  const other = state.card(env(root, { vars: B }), '.').split('\n')
  assert.match(other[1], WARN)
  assert.doesNotMatch(state.card(env(root, { vars: {} }), '.'), WARN, 'a card that knows no own id warns about nothing')
})

// Review fixes (2026-10-03): a posted item that cannot be removed stops the flush; a linked folder no longer blocks
// interactive writes; odd locks and claims; validated and capped session warnings; subagents share the session.
test('a post whose removal cannot take the lock stops the flush and says so', () => {
  const text = '### Checkpoint build — x\n- y'
  const root = repo({ mode: 'interactive', pendingPosts: [{ op: 'comment', issue: 1, text }, { op: 'comment', issue: 1, text }] })
  const e = env(root)
  const run0 = e.run
  e.run = (cmd, args, opts) => {
    const r = run0(cmd, args, opts)
    if (cmd === 'gh' && args[0] === 'issue') fs.writeFileSync(lockFile(root), 'held-by-another')
    return r
  }
  const r = state.flush(e, '.', { waitMs: 100 })
  assert.equal(r.code, 1)
  assert.match(r.out, /posted comment \([0-9a-f]+\) but could not remove it from the queue/)
  assert.equal(ghWrites(e).length, 1, 'the second item waits')
})

test('interactive writes go on through a linked Issue folder, whose ledger is not read', () => {
  const root = repo()
  const outside = tmpdir('devflow-out-')
  fs.mkdirSync(path.join(root, '.work', 'devflow'), { recursive: true })
  fs.symlinkSync(outside, dir(root), 'junction')
  fs.writeFileSync(path.join(outside, 'ledger.json'), JSON.stringify({ mode: 'autonomous' }))
  const e = env(root)
  assert.equal(state.write(e, '.', 'comment', 1, '### Checkpoint build — x\n- y').code, 0)
  assert.equal(ghWrites(e).length, 1, 'posted, not queued into the linked ledger')
  assert.deepEqual(fs.readdirSync(outside), ['ledger.json'])
})

test('a lock that is not a file is refused as unsafe; a lock from the future is stale; a future claim is void', () => {
  const root = repo({ a: 1 })
  fs.mkdirSync(lockFile(root))
  const r = state.metric(env(root), '.', 1, 'interventions', 'x')
  assert.match(r.out, /not a plain folder/)
  fs.rmSync(lockFile(root), { recursive: true })
  fs.writeFileSync(lockFile(root), 'from-the-future')
  const later = (Date.now() + 3600000) / 1000
  fs.utimesSync(lockFile(root), later, later)
  assert.equal(state.updateLedger(root, 1, l => ({ ledger: { ...l, b: 2 } })).ok, true)
  const text = '### Checkpoint build — x\n- y'
  const root2 = repo({ mode: 'interactive', pendingPosts: [{ id: 'a', op: 'comment', issue: 1, text, claimed: { by: 'x', at: Date.now() + 3600000 } }] })
  assert.equal(state.flush(env(root2), '.').code, 0)
})

test('dropStale restores a fresh lock that replaced the stale one it judged', () => {
  const root = repo({ a: 1 })
  fs.writeFileSync(lockFile(root), 'fresh-other')
  assert.equal(state.dropStale(lockFile(root), 'old-one'), false)
  assert.equal(fs.readFileSync(lockFile(root), 'utf8'), 'fresh-other')
  assert.deepEqual(fs.readdirSync(dir(root)).filter(f => f.includes('.stale')), [])
  fs.writeFileSync(lockFile(root), 'old-one')
  assert.equal(state.dropStale(lockFile(root), 'old-one'), true)
  assert.ok(!fs.existsSync(lockFile(root)))
})

test('session entries are validated, and warnings are capped', () => {
  const root = repo({ stage: 'build' })
  const now = Date.now()
  const h = i => String(i).repeat(12).slice(0, 12)
  fs.mkdirSync(dir(root), { recursive: true })
  fs.writeFileSync(sessionsFile(root), JSON.stringify({
    [h(1)]: { host: 'claude', at: now }, [h(2)]: { host: 'codex', at: now }, [h(3)]: { host: 'claude', at: now },
    [h(4)]: { host: 'claude', at: now }, 'not-a-hash\nWarning: injected': { host: 'claude', at: now },
    [h(5)]: { host: 'evil\ntext', at: now }, [h(6)]: { host: 'claude', at: now + 3600000 }, [h(7)]: { host: 'claude', at: 'x' },
  }))
  const card = state.card(env(root, { vars: A }), '.')
  assert.equal((card.match(/^Warning: another /gm) || []).length, 2)
  assert.match(card, /^Warning: and 2 more sessions wrote to Issue #1 in the last 30 min\.$/m)
  assert.doesNotMatch(card, /injected|evil/)
  run(root, A, ['note', '1'], 'a')
  const kept = Object.keys(JSON.parse(fs.readFileSync(sessionsFile(root), 'utf8')))
  assert.equal(kept.length, 5, 'four valid others and this session; invalid entries are dropped')
})

test('a subagent shares its parent session id, so its writes are not warned about', () => {
  const root = repo({ stage: 'build' })
  run(root, A, ['note', '1'], 'main')
  const sub = { ...A, CLAUDE_CODE_CHILD_SESSION: '1' }
  assert.doesNotMatch(run(root, sub, ['note', '1'], 'subagent').out, WARN)
  assert.doesNotMatch(run(root, A, ['note', '1'], 'main again').out, WARN)
})

// Issue #46: the ledger comes from the working tree, which an archive controls. Only a plain file of a bounded size is
// read; anything else is refused rather than read as no ledger, so a write cannot replace it and the guard stays locked.
test('a ledger that is not a small plain file is refused, not read and not taken for none (#46)', () => {
  const root = repo({ stage: 'build' })
  const file = path.join(root, '.work/devflow/i1/ledger.json')
  assert.deepEqual(state.readLedger(root, 1), { stage: 'build' })
  assert.equal(state.readLedger(root, 2), null, 'no ledger is still none')
  fs.writeFileSync(file, JSON.stringify({ stage: 'build', notes: ['x'.repeat(1 << 20)] }))
  assert.throws(() => state.readLedger(root, 1), /Issue #1's ledger is not a small plain file/)
  fs.rmSync(file)
  fs.mkdirSync(file)
  assert.throws(() => state.readLedger(root, 1), /Issue #1's ledger is not a small plain file/)
})

test('a FIFO ledger cannot hold a ledger read open (#46)', { skip: process.platform === 'win32' }, () => {
  const root = repo()
  fs.mkdirSync(path.join(root, '.work/devflow/i1'), { recursive: true })
  execFileSync('mkfifo', [path.join(root, '.work/devflow/i1/ledger.json')])
  const r = spawnSync(process.execPath, ['-e', 'const s = require(process.argv[1]); try { s.readLedger(process.argv[2], 1); console.log("read") } catch (e) { console.log("refused: " + e.message) }',
    path.resolve(__dirname, '../bin/devflow-state'), root], { encoding: 'utf8', timeout: 8000 })
  assert.equal(r.signal, null, 'the read did not return before the timeout')
  assert.match(r.stdout, /^refused: Issue #1's ledger is not a small plain file/)
})
