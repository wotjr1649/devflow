'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const child = require('child_process')
const spawnSync = child.spawnSync
let spawned = 0
child.spawnSync = (...args) => { spawned++; return spawnSync(...args) }
const tmpdir = require('./tmpdir')
// The command keeps its manifests in the OS temp folder; point that at this process's test folder.
const tempRoot = tmpdir('temp-')
for (const k of ['TEMP', 'TMP', 'TMPDIR']) process.env[k] = tempRoot
const manifestDir = path.join(tempRoot, 'devflow-delegation-check')
const state = require('../bin/devflow-state')

function fixture() {
  const dir = tmpdir('delegation-')
  const root = path.join(dir, 'repo')
  fs.mkdirSync(root)
  const vars = { ...process.env, HOME: dir, XDG_CONFIG_HOME: dir,
    GIT_CONFIG_GLOBAL: path.join(dir, 'global'), GIT_CONFIG_SYSTEM: path.join(dir, 'system') }
  fs.writeFileSync(vars.GIT_CONFIG_GLOBAL, '')
  fs.writeFileSync(vars.GIT_CONFIG_SYSTEM, '')
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: root, env: vars, encoding: 'utf8', windowsHide: true })
    assert.equal(r.status, 0, `fixture git ${args[0]} failed: ${r.stderr}`)
    return r.stdout.trim()
  }
  git('init', '-q', '--initial-branch=main')
  fs.writeFileSync(path.join(root, '.devflow.json'), '{}')
  fs.writeFileSync(path.join(root, 'tracked'), 'baseline\n')
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture')
  const calls = []
  const env = { vars, run(cmd, args, opts) { calls.push({ cmd, args, opts }); return state.realEnv.run(cmd, args, opts) } }
  return { dir, root, vars, git, env, calls }
}

const createdManifests = new Set()
const command = (env, cwd, ...args) => {
  const result = state.main(['delegation-check', ...args], () => '', env, cwd)
  const match = /^token ([0-9a-f]{16})\.[0-9a-f]{64}$/m.exec(result.out)
  if (match) createdManifests.add(path.join(manifestDir, match[1] + '.json'))
  return result
}
test.after(() => {
  for (const file of createdManifests) {
    for (const p of [file, file + '.target']) {
      try { fs.unlinkSync(p) } catch (e) { if (e.code !== 'ENOENT') throw e }
    }
  }
})
function before(f) {
  const r = command(f.env, f.root, 'before')
  assert.equal(r.code, 0, r.out)
  const match = /^token ([0-9a-f]{16}\.[0-9a-f]{64})$/m.exec(r.out)
  assert.ok(match, r.out)
  assert.match(r.out, /^limits:/m)
  return match[1]
}
function after(f, token) {
  const count = spawned
  const env = { vars: f.vars, run() { throw new Error('after started a child') } }
  const r = command(env, f.root, 'after', token)
  assert.equal(spawned, count, 'after must not call child_process.spawnSync')
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /^remote: skipped \(T3\)$/m)
  return r.out
}
const manifest = token => path.join(manifestDir, token.split('.')[0] + '.json')
const include = (f, target) => fs.appendFileSync(path.join(f.root, '.git', 'config'),
  `\n[include]\n\tpath = ${target.replaceAll('\\', '/')}\n`)

test('usage and unchanged snapshots do not invoke a child in after', () => {
  const usage = state.main([], () => '', { vars: {} }, '.').out
  assert.match(usage, /delegation-check before \| delegation-check after <token>/)
  assert.match(usage, /after.*no git/i)
  const f = fixture()
  const token = before(f)
  assert.match(after(f, token), /^local: unchanged\nremote: skipped \(T3\)\nUNCHANGED$/)
  assert.equal(fs.existsSync(manifest(token)), false)
  assert.ok(f.calls.every(c => c.cmd === 'git' && c.args[0] === '--no-pager' && c.args[1] === '--no-lazy-fetch'))
})

test('invalid command shapes are usage errors; invalid tokens are unverified', () => {
  const f = fixture()
  for (const args of [[], ['before', 'extra'], ['after'], ['after', 'x', 'extra']]) {
    assert.notEqual(command(f.env, f.root, ...args).code, 0)
  }
  assert.match(after(f, 'not-a-token'), /^local: unverified .+\nremote: skipped \(T3\)\nUNVERIFIED local$/)
})

test('realEnv forwards an explicit child environment', () => {
  const r = state.realEnv.run(process.execPath, ['-e', "process.stdout.write(process.env.DEVFLOW_TEST_VALUE || '')"],
    { env: { ...process.env, DEVFLOW_TEST_VALUE: 'forwarded' } })
  assert.equal(r.code, 0)
  assert.equal(r.stdout, 'forwarded')
})

test('same-OID HEAD switches and symbolic ref retargets are detected', () => {
  const f = fixture()
  f.git('branch', 'other')
  let token = before(f)
  f.git('symbolic-ref', 'HEAD', 'refs/heads/other')
  assert.match(after(f, token), /changed: git .*HEAD/)
  f.git('symbolic-ref', 'refs/heads/alias', 'refs/heads/main')
  f.git('symbolic-ref', 'HEAD', 'refs/heads/alias')
  token = before(f)
  f.git('symbolic-ref', 'refs/heads/alias', 'refs/heads/other')
  assert.match(after(f, token), /changed: git .*alias/)
})

test('a linked worktree includes changes to the main tree ledger', () => {
  const f = fixture()
  const linked = path.join(f.dir, 'linked')
  f.git('worktree', 'add', '-qb', 'linked', linked)
  const ledger = path.join(f.root, '.work', 'devflow', 'i1', 'ledger.json')
  fs.mkdirSync(path.dirname(ledger), { recursive: true })
  fs.writeFileSync(ledger, 'before')
  const g = { ...f, root: linked }
  const token = before(g)
  fs.writeFileSync(ledger, 'after')
  assert.match(after(g, token), /changed: ledger .*ledger\.json/)
})

test('linked worktree ledger discovery accepts .GIT spelling on Windows', { skip: process.platform !== 'win32' }, () => {
  const f = fixture()
  const linked = path.join(f.dir, 'linked')
  f.git('worktree', 'add', '-qb', 'linked', linked)
  const ledger = path.join(f.root, '.work', 'devflow', 'i1', 'ledger.json')
  fs.mkdirSync(path.dirname(ledger), { recursive: true })
  fs.writeFileSync(ledger, 'before')
  const env = { vars: f.vars, run(cmd, args, opts) {
    const r = f.env.run(cmd, args, opts)
    return args.includes('--git-common-dir')
      ? { ...r, stdout: r.stdout.replace(/([\\/])\.git(?=[\\/\r\n]|$)/gi, '$1.GIT') } : r
  } }
  const g = { ...f, root: linked, env }
  const token = before(g)
  fs.writeFileSync(ledger, 'after')
  assert.match(after(g, token), /changed: ledger .*ledger\.json/)
})

test('a reftable repository is supported when git can create one', t => {
  const f = fixture()
  const repo = path.join(f.dir, 'reftable')
  const r = spawnSync('git', ['init', '-q', '--ref-format=reftable', repo], { env: f.vars, encoding: 'utf8', windowsHide: true })
  if (r.status !== 0) return t.skip('installed git does not support reftable')
  fs.writeFileSync(path.join(repo, '.devflow.json'), '{}')
  const initial = spawnSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    'commit', '--allow-empty', '-qm', 'fixture'], { env: f.vars, encoding: 'utf8', windowsHide: true })
  assert.equal(initial.status, 0, initial.stderr)
  const g = { ...f, root: repo }
  const token = before(g)
  const branch = spawnSync('git', ['-C', repo, 'branch', 'other'], { env: f.vars, encoding: 'utf8', windowsHide: true })
  assert.equal(branch.status, 0, branch.stderr)
  assert.match(after(g, token), /changed: git .*reftable/i)
})

test('external includes, command-line includes, and empty system config are covered', () => {
  for (const kind of ['file', 'command line', 'system']) {
    const f = fixture()
    const target = kind === 'system' ? f.vars.GIT_CONFIG_SYSTEM : path.join(f.dir, 'included')
    fs.writeFileSync(target, '')
    if (kind === 'file') include(f, target)
    if (kind === 'command line') Object.assign(f.vars, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'include.path', GIT_CONFIG_VALUE_0: target })
    const token = before(f)
    fs.writeFileSync(target, '[test]\nvalue = changed\n')
    assert.match(after(f, token), /changed: config /, kind)
  }
})

test('a changed symlinked config target cannot be reported unchanged', t => {
  const f = fixture()
  const target = f.vars.GIT_CONFIG_GLOBAL
  const link = path.join(f.dir, 'global-link')
  try { fs.symlinkSync(target, link, 'file') } catch (e) {
    if (!['EPERM', 'EACCES', 'ENOSYS', 'EOPNOTSUPP', 'ENOTSUP'].includes(e.code)) throw e
    return t.skip('file symlinks are unavailable')
  }
  f.vars.GIT_CONFIG_GLOBAL = link
  const token = before(f)
  fs.writeFileSync(target, '[test]\nvalue = changed\n')
  assert.match(after(f, token), /changed: config .*global/)
})

test('a retargeted config link is reported without opening its new target', t => {
  const f = fixture()
  const target = f.vars.GIT_CONFIG_GLOBAL
  const other = path.join(f.dir, 'new-target')
  const link = path.join(f.dir, 'global-link')
  fs.writeFileSync(other, '[test]\nvalue = new\n')
  try { fs.symlinkSync(target, link, 'file') } catch (e) {
    if (!['EPERM', 'EACCES', 'ENOSYS', 'EOPNOTSUPP', 'ENOTSUP'].includes(e.code)) throw e
    return t.skip('file symlinks are unavailable')
  }
  f.vars.GIT_CONFIG_GLOBAL = link
  const token = before(f)
  fs.unlinkSync(link)
  fs.symlinkSync(other, link, 'file')
  for (const method of ['lstatSync', 'openSync', 'readFileSync']) {
    const original = fs[method]
    t.mock.method(fs, method, (...args) => {
      assert.notEqual(args[0], other, `opened new target via ${method}`)
      return original(...args)
    })
  }
  assert.match(after(f, token), /changed: config .*global-link[\s\S]*LOCAL_CHANGE$/)
})

test('changed linked-worktree pointers are reported before opening their new targets', t => {
  for (const pointer of ['dotgit', 'commondir']) {
    const f = fixture()
    const linked = path.join(f.dir, 'linked')
    f.git('worktree', 'add', '-qb', 'linked', linked)
    const dotgit = path.join(linked, '.git')
    const gitdir = fs.readFileSync(dotgit, 'utf8').trim().replace(/^gitdir: /, '')
    const g = { ...f, root: linked }
    const token = before(g)
    const file = pointer === 'dotgit' ? dotgit : path.join(gitdir, 'commondir')
    const open = fs.openSync
    const read = fs.readFileSync
    let pointerFd
    t.mock.method(fs, 'openSync', (...args) => {
      const fd = open(...args)
      if (args[0] === file) pointerFd = fd
      return fd
    })
    t.mock.method(fs, 'readFileSync', (...args) => {
      const data = read(...args)
      if (args[0] !== pointerFd) return data
      const changed = Buffer.from(data)
      changed[0] ^= 1
      return changed
    })
    assert.match(after(g, token), /LOCAL_CHANGE$/, pointer)
    t.mock.restoreAll()
  }
})

test('a directory replaced by a link is recorded without opening its target', t => {
  const f = fixture()
  const directory = path.join(f.root, 'directory')
  const target = path.join(f.dir, 'new-target')
  fs.mkdirSync(directory)
  fs.mkdirSync(target)
  const token = before(f)
  fs.rmdirSync(directory)
  try { fs.symlinkSync(target, directory, 'dir') } catch (e) {
    if (!['EPERM', 'EACCES', 'ENOSYS', 'EOPNOTSUPP', 'ENOTSUP'].includes(e.code)) throw e
    return t.skip('directory symlinks are unavailable')
  }
  for (const method of ['lstatSync', 'openSync', 'readdirSync']) {
    const original = fs[method]
    t.mock.method(fs, method, (...args) => {
      if (typeof args[0] === 'string') assert.equal(args[0].startsWith(target), false, `${method} reached the new target`)
      return original(...args)
    })
  }
  assert.match(after(f, token), /changed: tree .*directory[\s\S]*LOCAL_CHANGE$/)
})

test('a replaced external hooks ancestor is reported without opening its target', t => {
  const f = fixture()
  const parent = path.join(f.dir, 'hooks-parent')
  const hooks = path.join(parent, 'hooks')
  const target = path.join(f.dir, 'new-target')
  fs.mkdirSync(hooks, { recursive: true })
  fs.mkdirSync(path.join(target, 'hooks'), { recursive: true })
  f.git('config', 'core.hooksPath', hooks)
  const token = before(f)
  fs.rmdirSync(hooks)
  fs.rmdirSync(parent)
  try { fs.symlinkSync(target, parent, 'dir') } catch (e) {
    if (!['EPERM', 'EACCES', 'ENOSYS', 'EOPNOTSUPP', 'ENOTSUP'].includes(e.code)) throw e
    return t.skip('directory symlinks are unavailable')
  }
  for (const method of ['lstatSync', 'openSync', 'readdirSync']) {
    const original = fs[method]
    t.mock.method(fs, method, (...args) => {
      if (typeof args[0] === 'string') assert.equal(args[0].startsWith(target), false, `${method} reached the new target`)
      return original(...args)
    })
  }
  assert.match(after(f, token), /changed: hooks .*hooks-parent[\s\S]*LOCAL_CHANGE$/)
})

for (const spelling of ['\\\\host\\share\\target', '//host/share/target']) {
  test(`network cwd component is refused before its target is inspected (${spelling})`, t => {
    const f = fixture()
    const component = path.join(f.root, 'network-component')
    const lstat = fs.lstatSync
    const readlink = fs.readlinkSync
    t.mock.method(fs, 'lstatSync', (...args) => {
      if (args[0] === component) return { isSymbolicLink: () => true }
      if (typeof args[0] === 'string') assert.equal(args[0].startsWith(spelling), false)
      return lstat(...args)
    })
    t.mock.method(fs, 'readlinkSync', (...args) => args[0] === component ? spelling : readlink(...args))
    const env = { vars: f.vars, run() { throw new Error('git must not start') } }
    assert.match(command(env, path.join(component, 'child'), 'before').out, /^UNVERIFIED local /)
  })
  for (const place of ['cwd', 'gitdir', 'include', 'hooks']) {
    test(`network ${place} is refused before filesystem access beneath it (${spelling})`, t => {
      const f = fixture()
      const own = path.join(f.root, '.git')
      const network = spelling
      const env = { vars: f.vars, run(_cmd, args) {
        const a = args.slice(2).join(' ')
        if (a === 'rev-parse --show-toplevel') return { code: 0, stdout: f.root, stderr: '' }
        if (a === 'rev-parse --path-format=absolute --git-dir --git-common-dir --git-path hooks') {
          return { code: 0, stdout: [place === 'gitdir' ? network : own, own, place === 'hooks' ? network : path.join(own, 'hooks')].join('\n'), stderr: '' }
        }
        if (a.startsWith('config --list --show-origin')) {
          return { code: 0, stdout: place === 'include' ? `command line:\0include.path\n${network}\0` : '', stderr: '' }
        }
        if (a === 'var GIT_CONFIG_SYSTEM') return { code: 0, stdout: f.vars.GIT_CONFIG_SYSTEM, stderr: '' }
        if (a === 'var GIT_CONFIG_GLOBAL') return { code: 0, stdout: f.vars.GIT_CONFIG_GLOBAL, stderr: '' }
        return { code: 1, stdout: '', stderr: '' }
      } }
      if (place === 'gitdir') {
        fs.rmSync(own, { recursive: true })
        fs.writeFileSync(own, `gitdir: ${network}\n`)
      }
      for (const method of ['lstatSync', 'readlinkSync', 'openSync', 'readdirSync']) {
        const original = fs[method]
        t.mock.method(fs, method, (...args) => {
          if (typeof args[0] === 'string') assert.equal(args[0].startsWith(network), false, `${method} reached network path`)
          return original(...args)
        })
      }
      assert.match(command(env, place === 'cwd' ? network : f.root, 'before').out, /^UNVERIFIED local /)
    })
  }
}

test('GIT_CONFIG is removed from every actual git child', () => {
  const f = fixture()
  const actual = path.join(f.dir, 'actual')
  const decoy = path.join(f.dir, 'decoy')
  fs.writeFileSync(actual, '')
  fs.writeFileSync(decoy, '[test]\nvalue = decoy\n')
  include(f, actual)
  f.vars.GIT_CONFIG = decoy
  const token = before(f)
  assert.ok(f.calls.length > 0)
  for (const call of f.calls) assert.equal(Object.hasOwn(call.opts.env, 'GIT_CONFIG'), false)
  fs.writeFileSync(actual, '[test]\nvalue = changed\n')
  assert.match(after(f, token), /changed: config /)
})

test('absent config ancestors are recorded, but inaccessible ancestors are unverified', t => {
  const f = fixture()
  const parent = path.join(f.dir, 'absent')
  const target = path.join(parent, 'included')
  include(f, target)
  const token = before(f)
  fs.mkdirSync(parent)
  fs.writeFileSync(target, '[test]\nvalue = present\n')
  assert.match(after(f, token), /changed: config /)
  const lstat = fs.lstatSync
  t.mock.method(fs, 'lstatSync', (...args) => {
    if (args[0] === parent) throw Object.assign(new Error('denied'), { code: 'EACCES' })
    return lstat(...args)
  })
  assert.match(command(f.env, f.root, 'before').out, /^UNVERIFIED local /)
})

test('linked hooks are unverified before delegation', t => {
  const f = fixture()
  const target = path.join(f.dir, 'hook-target')
  fs.mkdirSync(target)
  const link = path.join(f.dir, 'hook-link')
  try { fs.symlinkSync(target, link, 'dir') } catch (e) {
    if (!['EPERM', 'EACCES', 'ENOSYS', 'EOPNOTSUPP', 'ENOTSUP'].includes(e.code)) throw e
    return t.skip('directory symlinks are unavailable')
  }
  f.git('config', 'core.hooksPath', link)
  assert.match(command(f.env, f.root, 'before').out, /^UNVERIFIED local /)
})

test('replaced, edited, and linked manifests are unverified', t => {
  for (const kind of ['replacement', 'edit', 'link']) {
    const f = fixture()
    const token = before(f)
    const file = manifest(token)
    if (kind === 'replacement') { fs.unlinkSync(file); fs.writeFileSync(file, '{}') }
    if (kind === 'edit') fs.appendFileSync(file, 'x')
    if (kind === 'link') {
      const target = file + '.target'
      fs.renameSync(file, target)
      try { fs.symlinkSync(target, file, 'file') } catch (e) {
        fs.unlinkSync(target)
        if (!['EPERM', 'EACCES', 'ENOSYS', 'EOPNOTSUPP', 'ENOTSUP'].includes(e.code)) throw e
        return t.skip('file symlinks are unavailable')
      }
    }
    assert.match(after(f, token), /^local: unverified /, kind)
  }
})

test('every changed file is listed and wholly new directories are collapsed', () => {
  const f = fixture()
  const dir = path.join(f.root, 'existing')
  fs.mkdirSync(dir)
  for (let i = 0; i < 60; i++) fs.writeFileSync(path.join(dir, `file-${i}`), 'before')
  const token = before(f)
  for (let i = 0; i < 60; i++) fs.writeFileSync(path.join(dir, `file-${i}`), 'after')
  const added = path.join(f.root, 'added')
  fs.mkdirSync(path.join(added, 'nested'), { recursive: true })
  fs.writeFileSync(path.join(added, 'nested', 'file'), 'new')
  fs.mkdirSync(path.join(f.root, 'added-sibling'))
  fs.writeFileSync(path.join(f.root, 'added-sibling', 'file'), 'new')
  const out = after(f, token)
  assert.equal((out.match(/^changed: tree .*file-\d+$/gm) || []).length, 60)
  assert.match(out, /changed: tree .*added[\\/] \(new, \d+ entries\)/)
  assert.match(out, /changed: tree .*added-sibling[\\/] \(new, 1 entries\)/)
  assert.doesNotMatch(out, /changed: tree .*added[\\/]nested/)
  assert.match(out, /LOCAL_CHANGE$/)
})

test('hook executable mode changes are detected', { skip: process.platform === 'win32' }, () => {
  const f = fixture()
  const hook = path.join(f.root, '.git', 'hooks', 'pre-commit')
  fs.writeFileSync(hook, '#!/bin/sh\n')
  fs.chmodSync(hook, 0o600)
  const token = before(f)
  fs.chmodSync(hook, 0o700)
  assert.match(after(f, token), /changed: hooks .*pre-commit/)
})

test('a permissive manifest directory is refused', { skip: process.platform === 'win32' }, t => {
  const f = fixture()
  const dir = manifestDir
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const old = fs.statSync(dir).mode & 0o777
  t.after(() => fs.chmodSync(dir, old))
  fs.chmodSync(dir, 0o777)
  assert.match(command(f.env, f.root, 'before').out, /^UNVERIFIED local /)
})
