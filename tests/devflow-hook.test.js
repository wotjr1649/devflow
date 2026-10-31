'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const tmpdir = require('./tmpdir')
const { execFileSync, spawnSync } = require('child_process')
const hook = require('../hooks/devflow-hook')

function dir(devflow) {
  const d = tmpdir('devflow-hook-')
  if (devflow) fs.writeFileSync(path.join(d, '.devflow.json'), '{}')
  fs.mkdirSync(path.join(d, 'sub'))
  return d
}

const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=',
    '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8', env: cleanEnv() })
  assert.equal(r.status, 0, r.stderr)
}
function gitRepo(branch, profile = {}) {
  const d = fs.realpathSync.native(tmpdir('devflow-hookgit-'))
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify(profile))
  git(d, 'init', '-q')
  git(d, 'add', '.devflow.json')
  git(d, 'commit', '-q', '-m', 'a')
  if (branch !== 'main') git(d, 'switch', '-q', '-c', branch)
  return d
}
const sibling = () => fs.realpathSync.native(tmpdir('devflow-sib-')) + '-wt'
const hashOf = id => require('crypto').createHash('sha256').update(id).digest('hex').slice(0, 12)
const SID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'
const noGit = { run: () => ({ code: 1, stdout: '', stderr: '' }) }

const event = (name, cwd, extra = {}) => JSON.stringify({ hook_event_name: name, cwd, ...extra })

test('SessionStart prints nothing outside a devflow repository', () => {
  const d = dir(false)
  const env = { run: () => ({ code: 0, stdout: d + '\n', stderr: '' }) }
  assert.equal(hook.handle(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: d }), env), '')
})

test('SessionStart turns a card failure into a reason line', () => {
  const env = { run: () => { throw new Error('spawn failed') } }
  const out = JSON.parse(hook.handle(JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact', cwd: '.' }), env))
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(out.hookSpecificOutput.additionalContext, /resume card failed: spawn failed/)
})

test('Stop continues open unattended work at most twice per task', () => {
  const root = dir(true)
  const ledgerFile = path.join(root, '.work/devflow/i1/ledger.json')
  const setLedger = l => {
    fs.mkdirSync(path.dirname(ledgerFile), { recursive: true })
    fs.writeFileSync(ledgerFile, typeof l === 'string' ? l : JSON.stringify(l))
  }
  const env = { run: (cmd, args) => {
    const a = args.join(' ')
    const out = { 'rev-parse --show-toplevel': root, 'branch --show-current': 'feat/1-x', 'rev-parse --short HEAD': 'abc1234',
      'remote get-url origin': 'https://github.com/o/r.git' }[a]
    return out ? { code: 0, stdout: out + '\n', stderr: '' } : { code: 1, stdout: '', stderr: '' }
  } }
  const stop = () => hook.handle(event('Stop', root, { stop_hook_active: false }), env)
  const open = { mode: 'autonomous', stage: 'build', task: { current: 1, total: 2 } }
  setLedger(open)
  assert.equal(JSON.parse(stop()).decision, 'block')
  assert.match(JSON.parse(stop()).reason, /task 1\/2 is open \(build\)/)
  assert.equal(stop(), '', 'the third stop in the same task is allowed')
  assert.equal(JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).counts['1'].continue, 2)
  for (const l of [{ ...open, mode: 'interactive' }, { ...open, decisions: ['which API?'] }, { ...open, blocked: 'CI down' },
    { ...open, running: ['reviewer'] }, { ...open, stage: 'review' }, { ...open, task: { current: 3, total: 2 } }]) {
    setLedger(l)
    assert.equal(stop(), '', JSON.stringify(l))
  }
  for (const l of [{ ...open, blocked: [], decisions: [], running: [] }, { ...open, blocked: {} }, { ...open, blocked: '' }]) {
    setLedger(l)
    assert.equal(JSON.parse(stop()).decision, 'block', `empty keys still continue: ${JSON.stringify(l)}`)
  }
  setLedger({ ...open, mode: 'interactive', runMode: 'M2' })
  assert.equal(stop(), '', 'an interactive session delegating in M2 is attended')
  setLedger('{ broken')
  assert.equal(stop(), '', 'an unreadable ledger lets the session stop')
  // Issue #10: the count goes through the ledger lock; a lock another write holds lets the session stop untouched.
  setLedger(open)
  const lock = path.join(path.dirname(ledgerFile), 'ledger.lock')
  fs.writeFileSync(lock, 'other-writer')
  assert.equal(stop(), '', 'a held lock lets the session stop')
  assert.equal(JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).counts, undefined)
  assert.equal(fs.readFileSync(lock, 'utf8'), 'other-writer')
  fs.rmSync(lock)
  assert.equal(JSON.parse(stop()).decision, 'block')
  assert.ok(!fs.existsSync(lock), 'the hook releases its own lock')
})

test('a folder link to a network path inside the gitdir is not followed (2026-10-02 re-review)', t => {
  const d = dir(true)
  const bs = String.fromCharCode(92)
  const target = bs + bs + 'devflow-no-such-host' + bs + 'share'
  try { fs.symlinkSync(target, path.join(d, 'l'), 'dir') } catch { return t.skip('folder symlinks need privileges here') }
  // The real target must not be needed: lstat of the link itself is local, and its text names a network path.
  fs.writeFileSync(path.join(d, '.git'), 'gitdir: ' + path.join(d, 'l'))
  assert.equal(hook.localPath(path.join(d, 'l', 'HEAD')), false)
  assert.equal(hook.localPath(path.join(d, '.devflow.json')), true)
})

test('a chain of links is judged by every link in it, up to a limit (#53)', t => {
  const d = dir(true)
  const bs = String.fromCharCode(92)
  const link = (name, to) => fs.symlinkSync(to, path.join(d, name), 'dir')
  try { link('net', bs + bs + 'devflow-no-such-host' + bs + 'share') } catch { return t.skip('folder symlinks need privileges here') }
  link('via', path.join(d, 'net'))
  link('rel', 'via')
  assert.equal(hook.localPath(path.join(d, 'via', 'HEAD')), false, 'a local link to a link to a share')
  assert.equal(hook.localPath(path.join(d, 'rel', 'HEAD')), false, 'the same through a relative link')
  link('l0', path.join(d, 'sub'))
  for (let i = 1; i <= 8; i++) link(`l${i}`, `l${i - 1}`)
  assert.equal(hook.localPath(path.join(d, 'l1', 'x')), true, 'a short local chain')
  assert.equal(hook.localPath(path.join(d, 'l8', 'x')), false, 'a chain past the limit counts as remote')
  // Review: each link counts once, however deep it sits under other relative links.
  fs.mkdirSync(path.join(d, 'R1', 'R2', 'R3', 'R4'), { recursive: true })
  link('N1', 'R1')
  link(path.join('R1', 'N2'), 'R2')
  link(path.join('R1', 'R2', 'N3'), 'R3')
  link(path.join('R1', 'R2', 'R3', 'N4'), 'R4')
  assert.equal(hook.localPath(path.join(d, 'N1', 'N2', 'N3', 'N4', 'x')), true, 'four nested relative links')
})

test('SessionStart writes the session id to CLAUDE_ENV_FILE only in a devflow repository, for a well-formed id, outside Codex', () => {
  const envFile = path.join(tmpdir('devflow-envfile-'), 'env.sh')
  const start = (cwd, sid, vars) => hook.handle(event('SessionStart', cwd, { source: 'startup', session_id: sid }), { ...noGit, vars })
  start(dir(true), SID, { CLAUDE_ENV_FILE: envFile })
  assert.equal(fs.readFileSync(envFile, 'utf8'), `export DEVFLOW_SESSION_ID="${SID}"\n`)
  fs.rmSync(envFile)
  start(dir(true), 'x"; rm -rf ~; "', { CLAUDE_ENV_FILE: envFile })
  start(dir(false), SID, { CLAUDE_ENV_FILE: envFile })
  start(dir(true), SID, { CLAUDE_ENV_FILE: envFile, CODEX_THREAD_ID: 'c-1' })
  start(dir(true), SID, {})
  assert.ok(!fs.existsSync(envFile))
})

test('SessionEnd releases the session from every Issue folder and gives up fast on a held lock', () => {
  const root = dir(true)
  const other = hashOf('someone-else')
  const write = n => {
    const d = path.join(root, '.work', 'devflow', `i${n}`)
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'sessions.json'), JSON.stringify({ [hashOf(SID)]: { host: 'claude', at: Date.now() }, [other]: { host: 'codex', at: Date.now() } }))
    return path.join(d, 'sessions.json')
  }
  const [s1, s2] = [write(1), write(2)]
  fs.writeFileSync(path.join(path.dirname(s1), 'ledger.lock'), 'held')
  const t = Date.now()
  assert.equal(hook.handle(event('SessionEnd', path.join(root, 'sub'), { session_id: SID, reason: 'clear' }), noGit), '')
  assert.ok(Date.now() - t < 1000, 'well inside the 1.5 s SessionEnd budget')
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(s2, 'utf8'))), [other])
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(s1, 'utf8'))).length, 2, 'a held lock is left alone; 30 minutes clear it')
  assert.equal(hook.handle(event('SessionEnd', dir(false), { session_id: SID }), noGit), '')
})

test('SessionEnd in a worktree releases the session from the main work tree folders; Stop leaves a worktree ledger alone (#14)', () => {
  const d = gitRepo('feat/7-x')
  const wt = sibling()
  git(d, 'worktree', 'add', '-q', '-b', 'fix/7-wt', wt)
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
  const realGit = { vars: {}, run: (cmd, args, opts = {}) => {
    const r = spawnSync(cmd, args, { cwd: opts.cwd, encoding: 'utf8', env: cleanEnv, timeout: opts.timeout || 10000 })
    return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
  } }
  const folder = path.join(d, '.work', 'devflow', 'i7')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, 'sessions.json'), JSON.stringify({ [hashOf(SID)]: { host: 'claude', at: Date.now() } }))
  assert.equal(hook.handle(event('SessionEnd', wt, { session_id: SID }), realGit), '')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, 'sessions.json'), 'utf8')), {})
  // An autonomous ledger left in the worktree: Stop neither continues the work nor writes either ledger.
  const old = path.join(wt, '.work', 'devflow', 'i7')
  fs.mkdirSync(old, { recursive: true })
  const ledger = JSON.stringify({ mode: 'autonomous', stage: 'build', task: { current: 1, total: 2 } })
  fs.writeFileSync(path.join(old, 'ledger.json'), ledger)
  assert.equal(hook.handle(event('Stop', wt, { stop_hook_active: false }), realGit), '')
  assert.equal(fs.readFileSync(path.join(old, 'ledger.json'), 'utf8'), ledger)
  assert.equal(fs.existsSync(path.join(folder, 'ledger.json')), false)
})

test('SessionEnd resolves a linked worktree without a git process and preserves other sessions (#47)', () => {
  const root = gitRepo('feat/47-session-release')
  const wt = sibling()
  git(root, 'worktree', 'add', '-q', '--relative-paths', '-b', 'fix/47-worker', wt)
  const folder = path.join(root, '.work', 'devflow', 'i47')
  fs.mkdirSync(folder, { recursive: true })
  const file = path.join(folder, 'sessions.json')
  const others = {
    [hashOf('other')]: { host: 'claude', at: Date.now(), extra: 'keep' },
    [hashOf('expired-other')]: { host: 'codex', at: Date.now() - 31 * 60000, extra: { keep: true } },
  }
  fs.writeFileSync(file, JSON.stringify({ [hashOf(SID)]: { host: 'codex', at: Date.now() }, ...others }))
  let calls = 0
  const unavailable = { run: () => { calls++; return { code: 'ETIMEDOUT', stdout: '', stderr: '' } } }
  hook.handle(event('SessionEnd', wt, { session_id: SID }), unavailable)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), others)
  assert.equal(calls, 0, 'session cleanup does not depend on starting git before a deadline')
  assert.equal(fs.existsSync(path.join(wt, '.work')), false)
})

test('SessionEnd cannot release another worktree through a forged gitdir (#47)', () => {
  const root = gitRepo('main')
  const wt = sibling()
  git(root, 'worktree', 'add', '-q', '-b', 'worker', wt)
  const folder = path.join(root, '.work', 'devflow', 'i47')
  fs.mkdirSync(folder, { recursive: true })
  const file = path.join(folder, 'sessions.json')
  const content = JSON.stringify({ [hashOf(SID)]: { host: 'codex', at: Date.now() } })
  fs.writeFileSync(file, content)
  const forged = dir(true)
  fs.writeFileSync(path.join(forged, '.git'), fs.readFileSync(path.join(wt, '.git')))
  hook.handle(event('SessionEnd', forged, { session_id: SID }), noGit)
  assert.equal(fs.readFileSync(file, 'utf8'), content)
  hook.handle(event('SessionEnd', wt, { session_id: SID }), noGit)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {}, 'a non-Issue branch can still release its session')
})

test('SessionEnd lives in hooks.json, which both hosts read; no Claude-only hook file is left (#42)', () => {
  const shared = require('../hooks/hooks.json').hooks
  assert.equal(shared.SessionEnd.length, 1)
  // No matcher: Claude matches it on the end reason, Codex on its one reason "other".
  assert.equal(shared.SessionEnd[0].matcher, undefined)
  const { command, timeout } = shared.SessionEnd[0].hooks[0]
  assert.equal(command, shared.Stop[0].hooks[0].command)
  assert.ok(timeout <= 3, 'Codex caps SessionEnd at 3 s')
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'hooks', 'claude-hooks.json')), false)
  assert.equal('hooks' in require('../.claude-plugin/plugin.json'), false, 'Claude reads hooks/hooks.json by default')
  assert.equal(require('../.codex-plugin/plugin.json').hooks, './hooks/hooks.json')
})

test('SessionEnd in the Codex input shape releases the thread the session was recorded under (#42)', () => {
  // codex-rs/hooks/src/events/session_end.rs (rust-v0.160.0): session_id is the thread id, reason is always "other".
  const tid = '019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5b'
  const root = dir(true)
  const d = path.join(root, '.work', 'devflow', 'i3')
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, 'sessions.json'), JSON.stringify({ [hashOf(tid)]: { host: 'codex', at: Date.now() } }))
  const input = { session_id: tid, transcript_path: null, reason: 'other' }
  assert.equal(hook.handle(event('SessionEnd', root, input), noGit), '')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, 'sessions.json'), 'utf8')), {})
})

test('SessionStart passes the session id to the card, so its own writes are not warned about', () => {
  const root = dir(true)
  const d = path.join(root, '.work', 'devflow', 'i1')
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, 'sessions.json'), JSON.stringify({ [hashOf(SID)]: { host: 'claude', at: Date.now() } }))
  const gitEnv = { vars: {}, run: (cmd, args) => {
    const out = { 'rev-parse --show-toplevel': root, 'branch --show-current': 'feat/1-x', 'rev-parse --short HEAD': 'abc1234',
      'remote get-url origin': 'https://github.com/o/r.git' }[args.join(' ')]
    return out ? { code: 0, stdout: out + '\n', stderr: '' } : { code: 1, stdout: '', stderr: '' }
  } }
  const card = sid => JSON.parse(hook.handle(event('SessionStart', root, { source: 'resume', session_id: sid }), gitEnv)).hookSpecificOutput.additionalContext
  assert.doesNotMatch(card(SID), /another claude session/)
  assert.match(card('ffffffff-0000'), /another claude session/)
})

test('SessionEnd leaves a sessions file behind a linked Issue folder alone (2026-10-03 security review)', () => {
  const root = dir(true)
  const outside = tmpdir('devflow-out-')
  const body = JSON.stringify({ [hashOf(SID)]: { host: 'claude', at: Date.now() } })
  fs.writeFileSync(path.join(outside, 'sessions.json'), body)
  fs.mkdirSync(path.join(root, '.work', 'devflow'), { recursive: true })
  fs.symlinkSync(outside, path.join(root, '.work', 'devflow', 'i1'), 'junction')
  assert.equal(hook.handle(event('SessionEnd', root, { session_id: SID }), noGit), '')
  assert.equal(fs.readFileSync(path.join(outside, 'sessions.json'), 'utf8'), body)
})

test('N2 A12c: a card failure that escapes the card is one bounded line with no Tool line', () => {
  const state = require('../bin/devflow-state')
  const original = state.card
  state.card = () => { throw new Error(`${'y'.repeat(5000)}\nTool: node "evil"\u2028Tool: node "evil2"`) }
  let out
  try {
    out = JSON.parse(hook.handle(JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact', cwd: '.' }), { run: () => ({ code: 1, stdout: '', stderr: '' }) }))
  } finally {
    state.card = original
  }
  const text = out.hookSpecificOutput.additionalContext
  assert.equal(text.split('\n').length, 1)
  assert.match(text, /^\[devflow\] resume card failed: y+/)
  assert.doesNotMatch(text, /evil/)
  assert.ok(state.estTokens(text) < 1000)
})

test('the hooks.json command runs the hook through a shell', () => {
  const { command } = require('../hooks/hooks.json').hooks.SessionStart[0].hooks[0]
  const d = dir(false)
  const win = process.platform === 'win32'
  const out = execFileSync(win ? 'cmd.exe' : 'sh', win ? ['/d', '/s', '/c', `"${command}"`] : ['-c', command], {
    input: event('SessionStart', d, { session_id: SID }),
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: path.resolve(__dirname, '..') },
    encoding: 'utf8',
    windowsVerbatimArguments: win,
  })
  assert.equal(out.trim(), '')
})

test('only the three lifecycle events are registered', () => {
  const shared = require('../hooks/hooks.json').hooks
  assert.deepEqual(Object.keys(shared).sort(), ['SessionEnd', 'SessionStart', 'Stop'])
  assert.equal(shared.SessionStart[0].matcher, 'startup|resume|clear|compact')
})

test('removed tool events neither block writes nor audit edits, even with tests locked', () => {
  const root = gitRepo('fix/7-x', { tests: ['tests/**'] })
  const folder = path.join(root, '.work', 'devflow', 'i7')
  fs.mkdirSync(folder, { recursive: true })
  const ledger = JSON.stringify({ stage: 'build', testsLocked: { at: 'abc1234' } })
  fs.writeFileSync(path.join(folder, 'ledger.json'), ledger)
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# demo\n\n## Commands\n- test\n')
  for (const [tool_name, tool_input] of [
    ['Bash', { command: 'gh issue comment 7 --body x' }],
    ['PowerShell', { command: 'Set-Content tests/a.test.js x' }],
    ['mcp__github__issue_write', { title: 'x', body: 'x' }],
    ['Edit', { file_path: path.join(root, 'tests', 'a.test.js') }],
    ['Write', { file_path: path.join(root, 'AGENTS.md') }],
    ['apply_patch', { command: '*** Delete File: tests/a.test.js' }],
  ]) {
    for (const name of ['PreToolUse', 'PostToolUse']) {
      assert.equal(hook.handle(event(name, root, { tool_name, tool_input })), '', `${name} ${tool_name}`)
    }
  }
  assert.deepEqual(fs.readdirSync(folder), ['ledger.json'])
  assert.equal(fs.readFileSync(path.join(folder, 'ledger.json'), 'utf8'), ledger)
})

test('unreadable hook input produces no decision', () => {
  for (const raw of ['', '{ broken', 'null']) assert.equal(hook.handle(raw), '')
})

function startHook(partial) {
  const { spawn } = require('child_process')
  const child = spawn(process.execPath, ['-e', 'require(process.argv[1]).main()', path.resolve(__dirname, '../hooks/devflow-hook.js')], { stdio: ['pipe', 'pipe', 'ignore'] })
  child.stdin.write(partial)
  const started = Date.now()
  return new Promise(resolve => {
    let out = ''
    child.stdout.on('data', d => { out += d })
    const kill = setTimeout(() => { child.kill('SIGKILL'); resolve({ out, ms: Date.now() - started, killed: true }) }, 9000)
    child.on('close', () => { clearTimeout(kill); resolve({ out, ms: Date.now() - started, killed: false }) })
  })
}

test('stalled input ends without a decision within the input limit', async () => {
  for (const partial of ['', '{"hook_event_name":"SessionStart","cwd":"x"',
    '{"hook_event_name":"Stop"', '{"hook_event_name":"SessionEnd"',
    '{"hook_event_name":"PreToolUse","tool_input":{"command":"gh issue comment 1"']) {
    const r = await startHook(partial)
    assert.equal(r.killed, false, JSON.stringify(partial))
    assert.ok(r.ms < 6000, `took ${r.ms} ms`)
    assert.equal(r.out, '', JSON.stringify(partial))
  }
})
