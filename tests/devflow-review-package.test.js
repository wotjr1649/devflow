'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const cp = require('child_process')
const zlib = require('zlib')
const tmpdir = require('./tmpdir')
const { safeGitEnv, safeGitArgs, createReviewPackage, readOriginalHead, remoteDeletionDecision } = require('../lib/devflow-review')

function run(cmd, args, opts = {}) {
  const r = cp.spawnSync(cmd, args, { ...opts, encoding: 'utf8', timeout: opts.timeout || 10000, windowsHide: true })
  return { code: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
}
function git(cwd, ...args) {
  const result = run('git', args, { cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull, GIT_TERMINAL_PROMPT: '0' } })
  assert.equal(result.code, 0, `git ${args[0]} failed: ${result.stderr}`)
  return result.stdout.trim()
}
function write(root, name, content) {
  const p = path.join(root, name)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}
function fixture(format = 'sha1') {
  const root = tmpdir('review-')
  git(root, 'init', '-b', 'main', `--object-format=${format}`)
  git(root, 'config', 'user.email', 'fixture@example.invalid')
  git(root, 'config', 'user.name', 'Review fixture')
  write(root, 'first.txt', 'original\n')
  git(root, 'add', '--', 'first.txt')
  git(root, 'commit', '-m', 'base')
  const baseOid = git(root, 'rev-parse', 'HEAD')
  const outputParent = tmpdir('packages-')
  return { root, baseOid, outputDir: path.join(outputParent, 'review'), vars: { ...process.env }, run }
}
function capture(f, extra = {}) {
  return createReviewPackage(f, f.root, { baseOid: f.baseOid, outputDir: f.outputDir, ...extra })
}
function ready(result) {
  assert.equal(result.code, 0, result.out)
  assert.equal(result.out, 'REVIEW_PACKAGE_READY')
  const diff = fs.readFileSync(result.diffPath, 'utf8')
  const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'))
  assert.equal(crypto.createHash('sha256').update(diff).digest('hex'), manifest.packageSha256)
  return { diff, manifest }
}
function probe(f) {
  const dir = tmpdir('program-')
  const marker = path.join(dir, 'invoked')
  const script = path.join(dir, 'probe.js')
  fs.writeFileSync(script, `#!/usr/bin/env node\nconst fs = require('fs'); fs.appendFileSync(${JSON.stringify(marker)}, process.argv.slice(2).join(' ') + '\\n'); if(process.argv[2]==='textconv') process.stdout.write(fs.readFileSync(process.argv[3])); if(process.argv[2]==='clean') process.stdout.write(fs.readFileSync(0));\n`)
  const command = kind => `"${process.execPath.replace(/\\/g, '/')}" "${script.replace(/\\/g, '/')}" ${kind}`
  fs.chmodSync(script, 0o755)
  return { marker, command, script }
}

test('the read profile strips executable, repository, tracing and config environment injection', () => {
  const input = { ...process.env, GIT_DIR: '/wrong', GIT_WORK_TREE: '/wrong', GIT_INDEX_FILE: '/wrong',
    GIT_CONFIG: '/wrong', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'diff.external', GIT_CONFIG_VALUE_0: 'bad',
    GIT_CONFIG_PARAMETERS: "'core.fsmonitor=bad'", GIT_EXTERNAL_DIFF: 'bad', GIT_DIFF_OPTS: '--ext-diff',
    GIT_PAGER: 'bad', PAGER: 'bad', GIT_TRACE: '/leak', GIT_REPLACE_REF_BASE: 'refs/evil/',
    GIT_EXEC_PATH: '/bad', GIT_ALTERNATE_OBJECT_DIRECTORIES: '/bad', LD_PRELOAD: '/bad', NODE_OPTIONS: '--require /bad' }
  const env = safeGitEnv(input)
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0',
    'GIT_CONFIG_VALUE_0', 'GIT_CONFIG_PARAMETERS', 'GIT_EXTERNAL_DIFF', 'GIT_DIFF_OPTS', 'GIT_PAGER', 'PAGER', 'GIT_TRACE',
    'GIT_REPLACE_REF_BASE', 'GIT_EXEC_PATH', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'LD_PRELOAD', 'NODE_OPTIONS']) assert.equal(env[key], undefined, key)
  assert.equal(env.GIT_NO_REPLACE_OBJECTS, '1')
  assert.equal(env.GIT_CONFIG_GLOBAL, os.devNull)
  assert.equal(input.GIT_DIR, '/wrong')
  const args = safeGitArgs(['--git-dir=/tmp/example', 'diff', 'a', 'b', '--'])
  assert.ok(args.includes('--no-pager'))
  assert.ok(args.includes('--no-replace-objects'))
  assert.ok(args.includes('core.fsmonitor=false'))
  assert.ok(args.includes('--no-ext-diff'))
  assert.ok(args.includes('--no-textconv'))
})

test('delivery baseline survives two commits and preserves staged, unstaged and untracked byte evidence', () => {
  const f = fixture()
  write(f.root, 'first.txt', 'first task\n')
  git(f.root, 'commit', '-am', 'first task')
  const taskBase = git(f.root, 'rev-parse', 'HEAD')
  write(f.root, 'second.txt', 'second task\n')
  git(f.root, 'add', '--', 'second.txt')
  git(f.root, 'commit', '-m', 'second task')
  write(f.root, 'first.txt', 'staged version\n')
  git(f.root, 'add', '--', 'first.txt')
  write(f.root, 'first.txt', 'working version\n')
  write(f.root, 'extra.txt', 'untracked version\r\n')
  const originalIndex = fs.readFileSync(path.join(f.root, '.git', 'index'))
  const { diff, manifest } = ready(capture(f))
  assert.notEqual(manifest.baseOid, taskBase)
  assert.equal(manifest.baseOid, f.baseOid)
  for (const text of ['+first task', '+second task', '+staged version', '+working version', '+untracked version']) assert.ok(diff.includes(text), text)
  assert.ok(diff.includes('+untracked version\r\n'))
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.git', 'index')), originalIndex)
  assert.equal(manifest.inputs.find(e => e.path === 'first.txt').worktree.sha256, crypto.createHash('sha256').update('working version\n').digest('hex'))
})

test('an explicit dirty selection leaves the complete committed delivery range visible', () => {
  const f = fixture()
  write(f.root, 'first.txt', 'committed change\n')
  git(f.root, 'commit', '-am', 'change')
  write(f.root, 'first.txt', 'omitted working change\n')
  write(f.root, 'chosen.txt', 'chosen working change\n')
  const { diff, manifest } = ready(capture(f, { dirtyPaths: ['chosen.txt'] }))
  assert.ok(diff.includes('+committed change'))
  assert.ok(diff.includes('+chosen working change'))
  assert.ok(!diff.includes('omitted working change'))
  assert.deepEqual(manifest.inputs.map(e => e.path), ['chosen.txt'])
})

test('repository diff.external executes in the fixture but never during static capture', () => {
  const f = fixture()
  const p = probe(f)
  write(f.root, 'first.txt', 'changed\n')
  git(f.root, 'config', 'diff.external', p.command('externaldiff'))
  git(f.root, 'diff')
  assert.ok(fs.readFileSync(p.marker, 'utf8').includes('externaldiff'))
  fs.unlinkSync(p.marker)
  ready(capture(f))
  assert.equal(fs.existsSync(p.marker), false)
})

test('textconv, filters, fsmonitor, hooks, pager, config includes and environment injection are inert', () => {
  const f = fixture()
  const p = probe(f)
  write(f.root, '.gitattributes', '*.txt diff=evil filter=evil\n')
  git(f.root, 'add', '--', '.gitattributes')
  git(f.root, 'commit', '-m', 'attributes')
  git(f.root, 'config', 'diff.evil.textconv', p.command('textconv'))
  write(f.root, 'first.txt', 'raw dirty bytes\r\n')
  git(f.root, 'diff')
  assert.ok(fs.readFileSync(p.marker, 'utf8').includes('textconv'))
  fs.unlinkSync(p.marker)
  git(f.root, 'config', 'core.fsmonitor', p.command('fsmonitor'))
  git(f.root, 'status', '--porcelain')
  assert.ok(fs.readFileSync(p.marker, 'utf8').includes('fsmonitor'))
  fs.unlinkSync(p.marker)
  for (const [key, value] of [['diff.external', p.command('externaldiff')], ['filter.evil.clean', p.command('clean')],
    ['filter.evil.smudge', p.command('smudge')], ['core.pager', p.command('pager')], ['core.hooksPath', path.dirname(p.marker)],
    ['include.path', path.join(path.dirname(p.marker), 'must-not-load')], ['core.worktree', path.dirname(p.marker)]]) git(f.root, 'config', key, value)
  f.vars = { ...f.vars, GIT_DIR: path.join(path.dirname(p.marker), 'invalid'), GIT_EXTERNAL_DIFF: p.command('env-diff'),
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: p.command('env-monitor'), GIT_PAGER: p.command('pager') }
  const { diff } = ready(capture(f))
  assert.ok(diff.includes('+raw dirty bytes\r\n'))
  assert.equal(fs.existsSync(p.marker), false)
})

test('replacement refs cannot conceal the original reviewed commit or alter its identity', () => {
  const f = fixture()
  write(f.root, 'first.txt', 'publishable original change\n')
  git(f.root, 'commit', '-am', 'original change')
  const headOid = git(f.root, 'rev-parse', 'HEAD')
  git(f.root, 'replace', headOid, f.baseOid)
  assert.equal(git(f.root, 'show', 'HEAD:first.txt'), 'original')
  const replacementFile = path.join(f.root, '.git', 'refs', 'replace', headOid)
  const replacementBytes = fs.readFileSync(replacementFile)
  const { diff, manifest } = ready(capture(f, { headOid, dirtyPaths: [] }))
  assert.equal(manifest.headOid, headOid)
  assert.ok(diff.includes('+publishable original change'))
  assert.deepEqual(fs.readFileSync(replacementFile), replacementBytes)
})

test('capturing a changed dirty file fails closed without publishing a package', () => {
  const f = fixture()
  write(f.root, 'first.txt', 'before\n')
  const originalRun = f.run
  let changed = false
  f.run = (cmd, args, opts) => {
    if (!changed && args.includes('diff')) { changed = true; write(f.root, 'first.txt', 'after!\n') }
    return originalRun(cmd, args, opts)
  }
  const result = capture(f)
  assert.equal(result.code, 1)
  assert.match(result.out, /NOT_VERIFIED.*changed/)
  assert.equal(fs.existsSync(f.outputDir), false)
})

test('ref, index, config and untracked-set drift each fail closed', async t => {
  for (const kind of ['ref', 'index', 'config', 'untracked']) await t.test(kind, () => {
    const f = fixture()
    const originalRun = f.run
    let changed = false
    f.run = (cmd, args, opts) => {
      if (!changed && args.includes('diff')) {
        changed = true
        if (kind === 'ref') write(f.root, '.git/refs/heads/new-ref', f.baseOid + '\n')
        if (kind === 'index') fs.appendFileSync(path.join(f.root, '.git', 'index'), 'changed')
        if (kind === 'config') fs.appendFileSync(path.join(f.root, '.git', 'config'), '\n[devflow]\nchange = yes\n')
        if (kind === 'untracked') write(f.root, 'new-file.txt', 'appeared\n')
      }
      return originalRun(cmd, args, opts)
    }
    const result = capture(f)
    assert.equal(result.code, 1)
    assert.match(result.out, /NOT_VERIFIED.*changed/)
    assert.equal(fs.existsSync(f.outputDir), false)
  })
})

test('original bytes in binary files remain lossless in a Git binary patch', () => {
  const f = fixture()
  write(f.root, 'bytes.bin', Buffer.from([0, 0xff, 0x7f, 10]))
  const { diff, manifest } = ready(capture(f))
  assert.match(diff, /GIT binary patch/)
  assert.equal(manifest.inputs.find(e => e.path === 'bytes.bin').worktree.sha256, crypto.createHash('sha256').update(Buffer.from([0, 0xff, 0x7f, 10])).digest('hex'))
})

test('deleted nested files and literal newlines in filenames are captured without shell parsing', () => {
  const f = fixture()
  write(f.root, 'folder/removed.txt', 'will disappear\n')
  git(f.root, 'add', '--', 'folder/removed.txt')
  git(f.root, 'commit', '-m', 'nested')
  fs.rmSync(path.join(f.root, 'folder'), { recursive: true })
  const weird = process.platform === 'win32' ? 'literal file.txt' : 'literal\nfile.txt'
  write(f.root, weird, 'literal name\n')
  const { diff, manifest } = ready(capture(f))
  assert.match(diff, /-will disappear/)
  assert.ok(manifest.inputs.some(e => e.path === weird))
})

test('full SHA-256 repositories retain object-format identity', () => {
  const f = fixture('sha256')
  write(f.root, 'first.txt', 'sha256 change\n')
  git(f.root, 'commit', '-am', 'change')
  const { diff, manifest } = ready(capture(f))
  assert.equal(manifest.objectFormat, 'sha256')
  assert.equal(manifest.headOid.length, 64)
  assert.ok(diff.includes('+sha256 change'))
})

test('linked worktree captures its own index and the shared original object database', () => {
  const f = fixture()
  const linked = path.join(tmpdir('linked-'), 'checkout')
  git(f.root, 'worktree', 'add', '-b', 'task', linked)
  write(linked, 'first.txt', 'linked working bytes\n')
  const { diff } = ready(createReviewPackage(f, linked, { baseOid: f.baseOid, outputDir: f.outputDir }))
  assert.ok(diff.includes('+linked working bytes'))
})

test('unsafe dirty paths, stale HEAD and existing output are rejected', async t => {
  for (const dirtyPath of ['../escape', '/absolute', 'a/../../escape', '.git/config', 'a\\b']) await t.test(dirtyPath, () => {
    const f = fixture()
    assert.equal(capture(f, { dirtyPaths: [dirtyPath] }).code, 1)
  })
  await t.test('stale head', () => {
    const f = fixture()
    write(f.root, 'first.txt', 'new commit\n')
    git(f.root, 'commit', '-am', 'change')
    const result = capture(f, { headOid: f.baseOid })
    assert.match(result.out, /NOT_VERIFIED.*identity changed/)
  })
  await t.test('existing output', () => {
    const f = fixture()
    fs.mkdirSync(f.outputDir)
    fs.writeFileSync(path.join(f.outputDir, 'manifest.json'), 'retain me')
    assert.equal(capture(f).code, 1)
    assert.equal(fs.readFileSync(path.join(f.outputDir, 'manifest.json'), 'utf8'), 'retain me')
  })
})

test('symlink blobs are read as link text and symlink ancestors fail closed', { skip: process.platform === 'win32' ? 'native Windows symlink capability requires separate validation' : false }, () => {
  const f = fixture()
  const outside = tmpdir('outside-')
  write(outside, 'private.txt', 'outside content must not be read\n')
  fs.symlinkSync(path.join(outside, 'private.txt'), path.join(f.root, 'link.txt'))
  const { diff } = ready(capture(f, { dirtyPaths: ['link.txt'] }))
  assert.ok(diff.includes(path.join(outside, 'private.txt')))
  assert.ok(!diff.includes('outside content must not be read'))
  fs.symlinkSync(outside, path.join(f.root, 'directory'))
  const result = capture(f, { outputDir: path.join(path.dirname(f.outputDir), 'second'), dirtyPaths: ['directory/private.txt'] })
  assert.match(result.out, /NOT_VERIFIED.*symlink ancestor/)
})

test('F2 first-rollout decision holds absent atomic deletion support, including a changed remote tip', () => {
  const reviewedOid = '1'.repeat(40)
  assert.deepEqual(remoteDeletionDecision({ reviewedOid, currentOid: reviewedOid }), { status: 'HELD', reason: 'atomic_remote_delete_unavailable' })
  assert.deepEqual(remoteDeletionDecision({ reviewedOid, currentOid: '2'.repeat(40) }), { status: 'HELD', reason: 'remote_tip_changed' })
  assert.deepEqual(remoteDeletionDecision({}), { status: 'HELD', reason: 'missing_reviewed_oid' })
})

test('a fixed empty attributes tree prevents mutable attributes from hiding binary review bytes', () => {
  const f = fixture()
  write(f.root, '.gitattributes', '*.bin diff\n')
  write(f.root, 'bytes.bin', Buffer.from([0, 0xff, 0x7f, 10]))
  const { diff } = ready(capture(f, { dirtyPaths: ['bytes.bin'] }))
  assert.match(diff, /GIT binary patch/)
})

test('a repository-local Git executable cannot shadow the trusted host binary', { skip: process.platform === 'win32' ? 'native executable selection requires separate Windows validation' : false }, () => {
  const f = fixture()
  const marker = path.join(f.root, 'must-not-execute')
  write(f.root, 'bin/git', `#!/bin/sh\nprintf unsafe > '${marker}'\nexit 1\n`)
  fs.chmodSync(path.join(f.root, 'bin', 'git'), 0o755)
  f.vars.PATH = path.join(f.root, 'bin') + path.delimiter + f.vars.PATH
  ready(capture(f, { dirtyPaths: [] }))
  assert.equal(fs.existsSync(marker), false)
})

test('repository programs remain excluded through root aliases and external Git metadata', { skip: process.platform === 'win32' ? 'native executable and symlink selection requires separate Windows validation' : false }, async t => {
  for (const kind of ['root symlink', 'parent symlink', 'external gitdir', 'linked common gitdir']) await t.test(kind, () => {
    const f = fixture()
    let cwd = f.root
    let programRoot = f.root
    if (kind === 'root symlink') {
      cwd = path.join(tmpdir('root-alias-'), 'repository')
      fs.symlinkSync(f.root, cwd)
    } else if (kind === 'parent symlink') {
      const alias = path.join(tmpdir('parent-alias-'), 'parent')
      fs.symlinkSync(path.dirname(f.root), alias)
      cwd = path.join(alias, path.basename(f.root))
    } else if (kind === 'external gitdir') {
      programRoot = path.join(tmpdir('external-git-'), 'metadata')
      fs.renameSync(path.join(f.root, '.git'), programRoot)
      write(f.root, '.git', `gitdir: ${programRoot}\n`)
    } else {
      cwd = path.join(tmpdir('linked-program-'), 'checkout')
      git(f.root, 'worktree', 'add', '-b', 'task', cwd)
      programRoot = path.join(f.root, '.git')
    }
    const marker = path.join(tmpdir('execution-'), 'must-not-execute')
    // A forwarding program would let all Git calls succeed, so READY alone cannot establish this boundary.
    write(programRoot, 'bin/git', `#!/usr/bin/env node\nconst fs = require('fs'); fs.appendFileSync(${JSON.stringify(marker)}, 'executed\\n'); const r = require('child_process').spawnSync('git', process.argv.slice(2), {stdio:'inherit', env:{...process.env, PATH:${JSON.stringify(process.env.PATH)}}}); process.exit(r.status === null ? 1 : r.status);\n`)
    fs.chmodSync(path.join(programRoot, 'bin', 'git'), 0o755)
    f.vars.PATH = path.join(programRoot, 'bin') + path.delimiter + f.vars.PATH
    assert.equal(readOriginalHead(f, cwd).headOid, f.baseOid)
    ready(createReviewPackage(f, cwd, { baseOid: f.baseOid, outputDir: f.outputDir, dirtyPaths: [] }))
    assert.equal(fs.existsSync(marker), false, `${kind} executed a repository-owned program`)
  })
})

test('mismatched loose blob, tree and commit bytes cannot claim the original object identity', async t => {
  for (const format of ['sha1', 'sha256']) for (const type of ['blob', 'tree', 'commit']) await t.test(`${format} ${type}`, () => {
    const f = fixture(format)
    write(f.root, 'first.txt', 'actual committed payload\n')
    git(f.root, 'commit', '-am', 'change')
    const headOid = git(f.root, 'rev-parse', 'HEAD')
    const objectOid = git(f.root, 'rev-parse', type === 'blob' ? 'HEAD:first.txt' : type === 'tree' ? 'HEAD^{tree}' : 'HEAD')
    const objectPath = path.join(f.root, '.git', 'objects', objectOid.slice(0, 2), objectOid.slice(2))
    const original = zlib.inflateSync(fs.readFileSync(objectPath))
    let payload = original.subarray(original.indexOf(0) + 1)
    if (type === 'blob') payload = Buffer.from('forged review payload\n')
    else if (type === 'commit') payload = Buffer.concat([payload, Buffer.from('forged message\n')])
    else {
      payload = Buffer.from(payload)
      const name = payload.indexOf(Buffer.from('first.txt\0'))
      assert.notEqual(name, -1)
      Buffer.from('other.txt').copy(payload, name)
    }
    const forged = Buffer.concat([Buffer.from(`${type} ${payload.length}\0`), payload])
    assert.notEqual(crypto.createHash(format).update(forged).digest('hex'), objectOid)
    fs.unlinkSync(objectPath)
    fs.writeFileSync(objectPath, zlib.deflateSync(forged))
    // These are valid zlib/Git object bytes at the wrong OID, not merely unreadable object files.
    const check = run('git', ['fsck', '--full'], { cwd: f.root, env: f.vars })
    assert.notEqual(check.code, 0)
    assert.match(check.stderr, /hash-path mismatch|hash mismatch/)
    const result = capture(f, { headOid, dirtyPaths: [] })
    assert.equal(result.code, 1, result.out)
    assert.match(result.out, /NOT_VERIFIED.*fsck/)
    assert.match(readOriginalHead(f, f.root).out, /NOT_VERIFIED.*fsck/)
    assert.equal(fs.existsSync(f.outputDir), false)
  })
})

test('intact packed objects retain the original review contents', () => {
  const f = fixture()
  write(f.root, 'first.txt', 'packed original payload\n')
  git(f.root, 'commit', '-am', 'packed change')
  const headOid = git(f.root, 'rev-parse', 'HEAD')
  git(f.root, 'repack', '-a', '-d')
  const { diff, manifest } = ready(capture(f, { headOid, dirtyPaths: [] }))
  assert.equal(manifest.headOid, headOid)
  assert.ok(diff.includes('+packed original payload'))
})

test('raw symlink target bytes are preserved without UTF-8 replacement collisions', { skip: process.platform === 'win32' ? 'raw POSIX symlink target bytes require separate native Windows validation' : false }, async t => {
  await t.test('a changed invalid target cannot become an empty verified patch', () => {
    const f = fixture()
    const link = path.join(f.root, 'link')
    fs.symlinkSync('\ufffd', link)
    git(f.root, 'add', '--', 'link')
    git(f.root, 'commit', '-m', 'track valid target')
    f.baseOid = git(f.root, 'rev-parse', 'HEAD')
    fs.unlinkSync(link)
    fs.symlinkSync(Buffer.from([0xff]), link)
    assert.deepEqual(fs.readlinkSync(link, { encoding: 'buffer' }), Buffer.from([0xff]))
    assert.ok(git(f.root, 'diff', '--raw').includes('link'))
    const result = capture(f)
    assert.equal(result.code, 1, result.out)
    assert.match(result.out, /NOT_VERIFIED.*UTF-8/)
    assert.equal(fs.existsSync(f.outputDir), false)
  })
  await t.test('an unchanged raw target has its exact byte length and digest', () => {
    const f = fixture()
    const bytes = Buffer.from([0xff])
    fs.symlinkSync(bytes, path.join(f.root, 'link'))
    git(f.root, 'add', '--', 'link')
    git(f.root, 'commit', '-m', 'track raw target')
    f.baseOid = git(f.root, 'rev-parse', 'HEAD')
    const { manifest } = ready(capture(f))
    assert.deepEqual(manifest.inputs.find(e => e.path === 'link').worktree,
      { mode: '120000', bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
  })
  await t.test('different invalid targets are detected as changed bytes', () => {
    const f = fixture()
    const link = path.join(f.root, 'link')
    fs.symlinkSync(Buffer.from([0xff]), link)
    git(f.root, 'add', '--', 'link')
    git(f.root, 'commit', '-m', 'track raw target')
    f.baseOid = git(f.root, 'rev-parse', 'HEAD')
    const originalRun = f.run
    let changed = false
    f.run = (cmd, args, opts) => {
      if (!changed && args.includes('diff')) {
        changed = true
        fs.unlinkSync(link)
        fs.symlinkSync(Buffer.from([0xfe]), link)
      }
      return originalRun(cmd, args, opts)
    }
    assert.match(capture(f).out, /NOT_VERIFIED.*changed/)
    assert.equal(fs.existsSync(f.outputDir), false)
  })
})

test('an unrepresentable symlink ancestor is rejected before any Git execution', { skip: process.platform === 'win32' ? 'raw POSIX pathname bytes require separate native Windows validation' : false }, () => {
  const f = fixture()
  const actual = Buffer.concat([Buffer.from(path.join(tmpdir('raw-root-'), 'repository-')), Buffer.from([0xff])])
  fs.renameSync(f.root, actual)
  const alias = path.join(tmpdir('raw-alias-'), 'checkout')
  fs.symlinkSync(actual, alias)
  let calls = 0
  f.run = () => { calls++; return { code: 1, stdout: '', stderr: '' } }
  assert.match(readOriginalHead(f, alias).out, /NOT_VERIFIED.*path encoding/)
  assert.equal(calls, 0)
})

test('clean sparse and skip-worktree indexes are held rather than reported as deletions', async t => {
  for (const kind of ['sparse checkout', 'sparse index', 'manual skip-worktree']) await t.test(kind, () => {
    const f = fixture()
    write(f.root, 'keep/visible.txt', 'visible\n')
    write(f.root, 'omit/hidden.txt', 'valid committed file\n')
    git(f.root, 'add', '--', '.')
    git(f.root, 'commit', '-m', 'tree')
    f.baseOid = git(f.root, 'rev-parse', 'HEAD')
    if (kind === 'manual skip-worktree') {
      git(f.root, 'update-index', '--skip-worktree', 'omit/hidden.txt')
      fs.unlinkSync(path.join(f.root, 'omit', 'hidden.txt'))
    } else {
      git(f.root, 'sparse-checkout', 'init', '--cone', ...(kind === 'sparse index' ? ['--sparse-index'] : []))
      git(f.root, 'sparse-checkout', 'set', 'keep')
    }
    assert.equal(git(f.root, 'status', '--porcelain=v1'), '')
    const result = capture(f)
    assert.equal(result.code, 1, result.out)
    assert.match(result.out, /NOT_VERIFIED.*sparse|NOT_VERIFIED.*skip-worktree/)
    assert.equal(fs.existsSync(f.outputDir), false)
  })
})

test('unsupported object alternates, future repository formats, unmerged indexes and metadata output are held', async t => {
  await t.test('source object alternate', () => {
    const f = fixture()
    write(f.root, '.git/objects/info/alternates', tmpdir('other-objects-') + '\n')
    assert.match(capture(f).out, /NOT_VERIFIED.*alternates/)
  })
  await t.test('unknown repository extension', () => {
    const f = fixture()
    fs.appendFileSync(path.join(f.root, '.git', 'config'), '\n[extensions]\nfuture = true\n')
    assert.match(capture(f).out, /NOT_VERIFIED.*extension/)
  })
  await t.test('unmerged index', () => {
    const f = fixture()
    const blob = git(f.root, 'rev-parse', 'HEAD:first.txt')
    const result = run('git', ['update-index', '--index-info'], { cwd: f.root, input: `0 ${'0'.repeat(40)}\tfirst.txt\n100644 ${blob} 1\tfirst.txt\n100644 ${blob} 2\tfirst.txt\n`, env: f.vars })
    assert.equal(result.code, 0)
    assert.match(capture(f).out, /NOT_VERIFIED.*unmerged/)
  })
  await t.test('Git metadata output', () => {
    const f = fixture()
    assert.match(capture(f, { outputDir: path.join(f.root, '.git', 'unsafe-package') }).out, /NOT_VERIFIED.*Git metadata/)
    assert.equal(fs.existsSync(path.join(f.root, '.git', 'unsafe-package')), false)
  })
})

test('non-UTF-8 textual diff bytes are held instead of silently substituting characters', () => {
  const f = fixture()
  write(f.root, 'invalid.txt', Buffer.from([0xff, 10]))
  const result = capture(f)
  assert.match(result.out, /NOT_VERIFIED.*UTF-8/)
  assert.equal(fs.existsSync(f.outputDir), false)
})

test('special files cannot block the raw byte reader', { skip: process.platform === 'win32' ? 'FIFO fixture is POSIX-only' : false }, () => {
  const f = fixture()
  const result = run('mkfifo', [path.join(f.root, 'pipe')])
  assert.equal(result.code, 0)
  assert.match(capture(f, { dirtyPaths: ['pipe'] }).out, /NOT_VERIFIED.*special files/)
})

test('original HEAD identity uses the same isolated reader and does not create a package', () => {
  const f = fixture()
  write(f.root, 'first.txt', 'original change\n')
  git(f.root, 'commit', '-am', 'change')
  const headOid = git(f.root, 'rev-parse', 'HEAD')
  git(f.root, 'replace', headOid, f.baseOid)
  const p = probe(f)
  git(f.root, 'config', 'core.fsmonitor', p.command('fsmonitor'))
  git(f.root, 'config', 'include.path', path.join(path.dirname(p.marker), 'unread-include'))
  git(f.root, 'config', 'core.worktree', path.dirname(p.marker))
  const result = readOriginalHead(f, f.root)
  assert.deepEqual(result, { code: 0, out: 'ORIGINAL_HEAD_READY', headOid, objectFormat: 'sha1' })
  assert.equal(fs.existsSync(p.marker), false)
  assert.equal(fs.existsSync(f.outputDir), false)
})

test('signed commit display cannot execute a configured signature program through the read profile', { skip: process.platform === 'win32' ? 'native custom signature executable fixture requires Windows validation' : false }, () => {
  const f = fixture()
  const p = probe(f)
  const tree = git(f.root, 'rev-parse', 'HEAD^{tree}')
  const commitText = `tree ${tree}\nparent ${f.baseOid}\nauthor Fixture <fixture@example.invalid> 1 +0000\ncommitter Fixture <fixture@example.invalid> 1 +0000\ngpgsig -----BEGIN PGP SIGNATURE-----\n AA==\n -----END PGP SIGNATURE-----\n\nsigned fixture\n`
  const object = run('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], { cwd: f.root, input: commitText, env: f.vars })
  assert.equal(object.code, 0)
  git(f.root, 'update-ref', 'HEAD', object.stdout.trim())
  git(f.root, 'config', 'gpg.program', p.script)
  git(f.root, 'config', 'log.showSignature', 'true')
  git(f.root, 'show', '--no-patch', 'HEAD')
  assert.equal(fs.existsSync(p.marker), true)
  fs.unlinkSync(p.marker)
  const guarded = run('git', safeGitArgs(['show', '--no-patch', 'HEAD']), { cwd: f.root, env: safeGitEnv(f.vars) })
  assert.equal(guarded.code, 0, guarded.stderr)
  ready(capture(f, { dirtyPaths: [] }))
  assert.equal(fs.existsSync(p.marker), false)
})
