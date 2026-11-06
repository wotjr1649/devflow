'use strict'
// Static review input, built in a private scratch repository. The source repository's configuration is parsed
// without includes but never used to execute Git. This is a read guard, not an OS sandbox or an atomic FS snapshot.
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const MAX_ENTRIES = 20000
const MAX_BYTES = 64 * 1024 * 1024
// Git for Windows accepts nul; Node's \\.\nul is rejected as a config override. Use nul for hooks too because
// native Node launches do not perform Git Bash's /dev/null translation before Git appends the hook name.
const GIT_NULL = process.platform === 'win32' ? 'nul' : '/dev/null'
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const fail = reason => { throw new Error(reason) }
const inside = (parent, p) => { const rel = path.relative(parent, p); return !rel || rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel) }
const network = p => /^(?:\\\\|\/\/)/.test(p) || process.platform === 'win32' && /^[\\/]/.test(p) && !/^[\\/]{2}[?.][\\/][A-Za-z]:[\\/]/.test(p)

function safeGitEnv(vars = process.env) {
  // An allowlist also removes GIT_CONFIG_PARAMETERS/COUNT/KEY_*, alternate object/index paths, tracing, exec paths,
  // loader injection and credential helpers. Host executable and OS trust remain outside this guard.
  const keep = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'])
  const clean = {}
  for (const [key, value] of Object.entries(vars)) if (keep.has(key.toUpperCase()) && value !== undefined) clean[key] = value
  return { ...clean, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: GIT_NULL, GIT_CONFIG_GLOBAL: GIT_NULL,
    GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0',
    GIT_ATTR_NOSYSTEM: '1', LC_ALL: 'C', NoDefaultCurrentDirectoryInExePath: '1' }
}

// Fixed command arguments only: this wrapper is not an authorization boundary for arbitrary caller commands.
function safeGitArgs(args) {
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) fail('invalid Git arguments')
  const out = [...args]
  const command = out.findIndex(arg => ['diff', 'show'].includes(arg))
  if (command !== -1) out.splice(command + 1, 0, '--no-ext-diff', '--no-textconv', ...(out[command] === 'show' ? ['--no-show-signature'] : []))
  return ['--no-pager', '--no-optional-locks', '--no-replace-objects', '--no-lazy-fetch',
    '-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${GIT_NULL}`, '-c', `core.attributesFile=${GIT_NULL}`,
    '-c', 'submodule.recurse=false', '-c', 'core.untrackedCache=false', '-c', 'core.ignoreStat=false', '-c', 'core.commitGraph=false',
    '-c', 'log.showSignature=false', '-c', 'color.ui=false', ...out]
}

// Paths must round-trip before they are followed or compared. A decoded replacement character must not turn a
// different native pathname into an apparently safe alias. Symlink blob contents below remain raw Buffers instead.
function pathText(bytes) {
  const text = bytes.toString('utf8')
  if (text.includes('\0') || !Buffer.from(text).equals(bytes)) fail('unsupported filesystem path encoding')
  return text
}

// Check link text before following any path, including parent components. Mapped drives and same-user races need
// host isolation; an ordinary pathname guard cannot rule them out.
function local(p) {
  if (typeof p !== 'string' || network(p)) fail('network or invalid path')
  if (p.includes('\0') || Buffer.from(p).toString('utf8') !== p) fail('unsupported filesystem path encoding')
  const resolved = path.resolve(p)
  let done = path.parse(resolved).root
  let rest = resolved.slice(done.length).split(path.sep).filter(Boolean)
  let links = 0
  while (rest.length) {
    const name = rest.shift()
    const candidate = path.join(done, name)
    let st
    try { st = fs.lstatSync(candidate) } catch (e) { if (e.code === 'ENOENT') return; throw e }
    if (!st.isSymbolicLink()) { if (rest.length && !st.isDirectory()) fail('path component is not a directory'); done = candidate; continue }
    const target = pathText(fs.readlinkSync(candidate, { encoding: 'buffer' }))
    if (network(target) || ++links > 8) fail('network or excessive path links')
    const next = path.resolve(done, target)
    done = path.parse(next).root
    rest = [...next.slice(done.length).split(path.sep).filter(Boolean), ...rest]
  }
}

function canonicalPath(p) {
  local(p)
  return pathText(fs.realpathSync(p, { encoding: 'buffer' }))
}

function plainBytes(p, limit = MAX_BYTES) {
  local(path.dirname(p))
  const before = fs.lstatSync(p, { bigint: true })
  if (!before.isFile() || before.size > BigInt(limit)) fail('unsupported or oversized input file')
  const same = st => st.isFile() && ['dev', 'ino', 'size', 'mode', 'mtimeNs', 'ctimeNs'].every(k => st[k] === before[k])
  let fd
  try {
    fd = fs.openSync(p, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0) | (fs.constants.O_NOFOLLOW || 0))
    if (!same(fs.fstatSync(fd, { bigint: true })) || !same(fs.lstatSync(p, { bigint: true }))) fail('input changed while opening')
    const data = fs.readFileSync(fd)
    if (BigInt(data.length) !== before.size || !same(fs.fstatSync(fd, { bigint: true })) || !same(fs.lstatSync(p, { bigint: true }))) fail('input changed while reading')
    return data
  } finally { if (fd !== undefined) fs.closeSync(fd) }
}

function optionalBytes(p, limit) {
  try { return plainBytes(p, limit) } catch (e) { if (e.code === 'ENOENT') return null; throw e }
}

function literalPath(p) {
  if (typeof p !== 'string' || !p || p.includes('\0') || p.includes('\ufffd') || p.includes('\\') || path.posix.isAbsolute(p) ||
      p.split('/').some(c => !c || c === '.' || c === '..' || c.toLowerCase() === '.git') || /^[A-Za-z]:/.test(p)) fail('unsupported repository path')
  return p
}

function findLayout(cwd) {
  local(cwd)
  let root = path.resolve(cwd)
  while (!fs.existsSync(path.join(root, '.git'))) {
    const parent = path.dirname(root)
    if (parent === root) fail('not a worktree')
    root = parent
  }
  const dotgit = path.join(root, '.git')
  local(dotgit)
  const st = fs.lstatSync(dotgit)
  let own, gitdirPointer = null
  if (st.isDirectory() && !st.isSymbolicLink()) own = dotgit
  else if (st.isFile()) {
    gitdirPointer = plainBytes(dotgit, 4096)
    const text = pathText(gitdirPointer)
    const m = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(text)
    if (!m || network(m[1])) fail('invalid gitdir pointer')
    own = path.resolve(root, m[1])
  } else fail('unsupported .git layout')
  local(own)
  const pointer = optionalBytes(path.join(own, 'commondir'), 4096)
  const commonLine = pointer && /^([^\r\n]+)\r?\n?$/.exec(pathText(pointer))
  if (pointer && !commonLine) fail('invalid commondir pointer')
  const commonText = commonLine && commonLine[1]
  if (commonText && network(commonText)) fail('network commondir pointer')
  const common = commonText ? path.resolve(own, commonText) : own
  local(common)
  const objects = path.join(common, 'objects')
  local(objects)
  if (!fs.lstatSync(objects).isDirectory() || fs.lstatSync(objects).isSymbolicLink()) fail('unsupported object directory')
  const layout = { root, own, common, dotgit, objects, gitdirPointer, commondirPointer: pointer }
  return { ...layout, binding: layoutBinding(layout) }
}

function layoutBinding(layout) {
  return JSON.stringify([layout.root, layout.own, layout.common, layout.objects].map(p => {
    local(p)
    const st = fs.statSync(p, { bigint: true })
    if (!st.isDirectory()) fail('repository directory binding changed')
    return [canonicalPath(p), String(st.dev), String(st.ino)]
  }))
}

function gitExecutable(vars, layout) {
  // Both sides use canonical paths, including symlinked parents. Keep the original layout spellings for drift
  // checks, but never compare one of them lexically to a resolved executable. Linked/separate Git metadata is owned
  // by the source repository too, even when it lives outside the current worktree.
  const excluded = [layout.root, layout.own, layout.common, layout.objects].map(canonicalPath)
  const entry = key => Object.entries(vars).find(([k]) => k.toUpperCase() === key)?.[1]
  for (const dir of (entry('PATH') || '').split(path.delimiter)) {
    if (!path.isAbsolute(dir) || network(dir)) continue
    const candidate = path.join(dir, process.platform === 'win32' ? 'git.exe' : 'git')
    local(candidate)
    let resolved
    try { resolved = canonicalPath(candidate) } catch (e) { if (['ENOENT', 'ENOTDIR'].includes(e.code)) continue; throw e }
    if (excluded.some(root => inside(root, resolved)) || !fs.statSync(resolved).isFile()) continue
    try { fs.accessSync(resolved, fs.constants.X_OK) } catch { continue }
    return resolved
  }
  fail('trusted host Git executable unavailable')
}

function metadata(layout) {
  const records = new Map()
  let total = 0
  const add = (name, p, limit = MAX_BYTES) => {
    const bytes = optionalBytes(p, limit)
    total += bytes?.length || 0
    if (total > MAX_BYTES || records.size >= MAX_ENTRIES) fail('metadata snapshot limit exceeded')
    records.set(name, bytes)
    return bytes
  }
  if (fs.lstatSync(layout.dotgit).isFile()) add('gitdir-pointer', layout.dotgit, 4096)
  add('commondir-pointer', path.join(layout.own, 'commondir'), 4096)
  add('config', path.join(layout.common, 'config'), 1024 * 1024)
  add('config.worktree', path.join(layout.own, 'config.worktree'), 1024 * 1024)
  add('HEAD', path.join(layout.own, 'HEAD'), 4096)
  add('index', path.join(layout.own, 'index'))
  add('packed-refs', path.join(layout.common, 'packed-refs'))
  add('shallow', path.join(layout.common, 'shallow'))
  add('info/exclude', path.join(layout.common, 'info', 'exclude'), 1024 * 1024)
  const alternates = add('alternates', path.join(layout.objects, 'info', 'alternates'), 1024 * 1024)
  if (alternates && alternates.length) fail('object alternates are not supported by the first review reader')
  const refs = path.join(layout.common, 'refs')
  const visit = (p, name) => {
    local(path.dirname(p))
    let st
    try { st = fs.lstatSync(p) } catch (e) { if (e.code === 'ENOENT') return; throw e }
    if (st.isDirectory() && !st.isSymbolicLink()) {
      for (const part of fs.readdirSync(p, { encoding: 'buffer' }).map(pathText).sort()) visit(path.join(p, part), name + '/' + part)
    } else {
      if (records.size >= MAX_ENTRIES) fail('metadata entry limit exceeded')
      add(name, p, 1024 * 1024)
    }
  }
  visit(refs, 'refs')
  return records
}

const signature = records => hash(Buffer.from(JSON.stringify([...records].map(([name, bytes]) => [name, bytes === null ? null : hash(bytes)]))))

function parseEntries(text, index = false) {
  if (typeof text !== 'string' || text.includes('\ufffd')) fail('Git returned an unsupported text encoding')
  const entries = new Map()
  for (const record of text.split('\0').filter(Boolean)) {
    const m = index ? /^(\d{6}) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/.exec(record)
      : /^(\d{6}) (blob|commit) ([0-9a-f]+)\t([\s\S]+)$/.exec(record)
    if (!m || index && m[3] !== '0') fail('unsupported or unmerged index/tree entry')
    const name = literalPath(m[4])
    const oid = index ? m[2] : m[3]
    if (!OID.test(oid) || /^0+$/.test(oid) || !['100644', '100755', '120000', '160000'].includes(m[1]) || entries.has(name)) fail('unsupported index/tree entry')
    entries.set(name, { mode: m[1], oid })
  }
  return entries
}

function worktreeEntry(root, name) {
  const p = path.join(root, ...literalPath(name).split('/'))
  // Walk from the root so a missing directory is a deletion, and no symlink ancestor is followed.
  let parent = root
  for (const part of name.split('/').slice(0, -1)) {
    parent = path.join(parent, part)
    let ancestor
    try { ancestor = fs.lstatSync(parent) } catch (e) { if (['ENOENT', 'ENOTDIR'].includes(e.code)) return null; throw e }
    if (ancestor.isSymbolicLink()) fail('dirty path has a symlink ancestor')
    if (!ancestor.isDirectory()) return null
  }
  let st
  try { st = fs.lstatSync(p, { bigint: true }) } catch (e) { if (e.code === 'ENOENT') return null; throw e }
  if (st.isSymbolicLink()) {
    const bytes = fs.readlinkSync(p, { encoding: 'buffer' })
    const after = fs.lstatSync(p, { bigint: true })
    if (!after.isSymbolicLink() || ['dev', 'ino', 'size', 'mode', 'mtimeNs', 'ctimeNs'].some(k => after[k] !== st[k]) ||
        !fs.readlinkSync(p, { encoding: 'buffer' }).equals(bytes)) fail('symlink changed while reading')
    return { mode: '120000', bytes, sha256: hash(bytes) }
  }
  if (!st.isFile()) fail('dirty submodules, directories and special files require a separate snapshot')
  const bytes = plainBytes(p)
  return { mode: (st.mode & 0o111n) ? '100755' : '100644', bytes, sha256: hash(bytes) }
}

function captureReview(env, cwd, options = {}, identityOnly = false) {
  let scratch
  try {
    if (!identityOnly && !OID.test(options.baseOid || '')) fail('baseOid must be a full original commit OID')
    if (options.headOid !== undefined && !OID.test(options.headOid)) fail('headOid must be a full original commit OID')
    if (!identityOnly && (!options.outputDir || typeof options.outputDir !== 'string')) fail('outputDir is required')
    const layout = findLayout(cwd)
    const vars = safeGitEnv(env.vars || process.env)
    const executable = gitExecutable(vars, layout)
    const initial = metadata(layout)
    for (const [key, expected] of [['gitdir-pointer', layout.gitdirPointer], ['commondir-pointer', layout.commondirPointer]]) {
      const current = initial.get(key) || null
      if (expected === null ? current !== null : current === null || !expected.equals(current)) fail('repository layout changed during discovery')
    }
    if (layoutBinding(layout) !== layout.binding) fail('repository layout changed during discovery')
    const metadataDigest = signature(initial)
    local(os.tmpdir())
    const temporaryRoot = canonicalPath(os.tmpdir())
    if ([layout.root, layout.own, layout.common].some(p => inside(canonicalPath(p), temporaryRoot))) fail('temporary directory must be outside the source repository')
    scratch = fs.mkdtempSync(path.join(temporaryRoot, 'devflow-review-'))
    const reader = path.join(scratch, 'reader')
    fs.mkdirSync(reader, { mode: 0o700 })
    fs.mkdirSync(path.join(reader, 'objects', 'info'), { recursive: true })
    fs.mkdirSync(path.join(reader, 'refs'))
    fs.writeFileSync(path.join(reader, 'HEAD'), 'ref: refs/heads/devflow-review\n')
    fs.writeFileSync(path.join(reader, 'config'), '[core]\nrepositoryformatversion = 0\nbare = false\n')
    const invoke = (args, { input } = {}) => {
      const prefix = [`--git-dir=${reader}`, `--work-tree=${layout.root}`]
      const r = env.run(executable, safeGitArgs([...prefix, ...args]), { cwd: scratch, input, env: vars, timeout: 30000 })
      if (r.code !== 0) fail(`Git ${args[0]} failed (${r.code})`)
      if (typeof r.stdout !== 'string' || r.stdout.includes('\ufffd')) fail('Git output is not losslessly readable UTF-8')
      return r.stdout
    }
    // --file plus --no-includes reads config as data. The fresh reader never loads any source include, attributes,
    // fsmonitor, hook, filter, pager, external diff, textconv or credential configuration.
    const configPath = path.join(scratch, 'source-config')
    fs.writeFileSync(configPath, initial.get('config') || Buffer.alloc(0), { mode: 0o600 })
    const config = invoke(['config', '--file', configPath, '--no-includes', '--null', '--list']).split('\0').filter(Boolean)
    const values = new Map(config.map(line => { const n = line.indexOf('\n'); return n === -1 ? [line.toLowerCase(), 'true'] : [line.slice(0, n).toLowerCase(), line.slice(n + 1)] }))
    const knownExtensions = new Set(['extensions.objectformat', 'extensions.refstorage', 'extensions.worktreeconfig'])
    if (![undefined, '0', '1'].includes(values.get('core.repositoryformatversion')) || [...values.keys()].some(key => key.startsWith('extensions.') && !knownExtensions.has(key))) fail('unsupported repository format extension')
    const format = values.get('extensions.objectformat') || 'sha1'
    if (!['sha1', 'sha256'].includes(format) || values.has('extensions.refstorage') && values.get('extensions.refstorage') !== 'files') fail('unsupported repository object/ref format')
    if (!identityOnly && options.baseOid.length !== (format === 'sha1' ? 40 : 64)) fail('baseOid uses the wrong object format')
    // Only scratch objects and indexes can be written. The source object directory is a read-only alternate.
    if (/[\r\n]/.test(layout.objects)) fail('unsupported object directory spelling')
    fs.writeFileSync(path.join(reader, 'objects', 'info', 'alternates'), layout.objects + '\n')
    fs.writeFileSync(path.join(reader, 'config'), `[core]\nrepositoryformatversion = ${format === 'sha256' ? 1 : 0}\nbare = false\n` + (format === 'sha256' ? '[extensions]\nobjectformat = sha256\n' : ''))
    for (const [name, bytes] of initial) if (bytes !== null && (['HEAD', 'index', 'packed-refs', 'shallow', 'info/exclude'].includes(name) || name.startsWith('refs/'))) {
      const dest = path.join(reader, name)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, bytes, { mode: 0o600 })
    }
    // rev-parse/ls-tree/diff trust an object's lookup OID without rehashing all returned bytes. A full fsck also
    // verifies loose and packed objects in the alternate; connectivity-only would miss forged blob contents.
    // Run in the isolated reader so source fsck overrides/includes cannot weaken the check. No lost-found writes.
    invoke(['fsck', '--full', '--strict', '--no-reflogs', '--no-progress', '--no-dangling'])
    const headOid = invoke(['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}']).trim()
    if (identityOnly) {
      if (!OID.test(headOid) || headOid.length !== (format === 'sha1' ? 40 : 64)) fail('invalid original HEAD identity')
      if (signature(metadata(layout)) !== metadataDigest || layoutBinding(layout) !== layout.binding) fail('repository inputs changed during identity capture')
      return { code: 0, out: 'ORIGINAL_HEAD_READY', headOid, objectFormat: format }
    }
    const baseOid = invoke(['rev-parse', '--verify', '--end-of-options', `${options.baseOid}^{commit}`]).trim()
    if (baseOid !== options.baseOid || !OID.test(headOid) || options.headOid && options.headOid !== headOid) fail('base/head identity changed')
    invoke(['merge-base', '--is-ancestor', baseOid, headOid])
    const headEntries = parseEntries(invoke(['ls-tree', '-rz', '--full-tree', headOid]))
    // An absent skip-worktree path is not an unstaged deletion. Do not give a partial checkout a false dirty scope.
    if (invoke(['ls-files', '--cached', '--sparse', '-t', '-z']).split('\0').some(record => record.startsWith('S '))) fail('sparse or skip-worktree indexes are not supported by the first review reader')
    const indexEntries = parseEntries(invoke(['ls-files', '--stage', '-z']), true)
    const untracked = invoke(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).map(literalPath)
    if (options.dirtyPaths !== undefined && !Array.isArray(options.dirtyPaths)) fail('dirtyPaths must contain literal paths')
    const names = [...new Set(options.dirtyPaths === undefined ? [...headEntries.keys(), ...indexEntries.keys(), ...untracked] : options.dirtyPaths.map(literalPath))].sort()
    if (names.length > MAX_ENTRIES) fail('snapshot entry limit exceeded')
    let total = 0
    const work = new Map(names.map(name => { const e = worktreeEntry(layout.root, name); total += e?.bytes.length || 0; if (total > MAX_BYTES) fail('snapshot byte limit exceeded'); return [name, e] }))
    const update = entries => {
      if (!entries.length) return
      const input = entries.map(([name, entry]) => `${entry?.mode || '0'} ${entry?.oid || '0'.repeat(headOid.length)}\t${name}\0`).join('')
      invoke(['update-index', '-z', '--index-info'], { input })
    }
    // Rebuild a private index to represent only the selected staged bytes, then the selected raw worktree bytes.
    // No checkout, clean/smudge conversion, status refresh or repository index write occurs.
    invoke(['read-tree', headOid])
    update(names.map(name => [name, indexEntries.get(name)]))
    const indexTreeOid = invoke(['write-tree']).trim()
    const rawEntries = names.map(name => {
      const entry = work.get(name)
      if (!entry) return [name, null]
      const oid = invoke(['hash-object', '--no-filters', '-w', '--stdin'], { input: entry.bytes }).trim()
      return [name, { mode: entry.mode, oid }]
    })
    update(rawEntries)
    const worktreeTreeOid = invoke(['write-tree']).trim()
    // A fixed empty attribute tree prevents worktree .gitattributes from changing patch rendering.
    // Unsupported Git versions fail on --attr-source instead of silently using mutable attributes.
    const emptyTreeOid = invoke(['hash-object', '-t', 'tree', '-w', '--stdin'], { input: Buffer.alloc(0) }).trim()
    const diff = (from, to) => invoke([`--attr-source=${emptyTreeOid}`, 'diff', '--binary', '--full-index', '--no-renames', '--no-color', '--no-indent-heuristic', '--diff-algorithm=myers', '--submodule=short', from, to, '--'])
    const parts = [
      { kind: 'committed', from: baseOid, to: headOid, text: diff(baseOid, headOid) },
      { kind: 'staged', from: headOid, to: indexTreeOid, text: diff(headOid, indexTreeOid) },
      { kind: 'worktree', from: indexTreeOid, to: worktreeTreeOid, text: diff(indexTreeOid, worktreeTreeOid) },
    ]
    // A second exact read detects ordinary concurrent edits. No writer exclusion is claimed; a cooperating writer
    // pause or OS snapshot is necessary when malicious same-user/ABA races are in scope.
    for (const name of names) {
      const before = work.get(name)
      const after = worktreeEntry(layout.root, name)
      if (!!before !== !!after || before && (before.mode !== after.mode || before.sha256 !== after.sha256)) fail('dirty inputs changed during capture')
    }
    // The scratch index now contains formerly untracked selected files, so enumerate again with the captured index.
    if (initial.get('index')) fs.writeFileSync(path.join(reader, 'index'), initial.get('index'))
    else fs.unlinkSync(path.join(reader, 'index'))
    const originalUntrackedAfter = invoke(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).map(literalPath)
    if (JSON.stringify(untracked.sort()) !== JSON.stringify(originalUntrackedAfter.sort()) || signature(metadata(layout)) !== metadataDigest || layoutBinding(layout) !== layout.binding) fail('repository inputs changed during capture')
    const packageText = parts.map(part => `# devflow review: ${part.kind}\n# ${part.from}..${part.to}\n${part.text}`).join('\n')
    const manifest = { version: 1, profile: 'original-objects-static-v1', baseOid, headOid, objectFormat: format,
      indexTreeOid, worktreeTreeOid, metadataDigest, dirtySelection: options.dirtyPaths === undefined ? 'all-repository-visible' : 'explicit',
      inputs: names.map(name => ({ path: name, index: indexEntries.get(name) || null,
        worktree: work.get(name) ? { mode: work.get(name).mode, bytes: work.get(name).bytes.length, sha256: work.get(name).sha256 } : null })),
      packageSha256: hash(Buffer.from(packageText)),
      limits: ['This is a read guard, not an OS sandbox.', 'Two matching reads detect observed changes, not malicious same-user or ABA races.',
        'System/global config and source config includes are not used. Raw working bytes receive no clean/smudge or text conversion; attributes are fixed to an empty tree.',
        'Original loose and packed objects pass a full strict fsck before capture; object storage is not atomically frozen.',
        'Submodule working directories, sparse/skip-worktree indexes, object alternates, reftable, unsupported encodings and unstable inputs are not verified.'] }
    const destination = path.resolve(options.outputDir)
    local(destination)
    const canonicalDestination = path.join(canonicalPath(path.dirname(destination)), path.basename(destination))
    if ([layout.own, layout.common].some(p => inside(canonicalPath(p), canonicalDestination))) fail('outputDir cannot be inside Git metadata')
    if (fs.existsSync(destination)) fail('outputDir already exists; retain the previous package')
    const staged = path.join(scratch, 'package')
    fs.mkdirSync(staged, { mode: 0o700 })
    fs.writeFileSync(path.join(staged, 'review-package.diff'), packageText, { mode: 0o600 })
    fs.writeFileSync(path.join(staged, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
    // mkdir is exclusive; a failed copy leaves an explicit incomplete output rather than overwriting prior evidence.
    fs.mkdirSync(destination, { mode: 0o700 })
    try {
      for (const file of ['review-package.diff', 'manifest.json']) fs.copyFileSync(path.join(staged, file), path.join(destination, file), fs.constants.COPYFILE_EXCL)
    } catch (e) { fail(`package write incomplete (${e.code || 'write failed'})`) }
    return { code: 0, out: 'REVIEW_PACKAGE_READY', manifest, diffPath: path.join(destination, 'review-package.diff'), manifestPath: path.join(destination, 'manifest.json') }
  } catch (e) {
    return { code: 1, out: `NOT_VERIFIED ${identityOnly ? 'original-head' : 'review-package'}: ${e.code || e.message || 'capture failed'}` }
  } finally {
    if (scratch) { try { fs.rmSync(scratch, { recursive: true, force: true }) } catch {} }
  }
}

function createReviewPackage(env, cwd, options = {}) { return captureReview(env, cwd, options) }
function readOriginalHead(env, cwd) { return captureReview(env, cwd, {}, true) }

function remoteDeletionDecision({ reviewedOid, currentOid } = {}) {
  if (!OID.test(reviewedOid || '')) return { status: 'HELD', reason: 'missing_reviewed_oid' }
  if (currentOid !== undefined && currentOid !== reviewedOid) return { status: 'HELD', reason: 'remote_tip_changed' }
  return { status: 'HELD', reason: 'atomic_remote_delete_unavailable' }
}

module.exports = { safeGitEnv, safeGitArgs, createReviewPackage, readOriginalHead, remoteDeletionDecision }
