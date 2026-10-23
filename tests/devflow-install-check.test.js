'use strict'
// Issue #18: an installed copy is compared with the files tracked at a ref, by git's own object ids.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const tmpdir = require('./tmpdir')

const BIN = path.join(__dirname, '..', 'bin', 'devflow-install-check')
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
const GITC = ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'core.autocrlf=false']
const git = (cwd, ...args) => {
  const r = spawnSync('git', [...GITC, ...args], { cwd, encoding: 'utf8', env: cleanEnv })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
const check = (cwd, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: cleanEnv })
const put = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text) }

function repo() {
  const root = fs.realpathSync.native(tmpdir('dfic-'))
  git(root, 'init', '-q')
  put(root, 'a.txt', 'alpha\n')
  put(root, 'sub/b.txt', 'beta\n')
  git(root, 'add', '.')
  git(root, 'commit', '-q', '-m', 'one')
  return root
}

test('an installed copy equal to the ref passes; a changed, missing or linked file fails and is named, never shown', () => {
  const root = repo()
  const same = tmpdir('dfic-same-')
  put(same, 'a.txt', 'alpha\n')
  put(same, 'sub/b.txt', 'beta\n')
  put(same, '.git', 'gitdir: elsewhere\n') // files the ref does not track are not compared
  const ok = check(root, same)
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /same 2, different 0, missing 0/)
  const off = tmpdir('dfic-off-')
  put(off, 'a.txt', 'secret changed text\n')
  const bad = check(root, same, off)
  assert.equal(bad.status, 1)
  assert.match(bad.stdout, /same 0, different 1, missing 1/)
  assert.match(bad.stdout, /different: a\.txt/)
  assert.match(bad.stdout, /missing: sub\/b\.txt/)
  assert.doesNotMatch(bad.stdout + bad.stderr, /secret|alpha|beta/)
  // A link is not followed: it is reported as different even when its target holds the same bytes.
  const linked = tmpdir('dfic-lnk-')
  put(linked, 'sub/b.txt', 'beta\n')
  try { fs.symlinkSync(path.join(same, 'a.txt'), path.join(linked, 'a.txt')) } catch { return }
  assert.match(check(root, linked).stdout, /different: a\.txt/)
})

test('a folder link on the way is not followed, and an unreadable file is counted, not thrown (#18 review)', () => {
  const root = repo()
  const elsewhere = tmpdir('dfic-else-')
  put(elsewhere, 'b.txt', 'beta\n')
  const viaLink = tmpdir('dfic-via-')
  put(viaLink, 'a.txt', 'alpha\n')
  fs.symlinkSync(elsewhere, path.join(viaLink, 'sub'), 'junction')
  const r = check(root, viaLink)
  assert.equal(r.status, 1)
  assert.match(r.stdout, /different: sub\/b\.txt/)
  // A folder where a file should be cannot be read as one: it is different, and the command still ends cleanly.
  const odd = tmpdir('dfic-odd-')
  put(odd, 'a.txt', 'alpha\n')
  fs.mkdirSync(path.join(odd, 'sub', 'b.txt'), { recursive: true })
  const o = check(root, odd)
  assert.equal(o.status, 1)
  assert.match(o.stdout, /different: sub\/b\.txt/)
  assert.equal(o.stderr, '')
})

test('a tree path git would refuse is not looked up outside the folder (#18 review)', () => {
  const root = repo()
  const r = spawnSync(process.execPath, ['-e', `
    const m = require(${JSON.stringify(BIN)});
    const outside = m.unsafePath;
    for (const p of ['../x', 'a/../../x', 'a\\\\b', 'a\\nb', '/abs', ['C', '/x'].join(':'), 'a/./b']) if (!outside(p)) { console.log('accepted ' + JSON.stringify(p)); process.exit(1) }
    for (const p of ['a.txt', 'sub/b.txt', 'docs/specs/x.md']) if (outside(p)) { console.log('refused ' + p); process.exit(1) }
  `], { cwd: root, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

test('--ref compares with another commit, and bad input is refused', () => {
  const root = repo()
  const first = git(root, 'rev-parse', 'HEAD')
  put(root, 'a.txt', 'alpha two\n')
  git(root, 'commit', '-q', '-am', 'two')
  const copy = tmpdir('dfic-ref-')
  put(copy, 'a.txt', 'alpha\n')
  put(copy, 'sub/b.txt', 'beta\n')
  assert.equal(check(root, copy).status, 1, 'HEAD has the new a.txt')
  assert.equal(check(root, '--ref', first, copy).status, 0)
  assert.equal(check(root).status, 2, 'no folder to compare')
  assert.equal(check(root, '--ref').status, 2)
  assert.equal(check(root, '--ref', 'no-such-ref', copy).status, 2)
  assert.equal(check(tmpdir('dfic-nogit-'), copy).status, 2, 'outside a repository')
})

test('a lone --help prints the usage on stdout and needs no repository, git or folder (#83)', () => {
  const { USAGE } = require(BIN)
  const bare = tmpdir('dfic-help-')
  put(bare, 'keep.txt', 'x\n')
  const before = fs.readdirSync(bare).sort()
  // An empty PATH leaves no git to run; the command must not try.
  const r = spawnSync(process.execPath, [BIN, '--help'], { cwd: bare, encoding: 'utf8', env: { ...cleanEnv, PATH: bare } })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, USAGE + '\n')
  assert.equal(r.stderr, '')
  assert.deepEqual(fs.readdirSync(bare).sort(), before, 'nothing is written')
})

test('--help keeps its old meaning anywhere but alone, and a folder of that name compares as ./--help (#83)', () => {
  const root = repo()
  const copy = tmpdir('dfic-helpdir-')
  put(copy, '--help/a.txt', 'alpha\n')
  put(copy, '--help/sub/b.txt', 'beta\n')
  const viaPath = check(root, path.join(copy, '--help'))
  assert.equal(viaPath.status, 0, viaPath.stdout + viaPath.stderr)
  put(root, '--help/a.txt', 'alpha\n')
  put(root, '--help/sub/b.txt', 'beta\n')
  const rel = check(root, './--help')
  assert.equal(rel.status, 0, rel.stdout + rel.stderr)
  assert.match(rel.stdout, /^\.\/--help: same 2, different 0, missing 0/m)
  // Not alone: the word is still a folder name, or the value of --ref.
  const withDir = check(root, '--help', copy)
  assert.equal(withDir.status, 1)
  assert.match(withDir.stdout, /^--help: same 2, different 0, missing 0/m, 'the word is a folder name next to another argument')
  assert.match(withDir.stdout, /dfic-helpdir-[^\n]*: same 0, different 0, missing 2/)
  assert.equal(check(root, '--ref', '--help', copy).status, 2)
  assert.match(check(root, '--ref', '--help', copy).stderr, /no tree at --help/)
  assert.equal(check(root, '--bogus').status, 1, 'an unknown option is still a folder name')
  assert.equal(check(tmpdir('dfic-nogit2-'), '--help', '--help').status, 2)
  assert.equal(check(tmpdir('dfic-nogit3-')).status, 2)
  assert.equal(check(tmpdir('dfic-nogit3-')).stdout, '')
})
