'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const metrics = require('../bin/devflow-metrics')

// Every record here is synthetic: no value is copied from a real session log.
const BIN = path.join(__dirname, '..', 'bin', 'devflow-metrics')
const T0 = 1790000000
const iso = s => new Date((T0 + s) * 1000).toISOString()
const ms = s => (T0 + s) * 1000

const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
const GITC = ['-c', 'init.defaultBranch=main', '-c', 'core.logAllRefUpdates=true', '-c', 'commit.gpgsign=false',
  '-c', 'core.hooksPath=', '-c', 'user.name=t', '-c', 'user.email=t@example.com']

function git(cwd, at, ...args) {
  const date = `${T0 + at} +0000`
  const r = spawnSync('git', [...GITC, ...args], {
    cwd, encoding: 'utf8', env: { ...cleanEnv(), GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date },
  })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

const tmp = name => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), name)))

// A repository on main at T0 that switches to feat/4-x at T0+100.
function gitRepo() {
  const root = path.join(tmp('dfm-'), 'repo')
  fs.mkdirSync(root)
  git(root, 0, 'init', '-q')
  git(root, 0, 'commit', '-q', '--allow-empty', '-m', 'a')
  git(root, 100, 'switch', '-q', '-c', 'feat/4-x')
  return root
}

function write(file, records) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, records.map(r => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n')
}

const enc = p => p.replace(/[^a-zA-Z0-9]/g, '-')
const claudeFolder = (home, root) => path.join(home, 'projects', enc(root))

const cl = {
  assistant: (at, { id, cwd, branch, usage = {}, tools = [], model = 'claude-opus-5-5' }) => ({
    type: 'assistant', timestamp: iso(at), cwd, gitBranch: branch,
    message: {
      id, model, content: tools.map(t => ({ type: 'tool_use', id: t, name: 'Bash', input: {} })),
      usage: { input_tokens: 1, cache_read_input_tokens: 10, cache_creation_input_tokens: 5, output_tokens: 3,
        output_tokens_details: { thinking_tokens: 1 }, ...usage },
    },
  }),
  turn: (at, durationMs, { cwd, branch }) => ({ type: 'system', subtype: 'turn_duration', durationMs, timestamp: iso(at), cwd, gitBranch: branch }),
}

const cx = {
  meta: (at, cwd, sub = false) => ({ timestamp: iso(at), type: 'session_meta',
    payload: { id: 's', cwd, source: sub ? { subagent: { thread_spawn: { parent_thread_id: 'p', depth: 1 } } } : 'cli' } }),
  turn: (at, cwd, model = 'gpt-6.1-sol') => ({ timestamp: iso(at), type: 'turn_context', payload: { cwd, model } }),
  usage: (at, rid, u = {}) => ({ timestamp: iso(at), type: 'token_usage_record', payload: { response_id: rid,
    usage: { input_tokens: 100, cached_input_tokens: 60, cache_write_input_tokens: 0, output_tokens: 7, reasoning_output_tokens: 2, total_tokens: 107, ...u } } }),
  call: (at, type, callId) => ({ timestamp: iso(at), type: 'response_item', payload: { type, call_id: callId } }),
  tokenCount: (at, last) => ({ timestamp: iso(at), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: last, total_token_usage: last } } }),
  done: (at, durationMs) => ({ timestamp: iso(at), type: 'event_msg', payload: { type: 'task_complete', duration_ms: durationMs } }),
}

const rollout = (home, name, records, where = 'sessions') =>
  write(path.join(home, where, '2026', '10', '01', `rollout-${name}.jsonl`), records)

async function measure(root, { claude = tmp('dfm-c-'), codex = tmp('dfm-x-'), until } = {}) {
  const ctx = metrics.context(root)
  const c = await metrics.claude({ ctx, dir: claude, issue: 4, until })
  const x = await metrics.codex({ ctx, dir: codex, issue: 4, until })
  return { c, x, report: metrics.report({ claude: c, codex: x, ledger: metrics.readLedger(ctx, 4), issue: 4, until }) }
}

test('claude counts the Issue branch once per response and leaves other branches and folders out', async () => {
  const root = gitRepo()
  const home = tmp('dfm-c-')
  const on = { cwd: root, branch: 'feat/4-x' }
  write(path.join(claudeFolder(home, root), 's1.jsonl'), [
    cl.assistant(50, { id: 'm0', cwd: root, branch: 'main' }),
    cl.assistant(150, { id: 'm1', ...on, tools: ['t1'] }),
    cl.assistant(151, { id: 'm1', ...on, tools: ['t2'] }),
    cl.turn(160, 20000, on),
    cl.assistant(170, { id: 'm2', cwd: root, branch: 'feat/5-y' }),
    cl.assistant(180, { id: 'm3', ...on, model: '<synthetic>' }),
    'not json',
  ])
  // A sibling folder whose name starts with the repository's: its records sit outside the repository.
  write(path.join(home, 'projects', enc(root) + '-private', 's2.jsonl'), [
    cl.assistant(150, { id: 'p1', cwd: root + '-private', branch: 'feat/4-x' }),
  ])
  const { c } = await measure(root, { claude: home })
  assert.deepEqual(c.main, { calls: 1, inputUncached: 1, cacheRead: 10, cacheWrite: 5, output: 3, reasoning: 1, tools: 2 })
  assert.deepEqual(c.intervals.main, [[ms(160) - 20000, ms(160)]])
  assert.deepEqual(c.models, { 'claude-opus-5-5': 1 })
  assert.equal(c.skipped.badLines, 1)
  assert.equal(c.last, ms(160))
})

test('claude subagents count as sub, follow a worktree inside the repository, and idle gaps split activity', async () => {
  const root = gitRepo()
  const home = tmp('dfm-c-')
  const wt = { cwd: path.join(root, '.claude', 'worktrees', 'i4'), branch: 'feat/4-x' }
  write(path.join(claudeFolder(home, root), 's1.jsonl'), [cl.assistant(150, { id: 'm1', ...wt })])
  write(path.join(claudeFolder(home, root), 's1', 'subagents', 'agent-a.jsonl'), [
    cl.assistant(200, { id: 'a1', ...wt }),
    cl.assistant(260, { id: 'a2', ...wt, tools: ['t9'] }),
    cl.assistant(2000, { id: 'a3', ...wt }),
    cl.assistant(2030, { id: 'a3', ...wt }),
  ])
  const { c, report } = await measure(root, { claude: home })
  assert.equal(c.main.calls, 1)
  assert.deepEqual(c.sub, { calls: 3, inputUncached: 3, cacheRead: 30, cacheWrite: 15, output: 9, reasoning: 3, tools: 1, subagents: 1 })
  assert.deepEqual(c.intervals.sub, [[ms(200), ms(260)], [ms(2000), ms(2030)]])
  assert.equal(report.claude.sub.activeMinutes, 2)
})

test('codex splits a session at the reflog switch, dedupes calls and tools, and attributes subagents by cwd', async () => {
  const root = gitRepo()
  const home = tmp('dfm-x-')
  rollout(home, 'a', [
    cx.meta(0, root), cx.turn(0, root),
    cx.usage(50, 'r0'), cx.call(50, 'custom_tool_call', 'c0'),
    cx.usage(150, 'r1'), cx.call(150, 'custom_tool_call', 'c1'),
    cx.call(151, 'function_call', 'c2'), cx.call(151, 'function_call', 'c2'), cx.call(152, 'local_shell_call', 'c3'),
    cx.call(152, 'function_call_output', 'c3'),
    cx.done(160, 10000),
  ])
  // A subagent rollout has no git field; it is attributed by its cwd. Archived sessions are read too.
  rollout(home, 'b', [cx.meta(170, path.join(root, 'sub'), true), cx.turn(170, path.join(root, 'sub')), cx.usage(175, 'r2')], 'archived_sessions')
  const { x } = await measure(root, { codex: home })
  assert.deepEqual(x.main, { calls: 1, inputUncached: 40, cacheRead: 60, cacheWrite: 0, output: 7, reasoning: 2, tools: 3 })
  assert.deepEqual(x.sub, { calls: 1, inputUncached: 40, cacheRead: 60, cacheWrite: 0, output: 7, reasoning: 2, tools: 0, subagents: 1 })
  assert.deepEqual(x.intervals.main, [[ms(160) - 10000, ms(160)]])
  assert.deepEqual(x.models, { 'gpt-6.1-sol': 2 })
})

test('codex leaves out a nested worktree on another branch and another repository with the same number', async () => {
  const root = gitRepo()
  const nested = path.join(root, '.claude', 'worktrees', 'i5')
  git(root, 200, 'worktree', 'add', '-q', '-b', 'feat/5-y', nested)
  const other = gitRepo()
  const home = tmp('dfm-x-')
  rollout(home, 'a', [cx.meta(250, root), cx.turn(250, root), cx.usage(300, 'r1')])
  rollout(home, 'b', [cx.meta(250, nested), cx.turn(250, nested), cx.usage(300, 'r2')])
  rollout(home, 'c', [cx.meta(250, other), cx.turn(250, other), cx.usage(300, 'r3')])
  const { x } = await measure(root, { codex: home })
  assert.equal(x.main.calls, 1)
})

test('codex rollouts without per-call records fall back to token_count and are flagged', async () => {
  const root = gitRepo()
  const home = tmp('dfm-x-')
  const l1 = { input_tokens: 50, cached_input_tokens: 20, cache_write_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 1, total_tokens: 55 }
  const l2 = { ...l1, input_tokens: 70, total_tokens: 75 }
  rollout(home, 'a', [cx.meta(110, root), cx.turn(110, root), cx.tokenCount(150, l1), cx.tokenCount(151, l1), cx.tokenCount(155, l2)])
  const { x } = await measure(root, { codex: home })
  assert.deepEqual(x.main, { calls: 2, inputUncached: 80, cacheRead: 40, cacheWrite: 0, output: 10, reasoning: 2, tools: 0 })
  assert.equal(x.skipped.fallbackSessions, 1)
})

test('codex records in a worktree without a reflog are counted as noReflog, not guessed', async () => {
  const root = gitRepo()
  const wt = path.join(path.dirname(root), 'wt')
  git(root, 200, 'worktree', 'add', '-q', '-b', 'feat/4-z', wt)
  fs.rmSync(git(wt, 200, 'rev-parse', '--path-format=absolute', '--git-path', 'logs/HEAD'))
  const home = tmp('dfm-x-')
  rollout(home, 'a', [cx.meta(250, wt), cx.turn(250, wt), cx.usage(300, 'r1')])
  const { x } = await measure(root, { codex: home })
  assert.equal(x.main.calls, 0)
  assert.equal(x.skipped.noReflog, 1)
})

test('report holds integers only, sums the ledger, and the public line has a fixed order', async () => {
  const root = gitRepo()
  const claude = tmp('dfm-c-')
  const codex = tmp('dfm-x-')
  write(path.join(claudeFolder(claude, root), 's1.jsonl'), [cl.assistant(150, { id: 'm1', cwd: root, branch: 'feat/4-x', tools: ['t1'] }), cl.turn(160, 90000, { cwd: root, branch: 'feat/4-x' })])
  rollout(codex, 'a', [cx.meta(110, root), cx.turn(110, root), cx.usage(150, 'r1'), cx.done(160, 30000)])
  write(path.join(root, '.work', 'devflow', 'i4', 'ledger.json'), [{
    metrics: { interventions: 2, filterFalsePositives: 1, eval: { passed: 5, total: 6 } },
    counts: { 1: { fix: 1, promote: 0, continue: 2 }, 2: { fix: 1 } },
  }])
  const { report } = await measure(root, { claude, codex })
  const leaves = (o, at = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${at}${k}.`) : [[at + k, v]]))
  for (const [k, v] of leaves(report)) assert.ok(Number.isInteger(v), `${k} is not an integer`)
  assert.equal(report.schema, 1)
  assert.equal(report.activeMinutes, 2, 'claude 90 s and codex 30 s overlap into one 90 s span')
  assert.deepEqual(report.manual, { interventions: 2, filterFalsePositives: 1, counts: { fix: 2, promote: 0, continue: 2 }, eval: { passed: 5, total: 6 } })
  assert.equal(metrics.line(report),
    '- 측정(v1): calls 2, inputUncached 41, cacheRead 70, cacheWrite 5, output 10, tools 1, subagents 0, activeMinutes 2, interventions 2, filterFalsePositives 1')
})

test('cli prints no record text, honours --until, and refuses a malformed Issue number', () => {
  const root = gitRepo()
  const claude = tmp('dfm-c-')
  const codex = tmp('dfm-x-')
  write(path.join(claudeFolder(claude, root), 's1.jsonl'), [
    cl.assistant(150, { id: 'm1', cwd: root, branch: 'feat/4-x' }),
    cl.assistant(200, { id: 'm2', cwd: root, branch: 'feat/4-x' }),
    '{"type":"assistant","message": SECRET-MARKER',
  ])
  const run = args => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8', env: cleanEnv() })
  const r = run(['4', '--claude-dir', claude, '--codex-dir', codex, '--until', String(T0 + 160)])
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stdout + r.stderr, /SECRET-MARKER/)
  const out = JSON.parse(r.stdout)
  assert.equal(out.claude.main.calls, 1)
  assert.equal(out.until, T0 + 160)
  assert.equal(out.skipped.badLines, 1)
  const line = run(['4', '--claude-dir', claude, '--codex-dir', codex, '--line'])
  assert.match(line.stdout, /^- 측정\(v1\): calls 2, /)
  const bad = run(['4x', '--claude-dir', claude])
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /usage: devflow-metrics/)
})

test('readJsonl counts malformed and over-long lines without returning their text', async () => {
  const dir = tmp('dfm-r-')
  const file = path.join(dir, 'a.jsonl')
  write(file, ['{"a":1}', 'x'.repeat(200), '{"b":', '{"c":3}'])
  const seen = []
  const r = await metrics.readJsonl(file, rec => seen.push(rec), { maxLine: 100 })
  assert.deepEqual(seen, [{ a: 1 }, { c: 3 }])
  assert.deepEqual(r, { bad: 1, long: 1 })
})

test('readJsonl does not follow links', async t => {
  const dir = tmp('dfm-r-')
  const target = path.join(dir, 'target.jsonl')
  write(target, ['{"a":1}'])
  try { fs.symlinkSync(target, path.join(dir, 'link.jsonl')) } catch { return t.skip('symlinks need privileges here') }
  const seen = []
  await metrics.readJsonl(path.join(dir, 'link.jsonl'), rec => seen.push(rec))
  assert.deepEqual(seen, [])
})
