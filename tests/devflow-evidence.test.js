'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const zlib = require('node:zlib')
const tmpdir = require('./tmpdir')
const { criteriaSnapshot, criteriaSelection, criteriaGate, carryCriteriaChecks, reviewPackage, resolveDeleteDestination, conditionalDelete } = require('../bin/lib/evidence')

// This fixture supplies the existing criteria parser's small output contract. Markdown parsing stays in devflow-state.
function snapshot(lines, context = 'Expected result', state = 'Ready') {
  const body = `## 기대 결과\n${context}\n\n## 수용 기준\n${lines.join('\n')}\n\n## 현재 상태\n${state}\n`
  const parsed = { plain: true, boxes: [] }
  const pattern = /^- \[([ xX])\] (.+)$/gm
  let match
  while ((match = pattern.exec(body))) parsed.boxes.push({ at: match.index + 3, checked: match[1] !== ' ' })
  const intentEnd = body.indexOf('## 현재 상태')
  for (const [index, box] of parsed.boxes.entries()) {
    box.end = parsed.boxes[index + 1]?.at - 3 || intentEnd
    box.raw = body.slice(box.at + 2, box.end)
    box.text = box.raw.replace(/\s+/g, ' ').trim()
  }
  return { body, parsed, value: criteriaSnapshot({ body, parsed, intentEnd }) }
}
const refs = value => value.criteria.map(({ id, definitionRevision }) => ({ id, definitionRevision }))
const select = (value, selectors, expectedIntentRevision = value.intentRevision) => criteriaSelection({ snapshot: value, selectors, expectedIntentRevision })

test('stable AC identities survive reorder while stale ordinal intent is refused', () => {
  const previous = snapshot(['- [x] AC-read: Read exact source', '- [ ] [AC-write] Write one approved result']).value
  const next = snapshot(['- [ ] [AC-write] Write one approved result', '- [ ] AC-read: Read exact source']).value
  assert.notEqual(previous.intentRevision, next.intentRevision)
  assert.equal(select(next, [1], previous.intentRevision).guard, 'criteria-stale')
  assert.equal(select(next, ['AC-read'], previous.intentRevision).guard, 'criteria-stale')
  assert.equal(select(next, ['AC-read']).criteria[0].ordinal, 2)
  assert.deepEqual(carryCriteriaChecks({ previous, next, trusted: true }).carried.map(({ from, to }) => [from.ordinal, to.ordinal]), [[1, 2]])
})

test('definition change invalidates receipts and does not carry a checked stable ID', () => {
  const previous = snapshot(['- [x] AC-read: Read exact source']).value
  const next = snapshot(['- [x] AC-read: Read exact source and tests']).value
  assert.notEqual(previous.criteria[0].definitionRevision, next.criteria[0].definitionRevision)
  assert.equal(criteriaGate({ snapshot: next, expectedIntentRevision: next.intentRevision, criteriaRefs: refs(previous) }).guard, 'criteria-selector')
  assert.deepEqual(carryCriteriaChecks({ previous, next, trusted: true }), { carried: [], dropped: [1] })
})

test('legacy selectors are unique and bound to the exact intent revision', () => {
  const previous = snapshot(['- [x] Read exact source', '- [ ] Write result']).value
  const next = snapshot(['- [ ] Write result', '- [ ] Read exact source']).value
  assert.notEqual(previous.criteria[0].id, next.criteria[1].id)
  assert.equal(select(next, [previous.criteria[0].id]).guard, 'criteria-selector')
  assert.equal(select(next, [1], previous.intentRevision).guard, 'criteria-stale')
  assert.deepEqual(carryCriteriaChecks({ previous, next, trusted: true }).carried.map(({ to }) => to.ordinal), [2])
  assert.equal(snapshot(['- [x] Duplicate', '- [ ] Duplicate']).value.guard, 'criteria-ambiguous')
})

test('same-definition explicit IDs remain distinct and legacy reuse retains ordinary prose line wrapping', () => {
  const distinct = snapshot(['- [x] AC-one: Same text', '- [x] AC-two: Same text']).value
  assert.equal(distinct.criteria.length, 2)
  assert.equal(snapshot(['- [ ] AC-one: First', '- [ ] AC-one: Second']).value.guard, 'criteria-ambiguous')
  const previous = snapshot(['- [x] Wrapped\ncriterion']).value
  const next = snapshot(['- [ ] Wrapped criterion']).value
  assert.equal(carryCriteriaChecks({ previous, next, trusted: true }).carried.length, 1)
  assert.equal(carryCriteriaChecks({ previous, next, trusted: false }).carried.length, 0)
})

test('raw definitions invalidate changed literal whitespace despite parser normalization', () => {
  for (const prefix of ['AC-literal: ', '']) {
    const previous = snapshot([`- [x] ${prefix}Output must be \"a  b\"`]).value
    const next = snapshot([`- [x] ${prefix}Output must be \"a b\"`]).value
    assert.equal(previous.criteria[0].text, next.criteria[0].text)
    assert.notEqual(previous.criteria[0].definitionRevision, next.criteria[0].definitionRevision)
    assert.equal(criteriaGate({ snapshot: next, expectedIntentRevision: next.intentRevision, criteriaRefs: refs(previous) }).guard, 'criteria-selector')
    assert.deepEqual(carryCriteriaChecks({ previous, next, trusted: true }), { carried: [], dropped: [1] })
  }
  const quoted = snapshot(['- [x] Output must be "a\nb"']).value
  const joined = snapshot(['- [ ] Output must be "a b"']).value
  assert.equal(carryCriteriaChecks({ previous: quoted, next: joined, trusted: true }).carried.length, 0)
  const spaces = snapshot(['- [x] Output  words']).value
  const collapsed = snapshot(['- [ ] Output words']).value
  assert.equal(carryCriteriaChecks({ previous: spaces, next: collapsed, trusted: true }).carried.length, 0)
})

test('parsers without raw spans conservatively bind definitions to the whole intent', () => {
  const before = snapshot(['- [x] AC-one: Same text'])
  const after = snapshot(['- [ ] AC-one: Same text'], 'Changed context')
  for (const fixture of [before, after]) {
    for (const box of fixture.parsed.boxes) { delete box.raw; delete box.end }
    fixture.value = criteriaSnapshot({ body: fixture.body, parsed: fixture.parsed, intentEnd: fixture.body.indexOf('## 현재 상태') })
    assert.equal(fixture.value.criteria[0].definitionSource, 'intent')
  }
  assert.deepEqual(carryCriteriaChecks({ previous: before.value, next: after.value, trusted: true }), { carried: [], dropped: [1] })
  const mismatched = snapshot(['- [ ] AC-one: Same text'])
  mismatched.parsed.boxes[0].raw = ' AC-one: Different text\n\n'
  assert.equal(criteriaSnapshot({ body: mismatched.body, parsed: mismatched.parsed }).guard, 'criteria-input')
})

test('checkbox and state writes preserve intent revision but exact body revisions change', () => {
  const previous = snapshot(['- [ ] AC-one: Criterion'], 'Expected result', 'Ready').value
  const next = snapshot(['- [x] AC-one: Criterion'], 'Expected result', 'Reviewed').value
  assert.equal(previous.intentRevision, next.intentRevision)
  assert.notEqual(previous.bodyRevision, next.bodyRevision)
  assert.notEqual(next.intentRevision, snapshot(['- [x] AC-one: Criterion'], 'Changed intent').value.intentRevision)
})

test('close gate requires full current identity, definition, intent, and checked coverage', () => {
  const value = snapshot(['- [x] AC-one: First', '- [ ] AC-two: Second']).value
  assert.equal(criteriaGate({ snapshot: value, expectedIntentRevision: value.intentRevision, criteriaRefs: refs(value) }).guard, 'criteria-unchecked')
  assert.equal(criteriaGate({ snapshot: value, expectedIntentRevision: value.intentRevision, criteriaRefs: refs(value).slice(0, 1) }).guard, 'criteria-incomplete')
  assert.equal(criteriaGate({ snapshot: value, expectedIntentRevision: value.intentRevision, criteriaRefs: ['AC-one'] }).guard, 'criteria-evidence')
  assert.equal(select(value, [1], '').guard, 'criteria-stale')
  assert.equal(select(value, [1, 1]).guard, 'criteria-selector')
  const done = snapshot(['- [x] AC-one: First', '- [x] AC-two: Second']).value
  assert.equal(criteriaGate({ snapshot: done, expectedIntentRevision: done.intentRevision, criteriaRefs: refs(done) }).ok, true)
})

test('snapshot refuses missing, unplain, and mismatched parser inputs', () => {
  assert.equal(criteriaSnapshot({ body: '', parsed: null }).guard, 'criteria-unplain')
  assert.equal(criteriaSnapshot({ body: '- [ ] text', parsed: { plain: false, boxes: [] } }).guard, 'criteria-unplain')
  assert.equal(criteriaSnapshot({ body: '- [ ] text', parsed: { plain: true, boxes: [{ at: 2, checked: false, text: 'text' }] } }).guard, 'criteria-input')
})

const fixtureEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: require('node:os').devNull,
  GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'Evidence Test', GIT_AUTHOR_EMAIL: 'evidence@example.invalid',
  GIT_COMMITTER_NAME: 'Evidence Test', GIT_COMMITTER_EMAIL: 'evidence@example.invalid' }
function git(cwd, args, expected = 0) {
  const result = spawnSync('git', args, { cwd, env: fixtureEnv, encoding: 'utf8', timeout: 15000, shell: false })
  assert.equal(result.status, expected, `${args.join(' ')}: ${result.stderr || result.error || ''}`)
  return result.stdout.trim()
}
function repository(attributes = '') {
  const root = tmpdir('evidence-')
  git(root, ['init', '-q', '-b', 'task'])
  if (attributes) fs.writeFileSync(path.join(root, '.gitattributes'), attributes)
  fs.writeFileSync(path.join(root, 'source.txt'), 'before\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'Base source'])
  const base = git(root, ['rev-parse', 'HEAD'])
  fs.writeFileSync(path.join(root, 'source.txt'), 'after\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'Changed source'])
  const head = git(root, ['rev-parse', 'HEAD'])
  return { root, base, head }
}
const packet = fixture => reviewPackage({ cwd: fixture.root, base: fixture.base, head: fixture.head, ownedCleanSnapshot: true })

test('review package rejects invalid index UTF-8 that decodes to a different tracked filename',
  { skip: process.platform === 'win32' && 'raw invalid-byte index path fixture is POSIX-specific' }, () => {
    const fixture = repository(), name = 'replacement-\uFFFD.txt'
    fs.writeFileSync(path.join(fixture.root, name), 'valid replacement character\n')
    git(fixture.root, ['add', '.'])
    git(fixture.root, ['commit', '-qm', 'Valid Unicode filename'])
    fixture.head = git(fixture.root, ['rev-parse', 'HEAD'])
    assert.ok(packet(fixture).trees[fixture.head].some(entry => entry.path === name))
    const oid = git(fixture.root, ['rev-parse', `${fixture.head}:${name}`])
    const input = Buffer.concat([
      Buffer.from(`0 ${'0'.repeat(oid.length)}\t${name}\0`),
      Buffer.from(`100644 ${oid}\treplacement-`), Buffer.from([0xff]), Buffer.from('.txt\0'),
    ])
    const changed = spawnSync('git', ['update-index', '-z', '--index-info'],
      { cwd: fixture.root, env: fixtureEnv, input, timeout: 15000, shell: false })
    assert.equal(changed.status, 0, changed.stderr?.toString())
    assert.throws(() => packet(fixture), { code: 'evidence-dirty-index' })
  })

function replaceFixtureObject(root, oid, type, bytes) {
  const file = path.join(root, '.git', 'objects', oid.slice(0, 2), oid.slice(2))
  // Only the test's freshly created loose object is changed; model a corrupt/imported object database.
  fs.chmodSync(file, 0o600)
  fs.writeFileSync(file, zlib.deflateSync(Buffer.concat([Buffer.from(`${type} ${bytes.length}\0`), bytes])))
}

test('review package rejects forged commit bytes under an otherwise valid full object name', () => {
  const fixture = repository()
  const baseTree = git(fixture.root, ['rev-parse', `${fixture.base}^{tree}`])
  const forged = Buffer.from(git(fixture.root, ['cat-file', 'commit', fixture.head])
    .replace(/^tree [a-f0-9]+/, `tree ${baseTree}`) + '\n')
  replaceFixtureObject(fixture.root, fixture.head, 'commit', forged)
  fs.writeFileSync(path.join(fixture.root, 'source.txt'), 'before\n')
  git(fixture.root, ['read-tree', fixture.base])
  assert.equal(git(fixture.root, ['diff', fixture.base, fixture.head]), '', 'ordinary reads can hide the original change')
  assert.throws(() => packet(fixture), { code: 'evidence-object' })
})

test('review package verifies nested tree object hashes as well as root trees and blobs', () => {
  const fixture = repository()
  fs.mkdirSync(path.join(fixture.root, 'nested'))
  fs.writeFileSync(path.join(fixture.root, 'nested', 'source.txt'), 'before\n')
  git(fixture.root, ['add', '.']); git(fixture.root, ['commit', '-qm', 'Nested base'])
  fixture.base = git(fixture.root, ['rev-parse', 'HEAD'])
  fs.writeFileSync(path.join(fixture.root, 'nested', 'source.txt'), 'after\n')
  git(fixture.root, ['add', '.']); git(fixture.root, ['commit', '-qm', 'Nested change'])
  fixture.head = git(fixture.root, ['rev-parse', 'HEAD'])
  const beforeTree = git(fixture.root, ['rev-parse', `${fixture.base}:nested`])
  const afterTree = git(fixture.root, ['rev-parse', `${fixture.head}:nested`])
  const raw = spawnSync('git', ['cat-file', 'tree', beforeTree], { cwd: fixture.root, env: fixtureEnv })
  assert.equal(raw.status, 0)
  replaceFixtureObject(fixture.root, afterTree, 'tree', raw.stdout)
  fs.writeFileSync(path.join(fixture.root, 'nested', 'source.txt'), 'before\n')
  git(fixture.root, ['read-tree', fixture.base])
  assert.equal(git(fixture.root, ['diff', fixture.base, fixture.head]), '')
  assert.throws(() => packet(fixture), { code: 'evidence-object' })
})

test('review package reads exact original commits even when replacement hides the change', () => {
  const fixture = repository()
  git(fixture.root, ['replace', fixture.head, fixture.base])
  assert.equal(git(fixture.root, ['diff', fixture.base, fixture.head]), '')
  const result = packet(fixture)
  assert.match(result.diff, /-before\n\+after/)
  const source = result.trees[fixture.head].find(item => item.path === 'source.txt')
  assert.equal(Buffer.from(result.blobs[source.oid], 'base64').toString(), 'after\n')
  assert.equal(result.base, fixture.base)
  assert.equal(result.head, fixture.head)
  assert.equal(result.dirtyCoverage, false)
  assert.equal(result.scope, 'owned-clean-worktree')
})

test('review package ignores a commit-graph tree substitution while preserving the original diff', () => {
  const fixture = repository()
  git(fixture.root, ['commit-graph', 'write', '--reachable'])
  const file = path.join(fixture.root, '.git', 'objects', 'info', 'commit-graph')
  const graph = fs.readFileSync(file)
  const width = fixture.head.length / 2
  assert.equal(graph.subarray(0, 4).toString(), 'CGPH')
  assert.equal(graph[7], 0, 'the fixture uses a single graph')
  const chunks = {}
  for (let i = 0; i < graph[6]; i++) {
    const at = 8 + 12 * i
    chunks[graph.subarray(at, at + 4).toString()] = Number(graph.readBigUInt64BE(at + 4))
  }
  const count = graph.readUInt32BE(chunks.OIDF + 255 * 4)
  let row = -1
  for (let i = 0; i < count; i++) {
    const at = chunks.OIDL + width * i
    if (graph.subarray(at, at + width).toString('hex') === fixture.head) row = i
  }
  assert.ok(row >= 0)
  const baseTree = git(fixture.root, ['rev-parse', `${fixture.base}^{tree}`])
  Buffer.from(baseTree, 'hex').copy(graph, chunks.CDAT + row * (width + 16))
  require('node:crypto').createHash(width === 32 ? 'sha256' : 'sha1')
    .update(graph.subarray(0, graph.length - width)).digest().copy(graph, graph.length - width)
  fs.chmodSync(file, 0o600)
  fs.writeFileSync(file, graph)
  assert.equal(git(fixture.root, ['-c', 'core.commitGraph=true', 'diff', fixture.base, fixture.head]), '',
    'the auxiliary graph can hide the change without changing commit/tree/blob objects')
  const result = packet(fixture)
  assert.match(result.diff, /-before\n\+after/)
  const source = result.trees[fixture.head].find(item => item.path === 'source.txt')
  assert.equal(Buffer.from(result.blobs[source.oid], 'base64').toString(), 'after\n')
})

test('review package preserves legal UTF-8 Unicode line separators in tracked filenames', () => {
  const fixture = repository()
  const names = ['source\u2028name.txt', 'source\u2029name.txt']
  for (const name of names) fs.writeFileSync(path.join(fixture.root, name), 'separator source\n')
  git(fixture.root, ['add', '--all'])
  git(fixture.root, ['commit', '-qm', 'Unicode filename separators'])
  fixture.head = git(fixture.root, ['rev-parse', 'HEAD'])
  const result = packet(fixture)
  for (const name of names) {
    const entry = result.trees[fixture.head].find(item => item.path === name)
    assert.ok(entry)
    assert.equal(Buffer.from(result.blobs[entry.oid], 'base64').toString(), 'separator source\n')
  }
})

test('review package preserves a legal POSIX LF inside a tracked filename', { skip: process.platform === 'win32' }, () => {
  const fixture = repository()
  const name = 'source\nname.txt'
  fs.renameSync(path.join(fixture.root, 'source.txt'), path.join(fixture.root, name))
  git(fixture.root, ['add', '--all'])
  git(fixture.root, ['commit', '-qm', 'POSIX filename line feed'])
  fixture.head = git(fixture.root, ['rev-parse', 'HEAD'])
  const result = packet(fixture)
  const entry = result.trees[fixture.head].find(item => item.path === name)
  assert.ok(entry)
  assert.equal(Buffer.from(result.blobs[entry.oid], 'base64').toString(), 'after\n')
})

test('review package never invokes repository diff, textconv, clean-filter, fsmonitor, or pager helpers', () => {
  const fixture = repository('source.txt diff=marker filter=marker\n')
  const outside = tmpdir('evidence-helper-')
  const marker = path.join(outside, 'executed')
  const executable = path.join(outside, 'helper')
  fs.writeFileSync(executable, `#!/bin/sh\nprintf invoked >> '${marker}'\nprintf hidden\n`, { mode: 0o755 })
  git(fixture.root, ['config', 'diff.marker.command', executable])
  git(fixture.root, ['diff', fixture.base, fixture.head])
  assert.equal(fs.readFileSync(marker, 'utf8'), 'invoked')
  fs.unlinkSync(marker)
  for (const key of ['diff.marker.textconv', 'filter.marker.clean', 'core.fsmonitor', 'core.pager', 'core.editor']) git(fixture.root, ['config', key, executable])
  git(fixture.root, ['config', 'filter.marker.required', 'true'])
  const original = process.env.GIT_EXTERNAL_DIFF
  process.env.GIT_EXTERNAL_DIFF = executable
  try {
    assert.match(packet(fixture).diff, /-before\n\+after/)
    assert.equal(fs.existsSync(marker), false)
  } finally { if (original === undefined) delete process.env.GIT_EXTERNAL_DIFF; else process.env.GIT_EXTERNAL_DIFF = original }
})

test('review package refuses dirty, staged, untracked, and ignored inputs explicitly', () => {
  const fixture = repository()
  fs.writeFileSync(path.join(fixture.root, 'source.txt'), 'dirty\n')
  assert.throws(() => packet(fixture), { code: 'evidence-dirty' })
  git(fixture.root, ['add', 'source.txt'])
  assert.throws(() => packet(fixture), { code: 'evidence-dirty-index' })
  git(fixture.root, ['reset', '--hard', fixture.head])
  fs.writeFileSync(path.join(fixture.root, 'untracked'), 'input')
  assert.throws(() => packet(fixture), { code: 'evidence-untracked' })
  fs.unlinkSync(path.join(fixture.root, 'untracked'))
  fs.writeFileSync(path.join(fixture.root, '.git', 'info', 'exclude'), 'ignored\n')
  fs.writeFileSync(path.join(fixture.root, 'ignored'), 'input')
  assert.throws(() => packet(fixture), { code: 'evidence-untracked' })
})

test('review package requires ownership and full commit OIDs; no implicit fetch fills missing objects', () => {
  const fixture = repository()
  assert.throws(() => reviewPackage({ cwd: fixture.root, base: fixture.base, head: fixture.head }), { code: 'evidence-ownership' })
  assert.throws(() => reviewPackage({ cwd: fixture.root, base: 'HEAD~', head: fixture.head, ownedCleanSnapshot: true }), { code: 'evidence-oid' })
  assert.throws(() => reviewPackage({ cwd: fixture.root, base: fixture.base, head: fixture.base, ownedCleanSnapshot: true }), { code: 'evidence-head' })
  git(fixture.root, ['config', 'extensions.partialClone', 'missing'])
  git(fixture.root, ['config', 'remote.missing.promisor', 'true'])
  git(fixture.root, ['config', 'remote.missing.url', 'ext::false'])
  assert.throws(() => reviewPackage({ cwd: fixture.root, base: '1'.repeat(40), head: fixture.head, ownedCleanSnapshot: true }), { code: 'evidence-git-read' })
})

test('review package supports clean linked worktrees without executing user configuration', () => {
  const fixture = repository()
  const linked = path.join(tmpdir('evidence-linked-'), 'tree')
  git(fixture.root, ['worktree', 'add', '--detach', linked, fixture.head])
  assert.match(reviewPackage({ cwd: linked, base: fixture.base, head: fixture.head, ownedCleanSnapshot: true }).diff, /\+after/)
})

test('review package preserves binary source and enforces complete package size bounds', () => {
  const fixture = repository()
  const bytes = Buffer.from([0, 1, 255, 3])
  fs.writeFileSync(path.join(fixture.root, 'binary.bin'), bytes)
  git(fixture.root, ['add', '.'])
  git(fixture.root, ['commit', '-qm', 'Binary source'])
  fixture.head = git(fixture.root, ['rev-parse', 'HEAD'])
  const result = packet(fixture)
  const entry = result.trees[fixture.head].find(item => item.path === 'binary.bin')
  assert.deepEqual(Buffer.from(result.blobs[entry.oid], 'base64'), bytes)
  assert.throws(() => reviewPackage({ cwd: fixture.root, base: fixture.base, head: fixture.head, ownedCleanSnapshot: true, maxBytes: 32 }), { code: 'evidence-limit' })
})

function remoteFixture() {
  const fixture = repository()
  const remote = path.join(tmpdir('evidence-remote-'), 'bare.git')
  git(path.dirname(remote), ['init', '-q', '--bare', remote])
  git(fixture.root, ['remote', 'add', 'origin', remote])
  git(fixture.root, ['push', '-q', 'origin', `${fixture.head}:refs/heads/cleanup`])
  return { ...fixture, remote }
}

test('exact leased deletion rejects a moved remote while an ordinary delete would remove it', () => {
  const fixture = remoteFixture()
  git(fixture.remote, ['update-ref', 'refs/heads/cleanup', fixture.base])
  const result = conditionalDelete({ cwd: fixture.root, remote: 'origin', ref: 'refs/heads/cleanup', expectedOid: fixture.head, expectedDestination: fixture.remote })
  assert.notEqual(result.code, 0)
  assert.equal(result.deleted, false)
  assert.equal(git(fixture.remote, ['rev-parse', 'refs/heads/cleanup']), fixture.base)
  git(fixture.root, ['push', 'origin', '--delete', 'cleanup'])
  git(fixture.remote, ['show-ref', '--verify', '--quiet', 'refs/heads/cleanup'], 1)
})

test('exact leased deletion succeeds only at the expected remote OID and retains native pre-push hooks', () => {
  const fixture = remoteFixture()
  const marker = path.join(tmpdir('evidence-hook-'), 'invoked')
  fs.writeFileSync(path.join(fixture.root, '.git', 'hooks', 'pre-push'), `#!/bin/sh\nprintf invoked > '${marker}'\n`, { mode: 0o755 })
  const result = conditionalDelete({ cwd: fixture.root, remote: 'origin', ref: 'refs/heads/cleanup', expectedOid: fixture.head, expectedDestination: fixture.remote })
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.deleted, true)
  assert.equal(fs.readFileSync(marker, 'utf8'), 'invoked')
  git(fixture.remote, ['show-ref', '--verify', '--quiet', 'refs/heads/cleanup'], 1)
})

test('conditional delete refuses ambiguous push URLs, URL rewriting, unsafe refs and empty or short OIDs', () => {
  const fixture = remoteFixture()
  const options = { cwd: fixture.root, remote: 'origin', ref: 'refs/heads/cleanup', expectedOid: fixture.head, expectedDestination: fixture.remote }
  for (const expectedOid of ['', '0'.repeat(40), fixture.head.slice(0, 12), 'HEAD']) assert.throws(() => conditionalDelete({ ...options, expectedOid }), { code: 'evidence-oid' })
  for (const ref of ['cleanup', 'refs/tags/tag', 'refs/heads/a..b', 'refs/heads/x.lock', ':refs/heads/x']) assert.throws(() => conditionalDelete({ ...options, ref }), { code: 'delete-ref' })
  assert.throws(() => conditionalDelete({ ...options, remote: '--all' }), { code: 'delete-remote' })
  git(fixture.root, ['config', '--add', 'remote.origin.pushurl', fixture.remote])
  git(fixture.root, ['config', '--add', 'remote.origin.pushurl', fixture.remote])
  assert.throws(() => conditionalDelete(options), { code: 'delete-remote' })
  git(fixture.root, ['config', '--unset-all', 'remote.origin.pushurl'])
  git(fixture.root, ['config', 'url.https://example.invalid/.insteadOf', 'unused:'])
  assert.throws(() => conditionalDelete(options), { code: 'delete-rewrite' })
  assert.equal(git(fixture.remote, ['rev-parse', 'refs/heads/cleanup']), fixture.head)
})


test('conditional delete preserves the remote ref when a native pre-push hook refuses', () => {
  const fixture = remoteFixture()
  const hook = path.join(fixture.root, '.git', 'hooks', 'pre-push')
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  const result = conditionalDelete({ cwd: fixture.root, remote: 'origin', ref: 'refs/heads/cleanup', expectedOid: fixture.head, expectedDestination: fixture.remote })
  assert.notEqual(result.code, 0)
  assert.equal(result.deleted, false)
  assert.equal(git(fixture.remote, ['rev-parse', 'refs/heads/cleanup']), fixture.head)
})

test('conditional delete refuses custom helper transports and multi-line destinations before executing them', () => {
  const fixture = remoteFixture()
  const marker = path.join(fixture.root, '.git', 'transport-marker')
  const script = path.join(fixture.root, '.git', 'transport-helper')
  fs.writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o755 })
  git(fixture.root, ['config', 'protocol.ext.allow', 'always'])
  git(fixture.root, ['remote', 'set-url', 'origin', `ext::${script}`])
  assert.throws(() => conditionalDelete({ cwd: fixture.root, remote: 'origin', ref: 'refs/heads/cleanup', expectedOid: fixture.head, expectedDestination: fixture.remote }), { code: 'delete-destination' })
  assert.equal(fs.existsSync(marker), false)
  git(fixture.root, ['remote', 'set-url', 'origin', `\n${fixture.remote}`])
  assert.throws(() => conditionalDelete({ cwd: fixture.root, remote: 'origin', ref: 'refs/heads/cleanup', expectedOid: fixture.head, expectedDestination: fixture.remote }), { code: 'delete-remote' })
  assert.equal(git(fixture.remote, ['rev-parse', 'refs/heads/cleanup']), fixture.head)
})


test('conditional delete binds the prepared destination and refuses a later push URL change', () => {
  const fixture = remoteFixture()
  const options = { cwd: fixture.root, remote: 'origin', ref: 'refs/heads/cleanup', expectedOid: fixture.head }
  const prepared = resolveDeleteDestination({ cwd: fixture.root, remote: 'origin' })
  assert.deepEqual(prepared, { remote: 'origin', destination: fixture.remote })
  assert.equal(git(fixture.remote, ['rev-parse', 'refs/heads/cleanup']), fixture.head, 'resolution does not mutate a ref')
  for (const expectedDestination of [undefined, '', '\n']) {
    assert.throws(() => conditionalDelete({ ...options, expectedDestination }), { code: 'delete-expected-destination' })
  }
  const other = path.join(tmpdir('evidence-destination-drift-'), 'other.git')
  git(path.dirname(other), ['init', '-q', '--bare', other])
  git(fixture.root, ['push', '-q', other, `${fixture.head}:refs/heads/cleanup`])
  git(fixture.root, ['config', 'remote.origin.pushurl', other])
  assert.throws(() => conditionalDelete({ ...options, expectedDestination: prepared.destination }), { code: 'delete-destination-stale' })
  assert.equal(git(fixture.remote, ['rev-parse', 'refs/heads/cleanup']), fixture.head)
  assert.equal(git(other, ['rev-parse', 'refs/heads/cleanup']), fixture.head)
  assert.deepEqual(resolveDeleteDestination({ cwd: fixture.root, remote: 'origin' }), { remote: 'origin', destination: other })
})

for (const format of ['ssh-url', 'scp']) {
  for (const multiple of [false, true]) {
    test(`conditional delete rejects a ${format} destination alias with ${multiple ? 'multiple push URLs' : 'one URL'}`,
      { skip: process.platform === 'win32' ? 'local SSH receive-pack fixture uses POSIX paths' : false }, () => {
      const fixture = remoteFixture()
      const localRoot = tmpdir('evidence-local-ssh-')
      const other = path.join(localRoot, 'other.git')
      const destinations = [fixture.remote, other]
      if (multiple) destinations.push(path.join(localRoot, 'third.git'))
      for (const destination of destinations.slice(1)) {
        git(localRoot, ['init', '-q', '--bare', destination])
        git(fixture.root, ['push', '-q', destination, `${fixture.head}:refs/heads/cleanup`])
      }
      const marker = path.join(localRoot, 'invoked')
      const script = path.join(localRoot, 'ssh.cjs')
      // An owned local stub follows only the requested path from this fixture; it never opens an SSH connection.
      fs.writeFileSync(script, `const fs = require('node:fs'); const {spawnSync} = require('node:child_process');
const match = /^git-receive-pack '([^']+)'$/.exec(process.argv.at(-1));
if (!match || !${JSON.stringify(destinations)}.includes(match[1])) process.exit(97);
fs.appendFileSync(${JSON.stringify(marker)}, 'invoked\\n');
const result = spawnSync('git', ['receive-pack', match[1]], {stdio: 'inherit', shell: false});
process.exit(result.status === null ? 98 : result.status);
`)
      const shellQuote = value => "'" + value.replace(/'/g, "'\\''") + "'"
      git(fixture.root, ['config', 'core.sshCommand', `${shellQuote(process.execPath)} ${shellQuote(script)}`])
      git(fixture.root, ['config', 'ssh.variant', 'ssh'])
      const urls = destinations.map(destination => format === 'scp'
        ? `fixture@fixture.invalid:${destination}` : `ssh://fixture.invalid${destination}`)
      git(fixture.root, ['remote', 'set-url', 'origin', urls[0]])
      git(fixture.root, ['config', `remote.${urls[0]}.url`, urls[1]])
      if (multiple) for (const url of urls.slice(1)) git(fixture.root, ['config', '--add', `remote.${urls[0]}.pushurl`, url])
      // Reproduce the unsafe second interpretation with native Git, against local bare repositories only.
      git(fixture.root, ['push', '--porcelain', `--force-with-lease=refs/heads/cleanup:${fixture.head}`, '--', urls[0], ':refs/heads/cleanup'])
      assert.equal(git(fixture.remote, ['rev-parse', 'refs/heads/cleanup']), fixture.head)
      for (const destination of destinations.slice(1)) {
        git(destination, ['show-ref', '--verify', '--quiet', 'refs/heads/cleanup'], 1)
        git(fixture.root, ['push', '-q', destination, `${fixture.head}:refs/heads/cleanup`])
      }
      assert.ok(fs.existsSync(marker))
      fs.unlinkSync(marker)
      assert.throws(() => resolveDeleteDestination({ cwd: fixture.root, remote: 'origin' }), { code: 'delete-alias' })
      assert.throws(() => conditionalDelete({ cwd: fixture.root, remote: 'origin', ref: 'refs/heads/cleanup',
        expectedOid: fixture.head, expectedDestination: urls[0] }), { code: 'delete-alias' })
      for (const destination of destinations) assert.equal(git(destination, ['rev-parse', 'refs/heads/cleanup']), fixture.head)
      assert.equal(fs.existsSync(marker), false, 'refusal runs no transport or hook')
    })
  }
}


test('conditional delete rejects a legacy scp-style remote alias before starting transport',
  { skip: process.platform === 'win32' ? 'legacy remote filename contains a POSIX colon' : false }, () => {
    const fixture = remoteFixture()
    const destination = 'fixture@fixture.invalid:target.git'
    git(fixture.root, ['remote', 'set-url', 'origin', destination])
    const directory = path.join(fixture.root, '.git', 'remotes')
    fs.mkdirSync(directory)
    fs.writeFileSync(path.join(directory, destination), `URL: ${fixture.remote}\n`)
    assert.equal(git(fixture.root, ['remote', 'get-url', '--push', '--all', destination]), fixture.remote)
    assert.throws(() => resolveDeleteDestination({ cwd: fixture.root, remote: 'origin' }), { code: 'delete-alias' })
    assert.throws(() => conditionalDelete({ cwd: fixture.root, remote: 'origin', ref: 'refs/heads/cleanup',
      expectedOid: fixture.head, expectedDestination: destination }), { code: 'delete-alias' })
    assert.equal(git(fixture.remote, ['rev-parse', 'refs/heads/cleanup']), fixture.head)
  })
