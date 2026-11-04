'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const tmpdir = require('./tmpdir')
const state = require('../bin/devflow-state')

test('strictLocalPath distinguishes existing paths and the first missing component', t => {
  const root = tmpdir('devflow-paths-')
  const file = path.join(root, 'file')
  const missing = path.join(root, 'missing')
  fs.writeFileSync(file, 'local')
  assert.deepEqual(state.strictLocalPath(root), { ok: true })
  assert.deepEqual(state.strictLocalPath(file), { ok: true })
  assert.deepEqual(state.strictLocalPath(missing), { ok: true, absent: missing })
  const visited = []
  const lstat = fs.lstatSync
  t.mock.method(fs, 'lstatSync', (...args) => {
    visited.push(args[0])
    return lstat(...args)
  })
  assert.deepEqual(state.strictLocalPath(path.join(missing, 'child', 'file')), { ok: true, absent: missing })
  assert.equal(visited.includes(path.join(missing, 'child')), false)
  assert.deepEqual(state.strictLocalPath(missing + path.sep + '..' + path.sep + 'file'), { ok: true, absent: missing })
})

test('strictLocalPath refuses network spellings before calling the filesystem', t => {
  let calls = 0
  const lstat = fs.lstatSync
  t.mock.method(fs, 'lstatSync', (...args) => {
    calls++
    return lstat(...args)
  })
  for (const target of ['\\\\h\\s\\x', '//h/s/x']) {
    const result = state.strictLocalPath(target)
    assert.equal(result.ok, false)
    assert.equal(typeof result.why, 'string')
  }
  assert.equal(calls, 0)
})

test('strictLocalPath fails closed when an ancestor cannot be inspected', t => {
  const root = tmpdir('devflow-paths-')
  const blocked = path.join(root, 'blocked')
  const lstat = fs.lstatSync
  t.mock.method(fs, 'lstatSync', (...args) => {
    if (args[0] === blocked) throw Object.assign(new Error('access denied'), { code: 'EACCES' })
    return lstat(...args)
  })
  const result = state.strictLocalPath(path.join(blocked, 'child'))
  assert.equal(result.ok, false)
  assert.equal(typeof result.why, 'string')
  assert.match(result.why, /EACCES/)
})

test('strictLocalPath refuses a link naming a network path', t => {
  const root = tmpdir('devflow-paths-')
  const link = path.join(root, 'network')
  try { fs.symlinkSync('\\\\h\\s\\x', link, 'dir') } catch { return t.skip('directory symlinks are unavailable') }
  const result = state.strictLocalPath(path.join(link, 'file'))
  assert.equal(result.ok, false)
  assert.equal(typeof result.why, 'string')
  assert.equal(state.strictLocalPath(link + path.sep + '..' + path.sep + 'file').ok, false)
  const sub = path.join(root, 'sub')
  fs.mkdirSync(sub)
  fs.symlinkSync('..' + path.sep + 'network' + path.sep + '..' + path.sep + 'target', path.join(sub, 'indirect'), 'dir')
  assert.equal(state.strictLocalPath(path.join(sub, 'indirect', 'file')).ok, false)
})

test('strictLocalPath follows local link text and refuses more than eight links', t => {
  const root = tmpdir('devflow-paths-')
  fs.mkdirSync(path.join(root, 'target'))
  try { fs.symlinkSync('target', path.join(root, 'link0'), 'dir') } catch { return t.skip('directory symlinks are unavailable') }
  for (let i = 1; i <= 8; i++) fs.symlinkSync('link' + (i - 1), path.join(root, 'link' + i), 'dir')
  assert.deepEqual(state.strictLocalPath(path.join(root, 'link1')), { ok: true })
  assert.equal(state.strictLocalPath(path.join(root, 'link8')).ok, false)
  assert.deepEqual(state.strictLocalPath(path.join(root, 'target') + path.sep + '..' + path.sep + 'target'), { ok: true })
  fs.mkdirSync(path.join(root, 'sub'))
  fs.symlinkSync('..' + path.sep + 'target', path.join(root, 'sub', 'parent'), 'dir')
  assert.deepEqual(state.strictLocalPath(path.join(root, 'sub', 'parent')), { ok: true })
})

test('provenMain accepts a .GIT common directory on Windows', { skip: process.platform !== 'win32' }, () => {
  const main = tmpdir('devflow-paths-')
  const common = path.join(main, '.GIT')
  const own = path.join(common, 'worktrees', 'slot')
  const root = path.join(main, 'linked')
  fs.mkdirSync(own, { recursive: true })
  fs.mkdirSync(root)
  fs.writeFileSync(path.join(own, 'gitdir'), path.join(root, '.git'))
  assert.equal(state.provenMain(root, own, common), main)
})

test('hashFile streams a regular file and refuses a symlink', t => {
  const root = tmpdir('devflow-paths-')
  const file = path.join(root, 'file')
  const data = Buffer.alloc(200000, 0x61)
  fs.writeFileSync(file, data)
  const st = fs.lstatSync(file)
  const reads = []
  const read = fs.readSync
  t.mock.method(fs, 'readSync', (...args) => {
    const n = read(...args)
    if (n) reads.push(n)
    return n
  })
  assert.deepEqual(state.hashFile(file), {
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    size: st.size,
    mode: st.mode,
  })
  assert.ok(reads.length > 1, 'large files are read in chunks')
  const link = path.join(root, 'link')
  try { fs.symlinkSync(file, link, 'file') } catch { return t.skip('file symlinks are unavailable') }
  assert.equal(state.hashFile(link), null)
})

test('hashFile rejects a file replaced during the read', t => {
  const root = tmpdir('devflow-paths-')
  const file = path.join(root, 'file')
  const old = path.join(root, 'old')
  fs.writeFileSync(file, Buffer.alloc(200000, 0x61))
  const read = fs.readSync
  let replacementError = null
  let replaced = false
  t.mock.method(fs, 'readSync', (...args) => {
    const n = read(...args)
    if (n && !replaced && !replacementError) {
      try {
        fs.renameSync(file, old)
        fs.writeFileSync(file, Buffer.alloc(200000, 0x62))
        replaced = true
      } catch (e) {
        if (!['EACCES', 'EPERM', 'EBUSY'].includes(e.code)) throw e
        replacementError = e
      }
    }
    return n
  })
  const result = state.hashFile(file)
  if (replacementError) return t.skip('this filesystem cannot replace an open file')
  assert.equal(replaced, true)
  assert.equal(result, null)
})

test('hashFile returns null on a read error or an opened identity mismatch', t => {
  const root = tmpdir('devflow-paths-')
  const file = path.join(root, 'file')
  fs.writeFileSync(file, 'local')
  const read = t.mock.method(fs, 'readSync', () => { throw Object.assign(new Error('read failed'), { code: 'EIO' }) })
  assert.equal(state.hashFile(file), null)
  read.mock.restore()
  const fstat = fs.fstatSync
  t.mock.method(fs, 'fstatSync', (...args) => {
    const st = fstat(...args)
    const exact = fstat(args[0], { bigint: true }).ino
    let other = exact + 1n
    if (Number(other) !== Number(exact)) other = exact - 1n
    st.ino = typeof st.ino === 'bigint' ? other : Number(other)
    return st
  })
  assert.equal(state.hashFile(file), null)
})

test('hashFile stops reading once the initial size is exceeded', t => {
  const root = tmpdir('devflow-paths-')
  const file = path.join(root, 'file')
  fs.writeFileSync(file, 'local')
  let reads = 0
  t.mock.method(fs, 'readSync', (_fd, buffer) => {
    if (++reads > 1) throw new Error('read past the original size')
    buffer.write('local!')
    return 6
  })
  assert.equal(state.hashFile(file), null)
  assert.equal(reads, 1)
})
