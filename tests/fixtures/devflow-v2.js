'use strict'
// Shared disposable repository and transport fixtures. Native process assertions live in separate test files.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const tmpdir = require('../tmpdir')
const state = require('../../bin/devflow-state')
const v2 = state.v2, deps = state.v2deps()
const ok = stdout => ({ code: 0, stdout, stderr: '' })
// Explicit complete protocol models test state transitions, not host support.
// Actual process lifecycle and transport cases below use the real runner.
const modelJob = Symbol('trusted-test-job-model')
const settled = (stdout, code = 0) => {
  const rootExit = { pid: 12345, root: true, exitCode: code, signal: null }
  return { [modelJob]: true, code, stdout, stderr: '', stdoutBase64: Buffer.from(stdout).toString('base64'), stderrBase64: '',
    job: { version: 1, adapter: 'linux-subreaper-v1', state: 'settled', reason: 'completed', launched: true,
      rootPid: rootExit.pid, rootExit, observedExits: [rootExit], observedExitCount: 1,
      outputComplete: true, hasObservedFailure: code !== 0 } }
}
const notStarted = code => ({ [modelJob]: true, code, stdout: '', stderr: 'transport fixture', stdoutBase64: '', stderrBase64: Buffer.from('transport fixture').toString('base64'),
  job: { version: 1, adapter: 'linux-subreaper-v1', state: 'not_started', reason: 'launch_failed', errorCode: code, launched: false,
    rootPid: null, rootExit: null, observedExits: [], observedExitCount: 0, hasObservedFailure: false, outputComplete: false } })
const bindModel = (result, cmd, args, opts) => {
  if (result?.[modelJob]) result.job.command = { file: cmd, args, cwd: opts.cwd }
  return result
}
const refs = (...ids) => ids.map(id => ({ id, definitionRevision: 1 }))
const all = refs('a', 'b', 'c', 'd', 'e')
const body = (order = ['a', 'b', 'c', 'd', 'e']) => '## 문제\nScoped delivery\n\n## 수용 기준\n' +
  order.map(id => `- [ ] [AC:${id}@1] requirement ${id}`).join('\n') +
  '\n\n## 현재 상태\n\n- 단계: start\n- 브랜치/PR: feat/1-x\n- 다음 행동: continue\n'
function fixture({ legacy, activate = true, budgetLimit = 20, selected = refs('a', 'b') } = {}) {
  const root = tmpdir('devflow-v2-')
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main', '--object-format=sha1')
  git('config', 'user.name', 'Runtime Test'); git('config', 'user.email', 'runtime@example.invalid')
  git('remote', 'add', 'origin', 'https://github.com/o/r.git')
  fs.writeFileSync(path.join(root, '.gitignore'), '.work/\n')
  fs.writeFileSync(path.join(root, '.devflow.json'), '{}\n')
  fs.writeFileSync(path.join(root, 'candidate.txt'), 'base\n')
  fs.writeFileSync(path.join(root, 'config.json'), '{"strict":true}\n')
  git('add', '.'); git('commit', '-qm', 'base'); git('switch', '-c', 'feat/1-x')
  const original = git('rev-parse', 'HEAD')
  const issue = { number: 1, title: 'Scoped work', state: 'OPEN', url: 'https://github.com/o/r/issues/1', authorAssociation: 'OWNER', body: body(), comments: { nodes: [] } }
  const calls = [], created = []
  const env = { vars: { ...process.env, CODEX_THREAD_ID: 'v2-owner' }, onCommand: null, unknownWrite: false,
    run(cmd, args, opts = {}) {
      calls.push({ cmd, args, input: opts.input })
      if (cmd === 'gh') {
        const success = stdout => opts.settleJob ? bindModel(settled(stdout), cmd, args, opts) : ok(stdout)
        if (opts.settleJob && this.onTransport) return bindModel(this.onTransport(cmd, args, opts), cmd, args, opts)
        if (args[0] === 'api' && args.includes('--jq') && args.includes('user')) return ok('runtime-owner\n')
        if (args[0] === 'api' && args.includes('--paginate')) {
          const objects = args.at(-1).includes('/comments?') ? issue.comments.nodes.map(c => ({ html_url: c.url, body: c.body,
            created_at: c.createdAt, user: { login: c.author?.login || 'runtime-owner' } })) : created
          return ok(JSON.stringify([objects]))
        }
        if (args[0] === 'api') return ok(JSON.stringify({ data: { repository: { issue } } }))
        if (args[0] === 'issue' && ['edit', 'comment', 'close', 'reopen', 'create'].includes(args[1]) && this.writeCode !== undefined) {
          return opts.settleJob ? bindModel(Number.isSafeInteger(this.writeCode) ? settled('', this.writeCode) : notStarted(this.writeCode), cmd, args, opts)
            : { code: this.writeCode, stdout: '', stderr: 'transport fixture' }
        }
        if (args[0] === 'issue' && args[1] === 'edit') {
          if (!this.unknownWrite) { issue.body = opts.input; if (args.includes('--title')) issue.title = args[args.indexOf('--title') + 1] }
          return this.unknownWrite ? { code: 'ETIMEDOUT', stdout: '', stderr: '' } : success(issue.url)
        }
        if (args[0] === 'issue' && ['close', 'reopen'].includes(args[1])) { issue.state = args[1] === 'close' ? 'CLOSED' : 'OPEN'; return success(issue.url) }
        if (args[0] === 'issue' && args[1] === 'comment') {
          if (this.unknownWrite) return { code: 'ETIMEDOUT', stdout: '', stderr: '' }
          issue.comments.nodes.push({ body: opts.input, authorAssociation: 'OWNER', createdAt: new Date().toISOString(), url: issue.url + '#issuecomment-' + (issue.comments.nodes.length + 1) })
          return success(issue.comments.nodes.at(-1).url)
        }
        if (args[0] === 'issue' && args[1] === 'create') {
          if (this.unknownWrite) return { code: 'ETIMEDOUT', stdout: '', stderr: '' }
          created.push({ html_url: 'https://github.com/o/r/issues/' + (99 + created.length), title: args[args.indexOf('--title') + 1], body: opts.input,
            created_at: new Date().toISOString(), user: { login: 'runtime-owner' } })
          return success(created.at(-1).html_url)
        }
        if (args[0] === 'auth') return ok('')
        return { code: 1, stdout: '', stderr: 'unexpected fake GitHub request' }
      }
      if (this.onCommand && cmd === process.execPath) {
        const result = bindModel(this.onCommand(cmd, args, opts), cmd, args, opts)
        if (result) return result
      }
      return state.realEnv.run(cmd, args, { ...opts, env: opts.env || this.vars })
    }
  }
  if (legacy) {
    fs.mkdirSync(path.join(root, '.work/devflow/i1'), { recursive: true })
    fs.writeFileSync(path.join(root, '.work/devflow/i1/ledger.json'), JSON.stringify(legacy))
  }
  const ctx = () => state.repoContext(env, root)
  const read = () => v2.read(root, 1, ctx())
  const expected = () => v2.expectedOf(read())
  const intent = () => v2.intent(issue.body, deps)
  const control = (op, args = {}) => v2.control(ctx(), 1, { expected: expected(), op, ...args }, deps)
  const init = extra => v2.activate(ctx(), 1, { quiescent: true, observedIntentRevision: intent().revision,
    delivery: { id: 'delivery-1', criteria: selected, reviewBaseOid: original }, budgetLimit, ...extra }, deps)
  const verify = (scope = 'delivery', criteria = selected, extra = {}) => v2.verify(ctx(), 1,
    { expected: expected(), scope, criteria, command: { file: process.execPath, args: ['-e', 'process.stdout.write("proof\\n")'] }, configFiles: ['config.json'], ...extra }, deps)
  const effect = (op, args = {}, title) => v2.external(ctx(), 1, op,
    { expected: expected(), observedIntentRevision: intent().revision, ...args }, title, deps)
  const cli = (argv, input = '') => state.main(argv, () => typeof input === 'string' ? input : JSON.stringify(input), env, root)
  const committed = text => { fs.writeFileSync(path.join(root, 'candidate.txt'), text); git('add', 'candidate.txt'); git('commit', '-qm', text.trim()); return git('rev-parse', 'HEAD') }
  const f = { root, git, original, env, issue, created, calls, ctx, read, expected, intent, control, init, verify, effect, cli, committed }
  if (activate) init(legacy ? { recoveryReason: 'Explicitly recover approved delivery base and private state.' } : {})
  return f
}
const ghWrites = f => f.calls.filter(c => c.cmd === 'gh' && c.args[0] === 'issue' && ['edit', 'comment', 'close', 'reopen', 'create'].includes(c.args[1]))
const at = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const nodeCommand = code => ({ file: process.execPath, args: ['-e', code] })
const local = (id, text) => [{ id, definitionRevision: 1, text }]
const wholeTask = (...ids) => ({ checks: ids.map(id => ({ id, definitionRevision: 1, text: `requirement ${id}` })), contributesTo: refs(...ids) })
const liveJob = { skip: process.platform !== 'linux' && 'Acceptance execution requires the supported Linux subreaper adapter' }
const waitFor = async predicate => {
  const until = Date.now() + 10000
  while (!predicate() && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 50))
  assert.ok(predicate(), 'bounded fixture did not finish naturally')
  await new Promise(resolve => setTimeout(resolve, 100))
}
const complete = f => { const proof = f.verify().proof; f.control('delivery-complete', { evidenceIds: [proof.id], impactAnalysis: 'Selected criteria and unchanged regression inputs checked.' }); return proof }
function actualCliFixture() {
  const f = fixture({ activate: false })
  const bin = path.join(f.root, '.work', 'fake-bin'), remote = path.join(f.root, '.work', 'remote.json')
  fs.mkdirSync(bin, { recursive: true })
  // No fallback real gh is reachable after the executable-disappearance fixture.
  fs.symlinkSync(process.execPath, path.join(bin, 'node'))
  fs.symlinkSync(execFileSync('which', ['git'], { encoding: 'utf8' }).trim(), path.join(bin, 'git'))
  fs.writeFileSync(path.join(bin, 'gh'), '#!/usr/bin/env node\n' + fs.readFileSync(path.join(__dirname, 'v2-fake-gh.js')), { mode: 0o700 })
  const readRemote = () => JSON.parse(fs.readFileSync(remote, 'utf8'))
  const save = value => fs.writeFileSync(remote, JSON.stringify(value))
  save({ issue: f.issue, mode: 'success', writes: 0, created: [] })
  const env = { ...f.env.vars, PATH: bin, DEVFLOW_TEST_REMOTE: remote }
  const cli = (args, input = '') => {
    const got = spawnSync(process.execPath, [path.resolve(__dirname, '../../bin/devflow-state'), ...args], {
      cwd: f.root, env, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', timeout: 45000, maxBuffer: 2 << 20 })
    return { code: got.status ?? got.error?.code, out: got.stdout.trim(), err: got.stderr.trim() }
  }
  const init = cli(['ledger-init', '1', '--quiescent'], { observedIntentRevision: f.intent().revision,
    delivery: { id: 'delivery-1', criteria: refs('a', 'b'), reviewBaseOid: f.original }, budgetLimit: 10 })
  assert.equal(init.code, 0, init.out + init.err)
  const ledger = () => { const got = cli(['ledger', '1']); assert.equal(got.code, 0, got.err); return JSON.parse(got.out) }
  return { f, cli, ledger, expected: () => v2.expectedOf(ledger()), readRemote, save }
}

module.exports = { ok, modelJob, settled, refs, all, body, fixture, ghWrites, at, nodeCommand, local, wholeTask,
  liveJob, waitFor, complete, actualCliFixture }
