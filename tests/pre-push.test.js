'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const tmpdir = require('./tmpdir')
const { spawnSync } = require('child_process')

const gate = path.resolve(__dirname, '../.githooks/pre-push')
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=',
    '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8', env: cleanEnv() })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}
const ZERO = '0'.repeat(40)

test('a push that only deletes refs skips the gate; one that updates a ref still runs it (#53)', t => {
  if (spawnSync('sh', ['-c', 'exit 0']).status !== 0) return t.skip('no sh here')
  const d = fs.realpathSync.native(tmpdir('devflow-prepush-'))
  // A verify that always fails, so a run of the gate shows as a refusal.
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ verify: 'exit 1' }))
  git(d, 'init', '-q')
  git(d, 'add', '.devflow.json')
  git(d, 'commit', '-q', '-m', 'a')
  const head = git(d, 'rev-parse', 'HEAD')
  const push = lines => spawnSync('sh', [gate, 'origin', 'https://example.invalid/r.git'],
    { cwd: d, input: lines.map(l => l + '\n').join(''), encoding: 'utf8', env: cleanEnv() })
  const del = `(delete) ${ZERO} refs/heads/fix/1-x ${head}`
  const upd = `refs/heads/main ${head} refs/heads/main ${ZERO}`
  fs.writeFileSync(path.join(d, 'untracked.txt'), 'x')
  const only = push([del, `(delete) ${ZERO} refs/heads/fix/2-y ${head}`])
  assert.equal(only.status, 0, only.stderr)
  assert.equal(push([del, upd]).status, 1, 'a dirty tree still blocks a push with an update')
  fs.rmSync(path.join(d, 'untracked.txt'))
  const mixed = push([del, upd])
  assert.equal(mixed.status, 1)
  assert.match(mixed.stderr, /verify failed/)
})

test('verify children do not inherit the pushing worktree Git environment (#53 follow-up)', t => {
  if (spawnSync('sh', ['-c', 'exit 0']).status !== 0) return t.skip('no sh here')
  const d = fs.realpathSync.native(tmpdir('devflow-prepush-env-'))
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ verify: 'node verify.js' }))
  const outside = tmpdir('devflow-prepush-outside-')
  fs.writeFileSync(path.join(d, 'verify.js'), `
    const {spawnSync} = require('child_process')
    const r = spawnSync('git', ['rev-parse', '--git-dir'], {cwd: ${JSON.stringify(outside)}, encoding:'utf8'})
    if (r.status === 0 || process.env.GIT_DIR || process.env.GIT_COMMON_DIR || process.env.GIT_INDEX_FILE) process.exit(1)
  `)
  git(d, 'init', '-q')
  git(d, 'add', '.')
  git(d, 'commit', '-q', '-m', 'fixture')
  const head = git(d, 'rev-parse', 'HEAD')
  const r = spawnSync('sh', [gate, 'origin', 'https://example.invalid/r.git'], {
    cwd: d, encoding: 'utf8', timeout: 30000,
    input: `refs/heads/main ${head} refs/heads/main ${ZERO}\n`,
    env: {...cleanEnv(), GIT_DIR: path.join(d, '.git'), GIT_COMMON_DIR: path.join(d, '.git'), GIT_INDEX_FILE: path.join(d, '.git/index')},
  })
  assert.equal(r.status, 0, r.stderr)
})
