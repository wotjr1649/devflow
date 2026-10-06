'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const tmpdir = require('./tmpdir')
const state = require('../bin/devflow-state')
const hook = require('../hooks/devflow-hook')

const ok = value => ({ code: 0, stdout: JSON.stringify(value), stderr: '' })
const parent = (number = 294, repo = 'o/r') => ({ number, repository: { nameWithOwner: repo } })

// Only the network boundary is replaced; the real CLI, validation, queue and flush run.
function fixture(options = {}) {
  const root = tmpdir('devflow-sub-issue-')
  fs.writeFileSync(path.join(root, '.devflow.json'), '{}')
  const file = path.join(root, '.work/devflow/i1/ledger.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ mode: options.mode || 'interactive', pendingPosts: [] }))
  const calls = []
  let relation = options.parent ?? null
  let reads = 0, pages = 0
  const e = {
    vars: {}, calls,
    run(cmd, args, opts = {}) {
      calls.push({ cmd, args, input: opts.input })
      if (cmd === 'git') {
        const a = args.join(' ')
        const values = {
          'rev-parse --show-toplevel': root,
          'branch --show-current': options.branch ?? 'feat/1-work',
          'rev-parse --short HEAD': 'abc1234',
          'remote get-url origin': options.origin ?? 'https://github.com/o/r.git',
        }
        return a in values ? { code: 0, stdout: values[a], stderr: '' } : { code: 1, stdout: '', stderr: '' }
      }
      if (cmd !== 'gh') throw new Error('unexpected executable')
      if (args.includes('POST')) {
        relation = options.afterParent === undefined ? parent() : options.afterParent
        return { code: options.postCode ?? 0, stdout: '{}', stderr: 'untrusted response omitted' }
      }
      const field = name => args.find(a => a.startsWith(name + '='))?.slice(name.length + 1)
      const query = field('query') || ''
      if (query.includes('subIssues(')) {
        const index = pages++
        const page = options.pages?.[index] || { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
        return ok({ data: { repository: { nameWithOwner: 'o/r', issue: { number: Number(field('n')), subIssues: page } } } })
      }
      reads++
      if (options.readFailureAt === reads) return { code: 1, stdout: '', stderr: '' }
      const value = { data: { repository: {
        nameWithOwner: 'o/r',
        parent: { number: Number(field('p')), fullDatabaseId: '3000000000' },
        child: { number: Number(field('c')), fullDatabaseId: '3500000000', parent: relation },
      } } }
      return ok(options.response ? options.response(value, reads) : value)
    },
  }
  const invoke = (...args) => state.main(['sub-issue', ...args], () => '', e, root)
  const writes = () => calls.filter(c => c.cmd === 'gh' && c.args.includes('POST'))
  const ledger = () => JSON.parse(fs.readFileSync(file, 'utf8'))
  const interactive = () => fs.writeFileSync(file, JSON.stringify({ ...ledger(), mode: 'interactive' }))
  return { root, file, e, invoke, writes, ledger, interactive }
}

test('sub-issue add links explicit targets outside the working Issue through a fixed request', () => {
  const f = fixture()
  const r = f.invoke('add', '294', '320')
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /294.*320/)
  assert.equal(f.writes().length, 1)
  const call = f.writes()[0]
  assert.ok(call.args.includes('repos/o/r/issues/294/sub_issues'))
  assert.ok(call.args.includes('github.com'))
  assert.deepEqual(JSON.parse(call.input), { sub_issue_id: 3500000000, replace_parent: false })
  assert.equal(f.invoke('add', '294', '320').code, 0)
  assert.equal(f.writes().length, 1, 'the second call reads the relationship without posting')
})

test('sub-issue CLI rejects malformed numbers and extra options before invoking anything', () => {
  for (const args of [
    ['add', '0', '320'], ['add', '-1', '320'], ['add', '2.5', '320'], ['add', '2e2', '320'],
    ['add', '0294', '320'], ['add', '9007199254740992', '320'], ['add', '294'],
    ['add', '294', '320', '--repo', 'x/y'], ['add', '294', '320', '--method', 'GET'],
    ['remove', '294', '320'], ['list', '0'], ['list', '294', '320'],
  ]) {
    const f = fixture()
    assert.equal(f.invoke(...args).code, 2, JSON.stringify(args))
    assert.equal(f.e.calls.length, 0)
  }
})

test('self-links, missing Issue branches and malformed origin cannot write', () => {
  for (const options of [{}, { branch: 'main' }, { branch: '' }, { origin: 'https://example.com/o/r.git' },
    { origin: 'https://github.com/o/../r.git' }]) {
    const f = fixture(options)
    const r = f.invoke('add', '294', options.branch === undefined && options.origin === undefined ? '294' : '320')
    assert.notEqual(r.code, 0)
    assert.equal(f.writes().length, 0)
  }
})

test('existing parent is compared by repository and number without replacement', () => {
  for (const relation of [parent(), parent(295), parent(294, 'other/r')]) {
    const f = fixture({ parent: relation })
    const r = f.invoke('add', '294', '320')
    assert.equal(r.code, relation.repository.nameWithOwner === 'o/r' && relation.number === 294 ? 0 : 1)
    assert.equal(f.writes().length, 0)
  }
})

test('null, partial, malformed and mismatched metadata never becomes a write', () => {
  const alter = [
    v => ({ ...v, errors: [{ message: 'partial failure' }] }),
    v => { v.data.repository = null; return v },
    v => { v.data.repository.nameWithOwner = 'other/r'; return v },
    v => { v.data.repository.parent = null; return v },
    v => { v.data.repository.child = null; return v },
    v => { v.data.repository.child.number = 321; return v },
    v => { v.data.repository.child.fullDatabaseId = '9007199254740992'; return v },
    v => { v.data.repository.child.fullDatabaseId = '3e9'; return v },
    v => { delete v.data.repository.child.parent; return v },
    v => { v.data.repository.child.parent = { number: 294 }; return v },
  ]
  for (const response of alter) {
    const f = fixture({ response })
    assert.equal(f.invoke('add', '294', '320').code, 1)
    assert.equal(f.writes().length, 0)
  }
})

test('POST outcomes are read back without automatically retrying writes', () => {
  for (const options of [
    { postCode: 'ETIMEDOUT' }, { postCode: 1 },
    { postCode: 'ETIMEDOUT', afterParent: null },
    { afterParent: parent(295) }, { afterParent: null }, { readFailureAt: 2 },
  ]) {
    const f = fixture(options)
    const r = f.invoke('add', '294', '320')
    const confirmed = options.afterParent === undefined && options.readFailureAt === undefined
    assert.equal(r.code, confirmed ? 0 : 1, r.out)
    assert.equal(f.writes().length, 1)
    if (options.afterParent === null || options.readFailureAt) assert.match(r.out, /unknown|unconfirmed/)
  }
})

test('an authentication failure does not become a second write', () => {
  const f = fixture({ postCode: 4, afterParent: null })
  assert.equal(f.invoke('add', '294', '320').code, 1)
  assert.equal(f.writes().length, 1)
})

test('unattended add signs both targets and queues without a network call', () => {
  const f = fixture({ mode: 'autonomous' })
  assert.equal(f.invoke('add', '294', '320').code, 0)
  assert.equal(f.e.calls.filter(c => c.cmd === 'gh').length, 0)
  const item = f.ledger().pendingPosts[0]
  assert.equal(item.op, 'sub-issue-add')
  assert.equal(item.issue, 1)
  assert.equal(item.text, '[1,294,320]')
  assert.match(item.mac, /^[0-9a-f]{64}$/)
  f.interactive()
  const r = state.flush(f.e, f.root)
  assert.equal(r.code, 0, r.out)
  assert.equal(f.writes().length, 1)
  assert.equal(f.ledger().pendingPosts.length, 0)
})

test('queue tampering and moving to another repository stop before posting', () => {
  for (const patch of [{ text: '[1,294,321]' }, { op: 'comment' }, { issue: 2 }, { text: '[2,294,320]' }]) {
    const f = fixture({ mode: 'autonomous' })
    assert.equal(f.invoke('add', '294', '320').code, 0)
    const l = f.ledger()
    fs.writeFileSync(f.file, JSON.stringify({ ...l, mode: 'interactive', pendingPosts: [{ ...l.pendingPosts[0], ...patch }] }))
    assert.equal(state.flush(f.e, f.root).code, 1)
    assert.equal(f.writes().length, 0)
  }
  const f = fixture({ mode: 'autonomous' })
  f.invoke('add', '294', '320')
  f.interactive()
  const run = f.e.run
  f.e.run = (cmd, args, opts) => cmd === 'git' && args.join(' ') === 'remote get-url origin'
    ? { code: 0, stdout: 'https://github.com/o/other.git', stderr: '' } : run(cmd, args, opts)
  assert.equal(state.flush(f.e, f.root).code, 1)
  assert.equal(f.writes().length, 0)
})

test('even signed malformed relation payloads and wrong branch ownership are refused', () => {
  for (const text of ['[1,294,320,321]', '[1,294,"320"]', '[1,294,294]', '[1, 294,320]', '[2,294,320]']) {
    const f = fixture({ mode: 'autonomous' })
    f.invoke('add', '294', '320')
    const l = f.ledger(), item = { ...l.pendingPosts[0], text }
    item.mac = state.macOf(state.queueKey(true), 'o/r', item)
    fs.writeFileSync(f.file, JSON.stringify({ ...l, mode: 'interactive', pendingPosts: [item] }))
    assert.equal(state.flush(f.e, f.root).code, 1)
    assert.equal(f.writes().length, 0)
  }
  const f = fixture()
  assert.equal(state.write(f.e, f.root, 'sub-issue-add', 2, '[1,294,320]').code, 1)
  assert.equal(f.writes().length, 0)
})

test('unknown queued POST is read-only on later flush, even when the parent is still null', () => {
  const f = fixture({ mode: 'autonomous', postCode: 'ETIMEDOUT', afterParent: null })
  f.invoke('add', '294', '320')
  f.interactive()
  assert.equal(state.flush(f.e, f.root).code, 1)
  assert.ok(f.ledger().pendingPosts[0].unconfirmed)
  assert.equal(state.flush(f.e, f.root).code, 1)
  assert.equal(f.writes().length, 1)
  assert.equal(f.ledger().pendingPosts.length, 1)
})

test('unknown queued POST can later be confirmed without another POST', () => {
  const f = fixture({ mode: 'autonomous', readFailureAt: 2 })
  f.invoke('add', '294', '320')
  f.interactive()
  assert.equal(state.flush(f.e, f.root).code, 1)
  assert.equal(state.flush(f.e, f.root).code, 0)
  assert.equal(f.writes().length, 1)
  assert.equal(f.ledger().pendingPosts.length, 0)
})

test('a numeric gh failure with no observed parent remains unknown and cannot be posted again by flush', () => {
  const f = fixture({ mode: 'autonomous', postCode: 1, afterParent: null })
  f.invoke('add', '294', '320')
  f.interactive()
  const first = state.flush(f.e, f.root)
  assert.equal(first.code, 1)
  assert.match(first.out, /unknown/)
  assert.ok(f.ledger().pendingPosts[0].unconfirmed)
  assert.equal(state.flush(f.e, f.root).code, 1)
  assert.equal(f.writes().length, 1)
})

test('list collects only bounded metadata across pages', () => {
  const node = number => ({ number, repository: { nameWithOwner: 'o/r' } })
  const f = fixture({ pages: [
    { nodes: [node(320)], pageInfo: { hasNextPage: true, endCursor: 'cursor-1' } },
    { nodes: [node(321)], pageInfo: { hasNextPage: false, endCursor: 'cursor-2' } },
  ] })
  const r = f.invoke('list', '294')
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /320.*321/)
  assert.equal(f.writes().length, 0)
  assert.ok(f.e.calls.some(c => c.args.includes('after=cursor-1')))
})

test('list refuses missing, repeated or oversized cursors and malformed nodes', () => {
  for (const pages of [
    [{ nodes: [], pageInfo: { hasNextPage: true, endCursor: null } }],
    [{ nodes: [], pageInfo: { hasNextPage: true, endCursor: 'repeat' } }, { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'repeat' } }],
    [{ nodes: [null], pageInfo: { hasNextPage: false, endCursor: null } }],
    [{ nodes: [{ number: 320, repository: { nameWithOwner: 'other/r' } }], pageInfo: { hasNextPage: false, endCursor: null } }],
    [{ nodes: [], pageInfo: { hasNextPage: true, endCursor: 'x'.repeat(4097) } }],
    Array.from({ length: 10 }, (_, i) => ({ nodes: [], pageInfo: { hasNextPage: true, endCursor: `c${i}` } })),
  ]) {
    const f = fixture({ pages })
    assert.equal(f.invoke('list', '294').code, 1)
    assert.equal(f.writes().length, 0)
    assert.ok(f.e.calls.filter(c => c.cmd === 'gh').length <= 10)
  }
})

test('the official relation command leaves direct Issue writes and old branch restrictions intact', () => {
  assert.ok(hook.issueWrite('gh api -X POST repos/o/r/issues/294/sub_issues -F sub_issue_id=3500000000'))
  assert.ok(hook.mcpIssueWrite('mcp__github__sub_issue_write'))
  assert.equal(hook.issueWrite('node bin/devflow-state sub-issue add 294 320'), null)
  const f = fixture()
  assert.equal(state.write(f.e, f.root, 'comment', 294, '### Checkpoint build — x\n- test').code, 1)
  assert.equal(f.writes().length, 0)
})
