'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const tmpdir = require('./tmpdir')

const cli = path.resolve(__dirname, '../bin/devflow-stage')
const tracked = 'sentinel.txt'
const ignored = 'private.txt'

function run(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.error) throw result.error
  assert.equal(result.signal, null, result.stderr)
  return result
}

function git(cwd, ...args) {
  const result = run(cwd, 'git', args)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trimEnd()
}

function fixture() {
  const root = fs.realpathSync.native(tmpdir('stage-'))
  const source = path.join(root, 'feature')
  const dest = path.join(root, 'install source')
  fs.mkdirSync(source)
  git(source, 'init', '--quiet')
  git(source, 'config', 'user.name', 'Devflow Test')
  git(source, 'config', 'user.email', 'devflow@example.invalid')
  git(source, 'config', 'commit.gpgsign', 'false')
  git(source, 'config', 'core.hooksPath', path.join(root, 'disabled-hooks'))
  fs.writeFileSync(path.join(source, '.gitignore'), ignored + '\n')
  fs.writeFileSync(path.join(source, tracked), 'reviewed')
  git(source, 'add', '--force', '.gitignore', tracked)
  git(source, 'commit', '--quiet', '-m', 'Reviewed commit')
  const sha = git(source, 'rev-parse', 'HEAD')
  return { source, dest, sha }
}

function stage({ source, dest, sha }) {
  return run(source, process.execPath, [cli, sha, path.relative(source, dest)])
}

function worktrees(source) {
  return git(source, 'worktree', 'list', '--porcelain')
}

function status(source) {
  return git(source, 'status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none')
}

function assertRefused(f, diagnostic) {
  const before = worktrees(f.source)
  const result = stage(f)
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, diagnostic)
  assert.equal(worktrees(f.source), before)
}

test('stages the reviewed commit as a clean detached worktree', () => {
  const f = fixture()
  fs.writeFileSync(path.join(f.source, ignored), 'local only')
  assert.equal(git(f.source, 'ls-files', '--others', '--ignored', '--exclude-standard'), ignored)
  const result = stage(f)
  assert.equal(result.status, 0, result.stderr)
  assert.ok(result.stdout.includes(f.sha))
  assert.ok(result.stdout.includes(f.dest))
  const destEntry = 'worktree ' + f.dest.split(path.sep).join('/')
  const destRecord = worktrees(f.source).split(/\r?\n\r?\n/)
    .map(record => record.split(/\r?\n/))
    .find(([entry]) => entry === destEntry)
  assert.ok(destRecord, 'destination must be registered')
  assert.ok(destRecord.includes('detached'))
  assert.equal(run(f.dest, 'git', ['symbolic-ref', '-q', 'HEAD']).status, 1)
  assert.equal(git(f.dest, 'rev-parse', 'HEAD'), f.sha)
  assert.equal(fs.readFileSync(path.join(f.dest, tracked), 'utf8'), 'reviewed')
  assert.equal(status(f.dest), '')
  assert.equal(git(f.dest, 'ls-files', '--others', '--ignored', '--exclude-standard'), '')
  assert.equal(fs.existsSync(path.join(f.dest, ignored)), false)
})

test('refuses a reviewed commit after feature HEAD advances', () => {
  const f = fixture()
  git(f.source, 'commit', '--quiet', '--allow-empty', '-m', 'Advance feature')
  const actual = git(f.source, 'rev-parse', 'HEAD')
  assertRefused(f, new RegExp('revision mismatch: expected ' + f.sha + ', actual HEAD ' + actual))
  assert.equal(fs.existsSync(f.dest), false)
})

test('preserves a staged install source when its review becomes stale', () => {
  const f = fixture()
  const firstStage = stage(f)
  assert.equal(firstStage.status, 0, firstStage.stderr)
  const stagedFile = path.join(f.dest, tracked)
  const stagedBytes = fs.readFileSync(stagedFile)

  git(f.source, 'commit', '--quiet', '--allow-empty', '-m', 'Advance feature')
  const actual = git(f.source, 'rev-parse', 'HEAD')
  assertRefused(f, new RegExp('revision mismatch: expected ' + f.sha + ', actual HEAD ' + actual))

  assert.equal(run(f.dest, 'git', ['symbolic-ref', '-q', 'HEAD']).status, 1)
  assert.equal(git(f.dest, 'rev-parse', 'HEAD'), f.sha)
  assert.deepEqual(fs.readFileSync(stagedFile), stagedBytes)
  assert.equal(status(f.dest), '')
})

test('refuses destinations under Git metadata or an unignored source directory', () => {
  const f = fixture()
  for (const [relative, diagnostic] of [
    ['.git/staging', /destination is inside Git metadata/],
    ['staging', /destination inside the feature worktree must be Git-ignored/],
  ]) {
    const dest = path.join(f.source, relative)
    assertRefused({ ...f, dest }, diagnostic)
    assert.equal(fs.existsSync(dest), false)
  }
})

for (const kind of ['staged', 'unstaged', 'untracked']) {
  test('refuses a source with ' + kind + ' changes', () => {
    const f = fixture()
    const file = kind === 'untracked' ? 'untracked.txt' : tracked
    const changed = path.join(f.source, file)
    fs.writeFileSync(changed, 'local change')
    if (kind === 'staged') git(f.source, 'add', file)
    const before = status(f.source)
    assertRefused(f, /feature worktree has uncommitted changes/)
    assert.equal(fs.existsSync(f.dest), false)
    assert.equal(status(f.source), before)
    assert.equal(fs.readFileSync(changed, 'utf8'), 'local change')
  })
}

for (const populated of [false, true]) {
  test('preserves an existing ' + (populated ? 'populated' : 'empty') + ' destination', () => {
    const f = fixture()
    fs.mkdirSync(f.dest)
    if (populated) fs.writeFileSync(path.join(f.dest, tracked), 'existing')
    assertRefused(f, /destination already exists/)
    assert.deepEqual(fs.readdirSync(f.dest), populated ? [tracked] : [])
    if (populated) assert.equal(fs.readFileSync(path.join(f.dest, tracked), 'utf8'), 'existing')
  })
}
