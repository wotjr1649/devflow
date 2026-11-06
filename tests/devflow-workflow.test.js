'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const zlib = require('node:zlib')
const { spawnSync } = require('node:child_process')
const tmpdir = require('./tmpdir')
const state = require('../bin/devflow-state')
const hook = require('../hooks/devflow-hook')
const w = state.workflow
const sha = c => c.repeat(40)
const digest = text => crypto.createHash('sha256').update(text).digest('hex')
const ok = stdout => ({ code: 0, stdout, stderr: '' })
const OWNER = 'workflow-owner'
const projection = '\n## 현재 상태\n\n- 단계: ship\n- 브랜치/PR: feat/1-x (main @ abc1234, PR 없음)\n- 다음 행동: Continue\n'
const intent = '## 문제\n\nKeep the exact contract.\n\n## 수용 기준\n\n- [ ] [AC-one] Preserve `two  spaces`.\n- [ ] [AC-two] Preserve the second requirement.\n'

function fixture(legacy = {}, settings = {}) {
  const root = settings.root || tmpdir('devflow-workflow-')
  fs.writeFileSync(path.join(root, '.devflow.json'), '{}')
  const dir = path.join(root, '.work/devflow/i1')
  fs.mkdirSync(dir, { recursive: true })
  const original = JSON.stringify(legacy, null, 2) + '\n'
  fs.writeFileSync(path.join(dir, 'ledger.json'), original)
  const env = { vars: { CODEX_THREAD_ID: OWNER }, calls: [], head: settings.head || sha('a'),
    issue: { number: 1, title: 'Protected workflow', state: 'OPEN', authorAssociation: 'OWNER', url: 'https://github.com/o/r/issues/1',
      body: intent + projection, comments: { nodes: [] } }, lookupFailure: false, writeFailure: false,
    run(cmd, args, opts = {}) {
      this.calls.push({ cmd, args, input: opts.input })
      if (cmd === 'git') {
        const a = args.join(' ')
        if (a === 'rev-parse --show-toplevel') return ok(root + '\n')
        if (a === 'branch --show-current') return ok('feat/1-x\n')
        if (a === 'rev-parse --short HEAD') return ok(this.head.slice(0, 7) + '\n')
        if (a === 'rev-parse --verify HEAD^{commit}') return ok(this.head + '\n')
        if (a === 'remote get-url origin') return ok('https://github.com/o/r.git\n')
        if (args[0] === 'log') return ok('')
      }
      if (cmd === 'gh' && args[0] === 'api') return this.lookupFailure ? { code: 1, stdout: '', stderr: 'offline' }
        : ok(JSON.stringify({ data: { repository: { issue: this.issue } } }))
      if (cmd === 'gh' && args[0] === 'issue') {
        if (this.writeFailure) return { code: 1, stdout: '', stderr: 'connection ended' }
        if (args[1] === 'edit' && opts.input !== undefined) this.issue.body = opts.input
        if (args[1] === 'close') this.issue.state = 'CLOSED'
        return ok('https://github.com/o/r/issues/1\n')
      }
      return { code: 127, stdout: '', stderr: 'not available' }
    } }
  const f = { root, dir, env, original }
  f.cli = (args, body = '') => {
    try { return state.main(args, () => typeof body === 'string' ? body : JSON.stringify(body), env, root) }
    catch (error) { return { code: 1, out: error.message } }
  }
  const selected = f.cli(['criteria', '1'])
  assert.equal(selected.code, 0, selected.out)
  f.criteria = JSON.parse(selected.out)
  f.input = { delivery: 'delivery-1', deliveryBase: sha('b'), integrationTarget: { ref: 'refs/heads/main', sha: sha('c') },
    path: 'bounded', runMode: 'M1', stage: 'design', inputsDigest: digest('local inputs'),
    scope: { ref: '.work/devflow/i1/scope.json', revision: 1, criteriaRevision: 1, intentRevision: f.criteria.intentRevision,
      criteriaRefs: f.criteria.criteria.map(({ id, definitionRevision }) => ({ id, definitionRevision })),
      issueCriteria: ['AC-one', 'AC-two'], deliveryCriteria: ['AC-one', 'AC-two'], requiredChecks: ['focused'], reviewPerspectives: ['correctness'] } }
  f.migrate = (extra = {}) => f.cli(['workflow', 'migrate', '1', '--quiescent'], { ...f.input, ...extra })
  f.record = () => state.readLedger(root, 1)
  f.step = request => f.cli(['workflow', 'transition', '1'], { expectedRevision: f.record().workflow.revision, ...request })
  f.prepare = (op, text = '', receipt, title, target) => f.cli(['workflow', 'effect', '1', 'prepare'], {
    expectedRevision: f.record().workflow.revision,
    effect: { id: `effect-${f.record().workflow.revision}`, kind: op, target: target || 'github.com/o/r/issues/1',
      payloadDigest: w.digest([op, 1, text, title || null, ...(receipt ? [receipt] : [])]) } })
  f.proof = (kind = 'verification') => {
    const record = f.record(), phase = record.workflow.phase
    const evidence = { id: `${kind}-${record.workflow.revision}`, kind, scope: phase, ref: '.work/devflow/i1/report.json',
      lifecycle: 'completed', verdict: 'PASS', subject: w.subject(record, phase, env.head),
      criteria: phase === 'task' ? record.workflow.task.criteria : record.workflow.scope.deliveryCriteria,
      checks: kind === 'verification' ? ['focused'] : [], perspectives: kind === 'review' ? ['correctness'] : [],
      ...(kind === 'verification' ? { exitCode: 0 } : {}) }
    const result = f.cli(['workflow', 'evidence', '1'], { expectedRevision: record.workflow.revision, evidence })
    assert.equal(result.code, 0, result.out)
    return evidence.id
  }
  f.ship = () => {
    for (const result of [f.step({ action: 'delivery' })]) assert.equal(result.code, 0, result.out)
    f.proof(); assert.equal(f.step({ stage: 'review' }).code, 0); f.proof('review')
    const result = f.step({ stage: 'ship' }); assert.equal(result.code, 0, result.out)
  }
  return f
}
function migrated(legacy, settings) {
  const f = fixture(legacy, settings), result = f.migrate()
  assert.equal(result.code, 0, result.out)
  return f
}
function writes(f) { return f.env.calls.filter(call => call.cmd === 'gh' && call.args[0] === 'issue') }
function bytes(f) {
  return Object.fromEntries(fs.readdirSync(f.dir).filter(name => fs.statSync(path.join(f.dir, name)).isFile())
    .map(name => [name, fs.readFileSync(path.join(f.dir, name), 'utf8')]))
}
function receipt(f, selected = f.criteria.criteria, evidenceIds = []) {
  return { expectedIntentRevision: f.criteria.intentRevision,
    criteriaRefs: selected.map(({ id, definitionRevision }) => ({ id, definitionRevision })), evidenceIds }
}
function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout.trim()
}
function gitRepo() {
  const root = tmpdir('devflow-workflow-git-')
  git(root, ['init', '--initial-branch=feat/1-x'])
  fs.writeFileSync(path.join(root, '.devflow.json'), '{}\n')
  fs.writeFileSync(path.join(root, '.gitignore'), '.work/\n')
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'before\n')
  git(root, ['add', '.'])
  git(root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Fixture'])
  git(root, ['remote', 'add', 'origin', 'https://github.com/o/r.git'])
  return root
}

// The compressed fixtures are exactly git-show output, not a reimplementation of the obsolete writer. They keep
// this regression runnable with the depth-one checkout used by CI; no network, history fetch or skipped case.
test('migration preserves legacy bytes and actual pinned old CLI and hook cannot change canonical state', () => {
  const source = path.join(__dirname, 'fixtures/devflow-v1'), provenance = JSON.parse(fs.readFileSync(path.join(source, 'provenance.json')))
  assert.equal(provenance.sourceCommit, 'b2feffee464ce9c7b26a7f6142db8695f1ec39c0')
  const plugin = tmpdir('devflow-obsolete-plugin-')
  for (const item of provenance.files) {
    const data = zlib.gunzipSync(fs.readFileSync(path.join(source, item.fixture)))
    assert.equal(data.length, item.bytes); assert.equal(digest(data), item.sha256)
    const dest = path.join(plugin, item.path)
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data)
  }
  const root = gitRepo(), head = git(root, ['rev-parse', 'HEAD'])
  const f = fixture({ notes: ['retain the original note'], stage: 'build', mode: 'autonomous', counts: { 1: { continue: 1 } }, task: { current: 1, total: 2 } }, { root, head })
  const result = f.migrate({ stage: 'build', task: { id: 'task-1', current: 1, total: 2, attempt: 1, criteria: ['AC-one'] }, taskAttemptBase: head })
  assert.equal(result.code, 0, result.out)
  assert.equal(fs.readFileSync(path.join(f.dir, 'ledger.v1.json'), 'utf8'), f.original)
  assert.throws(() => JSON.parse(fs.readFileSync(path.join(f.dir, 'ledger.json'), 'utf8')))
  const before = bytes(f), old = path.join(plugin, 'bin/devflow-state')
  for (const [args, input] of [
    [['ledger-update', '1'], '{"stage":"ship","mode":"interactive","counts":{}}'],
    [['note', '1'], 'obsolete writer note'], [['running', '1', 'add', 'obsolete'], ''],
    [['mode', '1', 'interactive'], 'obsolete mode switch'],
  ]) {
    const attempt = spawnSync(process.execPath, [old, ...args], { cwd: root, encoding: 'utf8', input,
      env: { ...process.env, CODEX_THREAD_ID: OWNER }, timeout: 15000 })
    assert.notEqual(attempt.status, 0, `${args.join(' ')} unexpectedly succeeded: ${attempt.stdout}`)
    assert.deepEqual(bytes(f), before)
  }
  const oldHook = path.join(plugin, 'hooks/devflow-hook.js')
  const resultHook = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main()', oldHook], { cwd: root,
    encoding: 'utf8', input: JSON.stringify({ hook_event_name: 'Stop', session_id: OWNER, cwd: root }),
    env: { ...process.env, CODEX_THREAD_ID: OWNER }, timeout: 15000 })
  assert.equal(resultHook.status, 0, resultHook.stderr); assert.equal(resultHook.stdout, '')
  assert.deepEqual(bytes(f), before)
  assert.equal(f.record().counts['delivery-1/1'].continue, 1)
})

test('migration requires explicit quiescence and every recorded writer to release, regardless of age', () => {
  const f = fixture({ notes: ['keep'] }), before = bytes(f)
  assert.match(f.cli(['workflow', 'migrate', '1'], f.input).out, /requires --quiescent/)
  assert.deepEqual(bytes(f), before)
  fs.writeFileSync(path.join(f.dir, 'sessions.json'), JSON.stringify({ [state.hashId('other-session')]: { at: '2000-01-01T00:00:00.000Z', host: 'codex' } }))
  const held = bytes(f), result = f.migrate()
  assert.equal(result.code, 1); assert.match(result.out, /recorded writers to release/)
  assert.deepEqual(bytes(f), held)
})

test('running work and unresolved legacy posts refuse migration without dropping user data', () => {
  for (const legacy of [{ running: ['live'] }, { pendingPosts: ['needs human review'] }]) {
    const f = fixture({ ...legacy, notes: ['retain'] }), before = bytes(f), result = f.migrate()
    assert.equal(result.code, 1); assert.match(result.out, /running work.*pending posts/)
    assert.deepEqual(bytes(f), before)
  }
})

for (const destination of ['ledger.json', 'workflow.json']) test(`interrupted migration at ${destination} fails closed and resumes the exact journal`, t => {
  const f = fixture({ notes: ['original bytes survive'], stage: 'design' }), rename = fs.renameSync
  let interrupted = false
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (!interrupted && to === path.join(f.dir, destination)) { interrupted = true; throw Object.assign(new Error('simulated storage interruption'), { code: 'EIO' }) }
    return rename(from, to)
  })
  assert.equal(f.migrate().code, 1); assert.equal(interrupted, true)
  assert.throws(() => f.record(), /migration is incomplete/)
  assert.match(f.cli(['workflow', 'read', '1']).out, /migration is incomplete/)
  assert.equal(fs.readFileSync(path.join(f.dir, 'ledger.v1.json'), 'utf8'), f.original)
  const result = f.migrate()
  assert.equal(result.code, 0, result.out)
  assert.deepEqual(f.record().notes, ['original bytes survive'])
  assert.equal(fs.existsSync(path.join(f.dir, 'workflow.migration.json')), false)
})

test('an interrupted migration will not overwrite a legacy writer that changed state before cutover', t => {
  const f = fixture({ notes: ['original'] }), rename = fs.renameSync
  let interrupted = false
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (!interrupted && to === path.join(f.dir, 'ledger.json')) { interrupted = true; throw Object.assign(new Error('interrupted'), { code: 'EIO' }) }
    return rename(from, to)
  })
  assert.equal(f.migrate().code, 1)
  const changed = '{"notes":["original","late old writer"]}\n'
  fs.writeFileSync(path.join(f.dir, 'ledger.json'), changed)
  const result = f.migrate()
  assert.equal(result.code, 1); assert.match(result.out, /changed after migration preparation/)
  assert.equal(fs.readFileSync(path.join(f.dir, 'ledger.json'), 'utf8'), changed)
  assert.equal(fs.readFileSync(path.join(f.dir, 'ledger.v1.json'), 'utf8'), f.original)
  assert.throws(() => f.record(), /migration is incomplete/)
})

test('migration recovers validated stage and active continuation consumption without retry resets', () => {
  const f = fixture({ stage: 'build', mode: 'autonomous', task: { current: 1, total: 2 }, counts: { 1: { continue: 1 } } })
  delete f.input.stage
  const request = { task: { id: 'task-1', current: 1, total: 2, attempt: 1, criteria: ['AC-one'] }, taskAttemptBase: sha('d') }
  assert.equal(f.migrate(request).code, 0)
  assert.equal(f.record().workflow.stage, 'build')
  const event = JSON.stringify({ hook_event_name: 'Stop', session_id: OWNER, cwd: f.root })
  assert.match(hook.handle(event, f.env), /"decision":"block"/)
  assert.equal(f.record().counts['delivery-1/1'].continue, 2)
  assert.equal(f.step({ action: 'start-task', retry: true, task: { id: 'task-1', current: 1, total: 2, criteria: ['AC-one'] } }).code, 0)
  assert.equal(hook.handle(event, f.env), '')
  assert.equal(f.record().counts['delivery-1/1'].continue, 2)
  const unknown = fixture({ stage: 'build', mode: 'autonomous', task: { current: 1, total: 2 } })
  assert.equal(unknown.migrate({ ...request, stage: 'build' }).code, 0)
  assert.equal(unknown.record().counts['delivery-1/1'].continue, 2)
  assert.equal(unknown.record().continuationMigration.unknown, true)
})

test('generic patches cannot bypass protected control, stale revisions or coordinator ownership', () => {
  const f = migrated({ notes: ['keep'] }), before = fs.readFileSync(path.join(f.dir, 'workflow.json'), 'utf8')
  for (const patch of [{ stage: 'ship' }, { counts: {} }, { workflow: {} }, { schemaVersion: 1 }, { base: sha('e') }]) {
    const result = f.cli(['ledger-update', '1'], { expectedRevision: 1, ...patch })
    assert.equal(result.code, 1, JSON.stringify(patch)); assert.match(result.out, /protected control/)
    assert.equal(fs.readFileSync(path.join(f.dir, 'workflow.json'), 'utf8'), before)
  }
  assert.equal(f.cli(['ledger-update', '1'], { expectedRevision: 1, blocked: ['waiting for a decision'] }).code, 0)
  assert.match(f.cli(['ledger-update', '1'], { expectedRevision: 1, blocked: [] }).out, /revision conflict/)
  f.env.vars.CODEX_THREAD_ID = 'other-owner'
  assert.match(f.step({ action: 'delivery' }).out, /coordinator session/)
  assert.equal(f.cli(['note', '1'], 'independent observation').code, 0)
  assert.ok(f.record().notes.includes('independent observation'))
})

test('the validated workflow supplies the card stage even when the public projection is stale or unavailable', () => {
  const f = migrated()
  const card = f.cli(['card'])
  assert.equal(card.code, 0); assert.match(card.out, /workflow.*design|design.*workflow/i)
  assert.match(card.out, /projection/i)
  f.env.lookupFailure = true
  const offline = f.cli(['card'])
  assert.match(offline.out, /design/); assert.match(offline.out, /unavailable|failed/)
  f.env.lookupFailure = false
  f.env.issue.authorAssociation = 'NONE'; f.env.issue.body = '## 현재 상태\n- 단계: ship'
  const untrusted = f.cli(['card'])
  assert.match(untrusted.out, /design/)
  fs.writeFileSync(path.join(f.dir, 'workflow.json'), '{}')
  const corrupted = f.cli(['card'])
  assert.match(corrupted.out, /Protected workflow is unreadable/)
  assert.doesNotMatch(corrupted.out, /- 단계: ship/)
})

test('routine reads summarize evidence and notes while full reads retain all evidence', () => {
  const f = migrated({ notes: Array.from({ length: 60 }, (_, i) => `retained note ${i}`) })
  for (let i = 0; i < 23; i++) f.proof()
  const compact = JSON.parse(f.cli(['workflow', 'read', '1']).out)
  assert.equal(compact.workflow.evidenceCount, 23); assert.equal(compact.workflow.evidence.length, 20)
  assert.equal(compact.noteCount, 60); assert.equal(compact.notes, undefined)
  assert.equal(compact.workflow.evidence[0].subject, undefined)
  const full = JSON.parse(f.cli(['workflow', 'read', '1', '--full']).out)
  assert.equal(full.record.workflow.evidence.length, 23); assert.equal(full.record.notes.length, 60)
})

test('criteria read preserves meaningful whitespace and check requires an exact applicable receipt', () => {
  const f = migrated(), evidenceId = f.proof()
  assert.match(f.cli(['check', '1', '1']).out, /prepare an applicable/)
  const refs = receipt(f, [f.criteria.criteria[0]], [evidenceId])
  assert.equal(f.prepare('check', '', refs).code, 0)
  const checked = f.cli(['check', '1', '--receipt'], refs)
  assert.equal(checked.code, 0, checked.out); assert.match(f.env.issue.body, /- \[x\] \[AC-one\]/)
  assert.equal(f.record().workflow.pendingEffect, null)
  const prior = f.criteria.criteria[0].definitionRevision
  f.env.issue.body = f.env.issue.body.replace('two  spaces', 'two spaces')
  const changed = JSON.parse(f.cli(['criteria', '1']).out)
  assert.notEqual(changed.criteria[0].definitionRevision, prior)
  assert.equal(f.prepare('check', '', refs).code, 0)
  const writesBefore = writes(f).length, stale = f.cli(['check', '1', '--receipt'], refs)
  assert.equal(stale.code, 1); assert.match(stale.out, /intent revision changed/)
  assert.equal(writes(f).length, writesBefore); assert.equal(f.record().workflow.pendingEffect, null)
})

test('protected intent carry and whole-Issue close use the actual evidence module gates', () => {
  const f = migrated(), proof = f.proof(), selected = receipt(f, [f.criteria.criteria[0]], [proof])
  assert.equal(f.prepare('check', '', selected).code, 0)
  assert.equal(f.cli(['check', '1', '--receipt'], selected).code, 0)
  const all = receipt(f), changed = intent.replace('Keep the exact contract.', 'Clarify the approved contract.')
  assert.equal(f.prepare('intent', changed, all).code, 0)
  const result = f.cli(['intent', '1', '--receipt'], { ...all, text: changed })
  assert.equal(result.code, 0, result.out); assert.match(f.env.issue.body, /- \[x\] \[AC-one\]/)
  // A full Issue close cannot consume evidence for a subset delivery or unchecked remaining criterion.
  const partial = fixture(); partial.input.scope.deliveryCriteria = ['AC-one']
  assert.equal(partial.migrate().code, 0)
  partial.ship()
  const closeReceipt = receipt(partial)
  assert.equal(partial.prepare('close', '', closeReceipt).code, 0)
  const close = partial.cli(['close', '1', '--receipt'], closeReceipt)
  assert.equal(close.code, 1); assert.match(close.out, /checked/)
  assert.equal(writes(partial).length, 0); assert.equal(partial.record().workflow.pendingEffect, null)
})

test('unknown provider result remains pending and blocks duplicate effects but permits independent notes', () => {
  const f = migrated(), comment = '### Checkpoint design — evidence\n- First observation\n- Second observation\n- Third observation\n'
  assert.equal(f.prepare('comment', comment).code, 0)
  f.env.writeFailure = true; f.env.lookupFailure = true
  const result = f.cli(['comment', '1'], comment)
  assert.equal(result.code, 1); assert.equal(f.record().workflow.pendingEffect.status, 'unknown')
  const pending = f.record().workflow.pendingEffect, count = writes(f).length
  assert.equal(f.cli(['comment', '1'], comment).code, 1)
  assert.equal(writes(f).length, count)
  assert.equal(f.cli(['note', '1'], 'independent work can continue').code, 0)
  assert.equal(f.cli(['ledger-update', '1'], { expectedRevision: f.record().workflow.revision, blocked: ['waiting for readback'] }).code, 0)
  const resolve = { expectedRevision: f.record().workflow.revision, id: pending.id, outcome: 'not-applied', ref: 'readback.txt' }
  assert.match(f.cli(['workflow', 'effect', '1', 'resolve'], resolve).out, /reconcil/)
  assert.equal(f.cli(['workflow', 'effect', '1', 'resolve'], { ...resolve, reconciled: true }).code, 0)
})

test('review-only CLI and hooks perform no writes, including notes, environment sharing and session release', () => {
  const f = migrated({ mode: 'autonomous' })
  const envFile = path.join(f.root, 'env-output'), before = bytes(f)
  f.env.vars = { DEVFLOW_REVIEW_ONLY: '1', DEVFLOW_SESSION_ID: OWNER, CLAUDE_ENV_FILE: envFile }
  for (const [args, input] of [
    [['note', '1'], 'read only'], [['ledger-update', '1'], { expectedRevision: 1, notes: ['read only'] }],
    [['running', '1', 'add', 'review', '--expect', '1'], ''], [['mode', '1', 'interactive', '--expect', '1'], 'review only'],
    [['release', '1'], ''], [['workflow', 'effect', '1', 'prepare'], {}], [['comment', '1'], '### Checkpoint design — observation\n- one\n- two\n- three'],
  ]) assert.equal(f.cli(args, input).code, 1, args.join(' '))
  for (const name of ['SessionStart', 'Stop', 'SessionEnd']) hook.handle(JSON.stringify({ hook_event_name: name, cwd: f.root, session_id: OWNER }), f.env)
  assert.deepEqual(bytes(f), before); assert.equal(fs.existsSync(envFile), false); assert.equal(writes(f).length, 0)
  assert.equal(f.cli(['workflow', 'read', '1']).code, 0)
})

test('autonomous protected Issue effects remain refused before invoking the provider', () => {
  const f = migrated()
  const result = f.cli(['mode', '1', 'autonomous', '--expect', String(f.record().workflow.revision)], 'continue local work')
  assert.equal(result.code, 0, result.out)
  assert.match(f.prepare('comment', 'text').out, /autonomous runs perform no external effects/)
  assert.equal(f.cli(['comment', '1'], '### Checkpoint design — observation\n- one\n- two\n- three').code, 1)
  assert.equal(writes(f).length, 0)
})

test('review-package CLI creates one private bounded artifact outside the tree and prints no file blobs', () => {
  const root = gitRepo(), head = git(root, ['rev-parse', 'HEAD']), output = path.join(tmpdir('devflow-review-output-'), 'package.json')
  const result = state.main(['review-package', head, head, '--owned-clean-snapshot', '--out', output], () => '', undefined, root)
  assert.equal(result.code, 0, result.out)
  const summary = JSON.parse(result.out), data = JSON.parse(fs.readFileSync(output))
  assert.equal(summary.artifact, output); assert.equal(summary.bytes, fs.statSync(output).size)
  assert.equal(summary.sha256, digest(fs.readFileSync(output)))
  assert.ok(result.out.length < 5000); assert.equal(summary.baseFiles, undefined); assert.equal(summary.dirtyCoverage, false)
  assert.ok(data.scope)
  if (process.platform !== 'win32') assert.equal(fs.statSync(output).mode & 0o777, 0o600)
  assert.equal(state.main(['review-package', head, head, '--owned-clean-snapshot', '--out', output], () => '', undefined, root).code, 1)
  const subdir = path.join(root, 'sub'); fs.mkdirSync(subdir)
  const unsafe = state.main(['review-package', head, head, '--owned-clean-snapshot', '--out', path.join(root, 'package.json')], () => '', undefined, subdir)
  assert.equal(unsafe.code, 1); assert.match(unsafe.out, /outside the snapshot/)
  assert.equal(fs.existsSync(path.join(root, 'package.json')), false)
})

function ownershipRequest(f, extra = {}) {
  const current = f.record().workflow
  return { expectedRevision: current.revision, identity: current.identity, expectedOwner: current.owner,
    reason: 'confirmed coordinator handoff', ...extra }
}

test('protected release is revision guarded and a new session claims canonical state without an activity entry', () => {
  const f = migrated({ notes: ['preserve this observation'] })
  assert.equal(fs.existsSync(path.join(f.dir, 'sessions.json')), false)
  const before = f.record()
  assert.equal(f.cli(['release', '1']).code, 1)
  assert.deepEqual(f.record(), before)
  assert.equal(f.cli(['release', '1', '--expect', String(before.workflow.revision)]).code, 0)
  assert.equal(f.record().workflow.relinquished.owner, before.workflow.owner)
  assert.match(f.step({ action: 'delivery' }).out, /released/)
  assert.match(f.cli(['card']).out, /Coordinator: released/)
  f.env.vars.CODEX_THREAD_ID = 'new-coordinator'
  const request = ownershipRequest(f, { action: 'claim' })
  assert.equal(f.cli(['workflow', 'transition', '1'], { ...request, identity: { ...request.identity, delivery: 'wrong-delivery' } }).code, 1)
  assert.equal(f.cli(['workflow', 'transition', '1'], { ...request, expectedRevision: request.expectedRevision - 1 }).code, 1)
  assert.equal(f.cli(['workflow', 'transition', '1'], request).code, 0)
  assert.equal(f.record().workflow.owner, state.sessionId(f.env.vars).hash)
  assert.equal(f.record().workflow.relinquished, null)
  assert.equal(f.record().workflow.stage, before.workflow.stage)
  assert.deepEqual(f.record().workflow.scope, before.workflow.scope)
  assert.deepEqual(f.record().notes, before.notes)
  assert.equal(f.record().workflow.deliveryBase, before.workflow.deliveryBase)
  assert.equal(f.step({ action: 'delivery' }).code, 0)
  f.env.vars.CODEX_THREAD_ID = OWNER
  assert.match(f.step({ action: 'return', stage: 'design', reason: 'old owner cannot repair' }).out, /coordinator/)
})

test('normal coordinator handoff preserves an active attempt and consumed continuation budget', () => {
  const f = fixture({ stage: 'build', mode: 'autonomous', task: { current: 1, total: 2 }, counts: { 1: { continue: 2 } } })
  assert.equal(f.migrate({ stage: 'build', task: { id: 'task-1', current: 1, total: 2, attempt: 3, criteria: ['AC-one'] }, taskAttemptBase: sha('d') }).code, 0)
  f.proof()
  const before = f.record()
  assert.equal(f.cli(['release', '1', '--expect', String(before.workflow.revision)]).code, 0)
  f.env.vars.CODEX_THREAD_ID = 'resuming-coordinator'
  assert.equal(f.step(ownershipRequest(f, { action: 'claim' })).code, 0)
  const after = f.record()
  for (const key of ['task', 'taskAttemptBase', 'deliveryBase', 'evidence', 'taskAttempts']) assert.deepEqual(after.workflow[key], before.workflow[key], key)
  assert.deepEqual(after.counts, before.counts)
  assert.equal(hook.handle(JSON.stringify({ hook_event_name: 'Stop', session_id: 'resuming-coordinator', cwd: f.root }), f.env), '')
  assert.equal(f.record().counts['delivery-1/1'].continue, 2)
})

test('release refuses outstanding worker labels and effects without discarding control state', () => {
  const f = migrated()
  assert.equal(f.cli(['running', '1', 'add', 'worker', '--expect', String(f.record().workflow.revision)]).code, 0)
  const active = f.record()
  assert.equal(f.cli(['release', '1', '--expect', String(active.workflow.revision)]).code, 1)
  assert.deepEqual(f.record(), active)
  assert.equal(f.cli(['running', '1', 'done', 'worker', '--expect', String(active.workflow.revision)]).code, 0)
  assert.equal(f.prepare('comment', 'prepared text').code, 0)
  const pending = f.record()
  assert.equal(f.cli(['release', '1', '--expect', String(pending.workflow.revision)]).code, 1)
  assert.deepEqual(f.record(), pending)
})

test('quiescent owner recovery preserves uncertainty and grants reconciliation without effect replay', () => {
  const f = migrated(), comment = '### Checkpoint design — evidence\n- First observation\n- Second observation\n- Third observation\n'
  assert.equal(f.cli(['running', '1', 'add', 'worker', '--expect', String(f.record().workflow.revision)]).code, 0)
  assert.equal(f.prepare('comment', comment).code, 0)
  f.env.writeFailure = true; f.env.lookupFailure = true
  assert.equal(f.cli(['comment', '1'], comment).code, 1)
  const old = f.record(), providerCalls = writes(f).length
  assert.equal(old.workflow.pendingEffect.status, 'unknown')
  f.env.vars.CODEX_THREAD_ID = 'recovery-coordinator'
  const request = ownershipRequest(f, { ref: '.work/devflow/i1/confirmed-exit-and-provider-readback.txt' })
  assert.match(f.cli(['workflow', 'recover', '1'], request).out, /quiescent/)
  assert.equal(f.cli(['workflow', 'recover', '1', '--quiescent'], { ...request, expectedOwner: '0'.repeat(12) }).code, 1)
  assert.equal(f.cli(['workflow', 'recover', '1', '--quiescent'], { ...request, ref: '' }).code, 1)
  assert.deepEqual(f.record(), old)
  assert.equal(f.cli(['workflow', 'recover', '1', '--quiescent'], request).code, 0)
  const recovered = f.record()
  assert.deepEqual(recovered.running, old.running)
  assert.deepEqual(recovered.workflow.pendingEffect, old.workflow.pendingEffect)
  assert.equal(recovered.workflow.recovery.previousOwner, old.workflow.owner)
  assert.equal(recovered.workflow.owner, state.sessionId(f.env.vars).hash)
  assert.equal(f.cli(['note', '1'], 'independent inspection continues').code, 0)
  assert.equal(f.cli(['ledger-update', '1'], { expectedRevision: f.record().workflow.revision, blocked: ['readback required'] }).code, 0)
  assert.equal(f.step({ action: 'delivery' }).code, 1)
  assert.equal(f.cli(['comment', '1'], comment).code, 1)
  assert.equal(writes(f).length, providerCalls)
  assert.equal(f.cli(['running', '1', 'add', 'new-worker', '--expect', String(f.record().workflow.revision)]).code, 1)
  assert.equal(f.cli(['mode', '1', 'autonomous', '--expect', String(f.record().workflow.revision)], 'resume work').code, 1)
  assert.equal(f.step(ownershipRequest(f, { action: 'resume-owner' })).code, 1)
  const resolution = { expectedRevision: f.record().workflow.revision, id: recovered.workflow.pendingEffect.id,
    outcome: 'not-applied', ref: '.work/devflow/i1/provider-readback.txt' }
  assert.equal(f.cli(['workflow', 'effect', '1', 'resolve'], resolution).code, 1)
  assert.equal(f.cli(['workflow', 'effect', '1', 'resolve'], { ...resolution, reconciled: true }).code, 0)
  assert.equal(f.step(ownershipRequest(f, { action: 'resume-owner' })).code, 1)
  assert.equal(f.cli(['running', '1', 'done', 'worker', '--expect', String(f.record().workflow.revision)]).code, 0)
  assert.equal(f.step(ownershipRequest(f, { action: 'resume-owner' })).code, 0)
  assert.equal(f.record().workflow.recovery, null)
  assert.equal(f.record().workflow.pendingEffect, null)
  assert.equal(f.record().workflow.ownershipHistory.at(-1).kind, 'resume')
  assert.equal(f.step({ action: 'delivery' }).code, 0)
  f.env.vars.CODEX_THREAD_ID = OWNER
  assert.equal(f.step({ action: 'return', stage: 'design', reason: 'stale coordinator' }).code, 1)
})

test('recovery holds even a prepared effect and SessionEnd never fabricates canonical release', () => {
  const f = migrated()
  assert.equal(f.cli(['note', '1'], 'register activity').code, 0)
  assert.equal(f.prepare('comment', 'prepared text').code, 0)
  const old = f.record()
  hook.handle(JSON.stringify({ hook_event_name: 'SessionEnd', session_id: OWNER, cwd: f.root }), f.env)
  assert.deepEqual(f.record(), old)
  f.env.vars.CODEX_THREAD_ID = 'after-session-end'
  assert.equal(f.step(ownershipRequest(f, { action: 'claim' })).code, 1)
  assert.equal(f.cli(['workflow', 'recover', '1', '--quiescent'], ownershipRequest(f, { ref: 'confirmed-exit.txt' })).code, 0)
  const resolution = { expectedRevision: f.record().workflow.revision, id: f.record().workflow.pendingEffect.id,
    outcome: 'not-applied', ref: 'confirmed-no-provider-call.txt' }
  assert.equal(f.cli(['workflow', 'effect', '1', 'resolve'], resolution).code, 1)
  assert.equal(f.cli(['workflow', 'effect', '1', 'resolve'], { ...resolution, reconciled: true }).code, 0)
  const before = bytes(f)
  f.env.vars.DEVFLOW_REVIEW_ONLY = '1'
  assert.equal(f.step(ownershipRequest(f, { action: 'resume-owner' })).code, 1)
  assert.equal(f.cli(['workflow', 'recover', '1', '--quiescent'], ownershipRequest(f, { ref: 'exit.txt' })).code, 1)
  assert.deepEqual(bytes(f), before)
})

test('workflow evidence accepts reordered JSON object properties without changing array meaning', () => {
  const f = migrated()
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)])) : value
  const subject = w.subject(f.record(), 'delivery', f.env.head)
  const evidence = { id: 'reordered', kind: 'verification', scope: 'delivery', ref: 'report.json', lifecycle: 'completed', verdict: 'PASS',
    subject: reorder(subject), criteria: ['AC-one', 'AC-two'], checks: ['focused'], perspectives: [], exitCode: 0 }
  assert.equal(f.cli(['workflow', 'evidence', '1'], { expectedRevision: f.record().workflow.revision, evidence }).code, 0)
  assert.equal(f.step({ action: 'delivery' }).code, 0)
  assert.equal(f.step({ stage: 'review' }).code, 0)
})

test('return and strategy changes retain attempt identity and reopen architectural planning', () => {
  const f = migrated(), task = { id: 'task-1', current: 1, total: 1, criteria: ['AC-one'] }
  assert.equal(f.step({ action: 'start-task', task }).code, 0)
  const originalBase = f.record().workflow.deliveryBase
  assert.equal(f.step({ action: 'return', stage: 'design', reason: 'design needs repair' }).code, 0)
  assert.equal(f.step({ action: 'start-task', task }).code, 0)
  assert.equal(f.record().workflow.task.attempt, 2)
  assert.equal(f.record().workflow.deliveryBase, originalBase)
  assert.equal(f.step({ action: 'configure', path: 'architectural', runMode: 'M2', reason: 'broader dependency discovered' }).code, 0)
  assert.equal(f.record().workflow.stage, 'design')
  assert.equal(f.step({ action: 'start-task', task }).code, 1)
  assert.equal(f.step({ action: 'delivery' }).code, 1)
  assert.equal(f.step({ stage: 'plan' }).code, 0)
  assert.equal(f.step({ action: 'start-task', task }).code, 0)
  assert.equal(f.record().workflow.task.attempt, 3)
  assert.equal(f.record().workflow.configurationChanges.length, 1)
})

test('next delivery retains acceptance provenance and cannot reuse the prior delivery receipts', () => {
  const f = migrated()
  f.ship()
  const accepted = f.record(), proofIds = accepted.workflow.evidence.map(e => e.id)
  assert.equal(f.prepare('integrate').code, 0)
  const pending = f.record().workflow.pendingEffect
  assert.equal(f.cli(['workflow', 'effect', '1', 'resolve'], { expectedRevision: f.record().workflow.revision,
    id: pending.id, outcome: 'succeeded', ref: 'integration-readback.txt', result: { ref: f.input.integrationTarget.ref, sha: sha('e') } }).code, 0)
  f.env.head = sha('e')
  assert.equal(f.step({ stage: 'cleanup' }).code, 0)
  const result = f.step({ action: 'next-delivery', delivery: 'delivery-2', deliveryBase: sha('e'),
    scope: { ...f.input.scope, revision: 2 }, integrationTarget: { ref: f.input.integrationTarget.ref, sha: sha('e') } })
  assert.equal(result.code, 0, result.out)
  const next = f.record(), archive = next.workflow.completedDeliveries[0]
  assert.deepEqual(archive.scope, accepted.workflow.scope)
  assert.equal(archive.finalHead, accepted.workflow.evidence[0].subject.head)
  assert.equal(archive.inputsDigest, accepted.workflow.inputsDigest)
  assert.ok(proofIds.every(id => archive.evidence.some(e => e.id === id && e.ref)))
  assert.equal(next.workflow.evidence.length, 0)
  assert.equal(f.step({ action: 'delivery' }).code, 0)
  assert.equal(f.step({ stage: 'review' }).code, 1)
  const oldProof = accepted.workflow.evidence[0]
  assert.equal(f.cli(['workflow', 'evidence', '1'], { expectedRevision: f.record().workflow.revision, evidence: oldProof }).code, 1)
})

test('migration refuses to discard an existing active task or its consumed continuation budget', () => {
  const f = fixture({ task: { current: 1, total: 2 }, counts: { 1: { continue: 2 } } })
  assert.match(f.migrate().out, /recover the existing active task/)
  assert.equal(fs.readFileSync(path.join(f.dir, 'ledger.json'), 'utf8'), f.original)
  assert.equal(fs.existsSync(path.join(f.dir, 'workflow.json')), false)
})

test('conditional-delete CLI consumes exactly the prepared destination, ref and OID', t => {
  const io = require('../bin/lib/evidence'), f = migrated()
  f.ship()
  const payload = { remote: 'origin', ref: 'refs/heads/feat/1-x', expectedOid: sha('d'),
    expectedDestination: 'ssh://git@example.invalid/approved.git' }
  let destination = payload.expectedDestination
  const mutations = []
  t.mock.method(io, 'resolveDeleteDestination', ({ cwd, remote }) => {
    assert.equal(cwd, f.root); assert.equal(remote, 'origin')
    return { remote, destination }
  })
  t.mock.method(io, 'conditionalDelete', request => { mutations.push(request); return { code: 0, deleted: true } })
  const prepare = f.cli(['workflow', 'effect', '1', 'prepare'], {
    expectedRevision: f.record().workflow.revision,
    effect: { id: 'delete-exact-branch', kind: 'branch-delete', target: `git:${payload.remote}:${payload.ref}`,
      payloadDigest: w.digest(payload), payload } })
  assert.equal(prepare.code, 0, prepare.out)
  const prepared = f.record()
  assert.deepEqual(prepared.workflow.pendingEffect.payload, payload)
  for (const patch of [
    { expectedDestination: 'ssh://git@example.invalid/another.git' },
    { ref: 'refs/heads/another' }, { expectedOid: sha('e') },
  ]) {
    const altered = { ...payload, ...patch }
    // A new destination matching current configuration still cannot replace the approved destination.
    destination = altered.expectedDestination
    const result = f.cli(['conditional-delete', '1'], altered)
    assert.equal(result.code, 1, result.out)
    assert.match(result.out, /prepare an applicable branch-delete effect/)
    assert.deepEqual(f.record(), prepared)
    assert.equal(mutations.length, 0)
  }
  destination = payload.expectedDestination
  const result = f.cli(['conditional-delete', '1'], payload)
  assert.equal(result.code, 0, result.out)
  assert.deepEqual(mutations, [{ cwd: f.root, ...payload }])
  assert.equal(f.record().workflow.pendingEffect, null)
  assert.match(f.record().notes.at(-1), /effect delete-exact-branch succeeded/)
  assert.equal(f.cli(['conditional-delete', '1'], payload).code, 1)
  assert.equal(mutations.length, 1, 'a completed effect cannot be replayed')
})

test('conditional-delete destination drift retains the intent and an uncertain write requires reconciliation', t => {
  const io = require('../bin/lib/evidence'), f = migrated()
  f.ship()
  const payload = { remote: 'origin', ref: 'refs/heads/feat/1-x', expectedOid: sha('d'),
    expectedDestination: 'ssh://git@example.invalid/approved.git' }
  let destination = payload.expectedDestination, calls = 0
  t.mock.method(io, 'resolveDeleteDestination', ({ remote }) => ({ remote, destination }))
  t.mock.method(io, 'conditionalDelete', request => {
    calls++; assert.deepEqual(request, { cwd: f.root, ...payload })
    throw new Error('transport result cannot be observed')
  })
  const request = { expectedRevision: f.record().workflow.revision,
    effect: { id: 'delete-drift-branch', kind: 'branch-delete', target: `git:${payload.remote}:${payload.ref}`,
      payloadDigest: w.digest(payload), payload } }
  destination = 'ssh://git@example.invalid/unapproved.git'
  const original = f.record()
  assert.match(f.cli(['workflow', 'effect', '1', 'prepare'], request).out, /destination changed before preparation/)
  assert.deepEqual(f.record(), original)
  destination = payload.expectedDestination
  assert.equal(f.cli(['workflow', 'effect', '1', 'prepare'], request).code, 0)
  const prepared = f.record()
  destination = 'ssh://git@example.invalid/unapproved.git'
  assert.match(f.cli(['conditional-delete', '1'], payload).out, /destination changed after preparation/)
  assert.deepEqual(f.record(), prepared)
  assert.equal(calls, 0)
  destination = payload.expectedDestination
  assert.match(f.cli(['conditional-delete', '1'], payload).out, /write result unknown/)
  const unknown = f.record()
  assert.equal(unknown.workflow.pendingEffect.status, 'unknown')
  assert.deepEqual(unknown.workflow.pendingEffect.payload, payload)
  assert.equal(calls, 1)
  assert.equal(f.cli(['conditional-delete', '1'], payload).code, 1)
  assert.equal(calls, 1, 'unknown deletion cannot be replayed')
  const resolution = { expectedRevision: unknown.workflow.revision, id: 'delete-drift-branch',
    outcome: 'not-applied', ref: 'authoritative-remote-readback.txt' }
  assert.equal(f.cli(['workflow', 'effect', '1', 'resolve'], resolution).code, 1)
  assert.deepEqual(f.record(), unknown)
  assert.equal(f.cli(['workflow', 'effect', '1', 'resolve'], { ...resolution, reconciled: true }).code, 0)
  assert.equal(f.record().workflow.pendingEffect, null)
})

for (const unit of ['x', '\u00e9']) test(`migration refuses oversized canonical UTF-8 bytes before creating a backup (${unit.charCodeAt(0)})`, () => {
  const limit = 1 << 20, note = unit.repeat(Math.floor((limit - 100) / Buffer.byteLength(unit)))
  const f = fixture({ notes: [note] }), before = bytes(f)
  assert.ok(Buffer.byteLength(f.original) < limit, 'the existing legacy ledger fits its read limit')
  assert.equal(f.record().notes[0], note)
  const result = f.migrate()
  assert.equal(result.code, 1, result.out)
  assert.match(result.out, /migration canonical record.*1 MiB/)
  assert.deepEqual(bytes(f), before, 'preflight must preserve the original bytes without backup, journal or tombstone')
  assert.equal(f.record().notes[0], note)
})

test('migration refuses an oversized recovery journal even when the canonical record fits', () => {
  const limit = 1 << 20, f = fixture({ notes: [''] })
  const context = state.workflowContext(state.repoContext(f.env, f.root), 1)
  const empty = w.initial({ notes: [''] }, f.input, context)
  const overhead = Buffer.byteLength(JSON.stringify(empty, null, 2) + '\n')
  const note = 'x'.repeat(limit - overhead - 16)
  const legacy = { notes: [note] }
  const canonical = JSON.stringify(w.initial(legacy, f.input, context), null, 2) + '\n'
  assert.equal(Buffer.byteLength(canonical), limit - 16)
  f.original = JSON.stringify(legacy, null, 2) + '\n'
  fs.writeFileSync(path.join(f.dir, 'ledger.json'), f.original)
  const before = bytes(f), result = f.migrate()
  assert.equal(result.code, 1, result.out)
  assert.match(result.out, /migration recovery journal.*1 MiB/)
  assert.deepEqual(bytes(f), before)
  assert.equal(f.record().notes[0], note)
})

test('a near-limit migration journal remains readable and resumes after an interrupted cutover', t => {
  const limit = 1 << 20, note = 'x'.repeat(limit - 16384), f = fixture({ notes: [note] })
  const rename = fs.renameSync, journal = path.join(f.dir, 'workflow.migration.json')
  let interrupted = false
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (!interrupted && to === path.join(f.dir, 'ledger.json')) {
      interrupted = true
      throw Object.assign(new Error('cutover interrupted after journal preparation'), { code: 'EIO' })
    }
    return rename(from, to)
  })
  assert.equal(f.migrate().code, 1)
  assert.equal(interrupted, true)
  assert.equal(fs.readFileSync(path.join(f.dir, 'ledger.json'), 'utf8'), f.original)
  assert.equal(fs.readFileSync(path.join(f.dir, 'ledger.v1.json'), 'utf8'), f.original)
  assert.ok(fs.statSync(journal).size < limit)
  assert.ok(fs.statSync(journal).size > limit - 16384)
  assert.throws(() => f.record(), /migration is incomplete/)
  const result = f.migrate()
  assert.equal(result.code, 0, result.out)
  assert.equal(f.record().notes[0], note)
  assert.ok(fs.statSync(path.join(f.dir, 'workflow.json')).size <= limit)
  assert.equal(fs.existsSync(journal), false)
})

for (const kind of ['different bytes', 'oversized bytes']) test(`migration retains its journal when canonical readback has ${kind}`, t => {
  const f = fixture({ notes: ['preserve the source'] }), rename = fs.renameSync
  const current = path.join(f.dir, 'workflow.json'), journal = path.join(f.dir, 'workflow.migration.json')
  let changed = false
  t.mock.method(fs, 'renameSync', (from, to) => {
    const result = rename(from, to)
    if (!changed && to === current) {
      changed = true
      fs.appendFileSync(to, kind === 'different bytes' ? ' ' : 'x'.repeat(1 << 20))
    }
    return result
  })
  const result = f.migrate()
  assert.equal(changed, true)
  assert.equal(result.code, 1, result.out)
  assert.match(result.out, kind === 'different bytes' ? /differs from the migration journal/ : /within its size limit/)
  assert.equal(fs.existsSync(journal), true, 'unverified canonical bytes cannot complete cutover')
  assert.equal(fs.readFileSync(path.join(f.dir, 'ledger.v1.json'), 'utf8'), f.original)
  assert.throws(() => f.record(), /migration is incomplete/)
  const before = bytes(f)
  assert.equal(f.migrate().code, 1, 'recovery cannot overwrite a different canonical file')
  assert.deepEqual(bytes(f), before)
})

test('migration readback failure retains a recoverable journal after canonical creation', t => {
  const f = fixture({ notes: ['source survives readback interruption'] }), open = fs.openSync
  const current = path.join(f.dir, 'workflow.json'), journal = path.join(f.dir, 'workflow.migration.json')
  let failRead = true
  t.mock.method(fs, 'openSync', (file, ...args) => {
    if (file === current && failRead) {
      failRead = false
      throw Object.assign(new Error('canonical readback temporarily unavailable'), { code: 'EIO' })
    }
    return open(file, ...args)
  })
  const result = f.migrate()
  assert.equal(result.code, 1, result.out)
  assert.equal(failRead, false, 'fresh canonical bytes must be read back')
  assert.equal(fs.existsSync(journal), true)
  assert.throws(() => f.record(), /migration is incomplete/)
  const canonical = fs.readFileSync(current, 'utf8')
  const resumed = f.migrate()
  assert.equal(resumed.code, 0, resumed.out)
  assert.equal(fs.readFileSync(current, 'utf8'), canonical)
  assert.equal(f.record().notes[0], 'source survives readback interruption')
  assert.equal(fs.existsSync(journal), false)
})

function autonomousTask() {
  const f = migrated()
  const mode = f.cli(['mode', '1', 'autonomous', '--expect', String(f.record().workflow.revision)], 'continue authorized local work')
  assert.equal(mode.code, 0, mode.out)
  const task = f.step({ action: 'start-task', task: { id: 'task-1', current: 1, total: 1, criteria: ['AC-one'] } })
  assert.equal(task.code, 0, task.out)
  return f
}

for (const changed of ['repository', 'Issue', 'workspace']) test(`protected Stop refuses changed ${changed} identity without consuming continuation`, t => {
  const f = autonomousTask(), run = f.env.run
  let root = f.root, issue = 1
  if (changed === 'workspace') {
    root = tmpdir('devflow-moved-workflow-')
    fs.writeFileSync(path.join(root, '.devflow.json'), '{}')
    fs.cpSync(path.join(f.root, '.work'), path.join(root, '.work'), { recursive: true })
  }
  if (changed === 'Issue') {
    issue = 2
    fs.cpSync(f.dir, path.join(f.root, '.work/devflow/i2'), { recursive: true })
  }
  t.mock.method(f.env, 'run', function(cmd, args, options) {
    const command = args.join(' ')
    if (cmd === 'git' && command === 'remote get-url origin' && changed === 'repository') return ok('https://github.com/o/other.git\n')
    if (cmd === 'git' && command === 'branch --show-current' && changed === 'Issue') return ok('feat/2-x\n')
    if (cmd === 'git' && command === 'rev-parse --show-toplevel' && changed === 'workspace') return ok(root + '\n')
    return run.call(this, cmd, args, options)
  })
  const current = { dir: path.join(root, `.work/devflow/i${issue}`) }, before = bytes(current), original = bytes(f)
  const read = state.main(['workflow', 'read', String(issue)], () => '', f.env, root)
  assert.equal(read.code, 1)
  assert.match(read.out, /identity mismatch/)
  const result = hook.handle(JSON.stringify({ hook_event_name: 'Stop', session_id: OWNER, cwd: root }), f.env)
  assert.equal(result, '')
  assert.deepEqual(bytes(current), before)
  assert.deepEqual(bytes(f), original)
})

test('protected Stop validates full identity under the lock and retains bounded continuation for the matching task', t => {
  const f = autonomousTask(), matches = w.contextMatches, before = f.record()
  let checks = 0
  t.mock.method(w, 'contextMatches', (record, context, ...args) => {
    checks++
    assert.equal(fs.lstatSync(path.join(f.dir, 'ledger.lock')).isDirectory(), true)
    assert.equal(context.repo, before.workflow.identity.repo)
    assert.equal(context.issue, 1)
    assert.equal(context.workspace, before.workflow.identity.workspace)
    assert.equal(context.session, before.workflow.owner)
    assert.equal(Object.hasOwn(context, 'head'), false, 'continuation identity needs no exact commit lookup')
    return matches(record, context, ...args)
  })
  const event = JSON.stringify({ hook_event_name: 'Stop', session_id: OWNER, cwd: f.root })
  assert.equal(JSON.parse(hook.handle(event, f.env)).decision, 'block')
  assert.equal(f.record().workflow.revision, before.workflow.revision + 1)
  assert.equal(f.record().counts['delivery-1/1'].continue, 1)
  assert.equal(JSON.parse(hook.handle(event, f.env)).decision, 'block')
  const exhausted = bytes(f)
  assert.equal(hook.handle(event, f.env), '')
  assert.deepEqual(bytes(f), exhausted)
  assert.equal(checks, 3)
})
