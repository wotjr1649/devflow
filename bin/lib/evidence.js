'use strict'

// Narrow evidence primitives. Callers retain approval, ownership, and lifecycle policy.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const normalize = value => value.replace(/\s+/g, ' ').trim()
const refusal = (guard, error) => ({ error, guard })
const error = (code, message) => Object.assign(new Error(message), { code })
const oidPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const fullOid = value => typeof value === 'string' && oidPattern.test(value) && !/^0+$/.test(value)

function criteriaSnapshot({ body, parsed, intentEnd = body?.length }) {
  if (typeof body !== 'string' || !Number.isInteger(intentEnd) || intentEnd < 0 || intentEnd > body.length) {
    return refusal('criteria-input', 'a complete Issue body and an exact intent boundary are required')
  }
  if (!parsed || !parsed.plain || !Array.isArray(parsed.boxes) || !parsed.boxes.length) {
    return refusal('criteria-unplain', 'a nonempty plain acceptance-criteria section is required')
  }
  let canonical = body.slice(0, intentEnd)
  let last = -1
  for (const [index, box] of parsed.boxes.entries()) {
    if (!Number.isInteger(box.at) || box.at <= last || box.at + 1 >= intentEnd ||
        body.slice(box.at - 3, box.at) !== '- [' || !' xX'.includes(body[box.at]) ||
        body[box.at + 1] !== ']' || typeof box.text !== 'string' ||
        box.checked !== (body[box.at] !== ' ')) {
      return refusal('criteria-input', 'criteria positions must come from the parser for this exact intent body')
    }
    if (box.raw !== undefined || box.end !== undefined) {
      const nextStart = parsed.boxes[index + 1]?.at - 3
      if (typeof box.raw !== 'string' || !Number.isInteger(box.end) || box.end <= box.at + 2 ||
          box.end > intentEnd || (Number.isFinite(nextStart) && box.end !== nextStart) ||
          box.raw !== body.slice(box.at + 2, box.end) || normalize(box.raw) !== normalize(box.text)) {
        return refusal('criteria-input', 'raw criterion text and end position must match this exact parser span')
      }
    }
    canonical = canonical.slice(0, box.at) + ' ' + canonical.slice(box.at + 1)
    last = box.at
  }
  const intentRevision = hash(canonical)
  const ids = new Set()
  const legacyTexts = new Set()
  const allTexts = new Map()
  const criteria = parsed.boxes.map((box, i) => {
    const text = normalize(box.text)
    const explicit = /^(?:\[(AC-[A-Za-z0-9][A-Za-z0-9._-]{0,63})\]|(AC-[A-Za-z0-9][A-Za-z0-9._-]{0,63}):)\s+(.+)$/.exec(text)
    const definition = explicit ? explicit[3] : text
    const id = explicit ? explicit[1] || explicit[2] : `legacy:${hash(`${intentRevision}\0${text}`)}`
    // Keep horizontal spaces and internal line breaks, including those inside literals. Only the list separator
    // and trailing blank separator lines are outside the definition. Old parsers without raw spans bind the
    // whole intent, so their normalization cannot accidentally preserve a changed definition.
    const raw = typeof box.raw === 'string' ? box.raw.replace(/^ /, '').replace(/(?:\n[ \t]*)+$/, '') : null
    const definitionRevision = hash(raw === null ? `intent\0${intentRevision}\0${definition}` : `raw\0${raw}`)
    // Approved legacy intent edits retain ordinary prose line-wrap compatibility, not arbitrary whitespace
    // equivalence inside quoted/code text. This key carries a checkbox; it never validates an old receipt.
    const carryText = raw !== null && /^[\p{L}\p{N} \t\n.,!?;:()\-]+$/u.test(raw) && !/\n[ \t]*\n/.test(raw)
      ? raw.replace(/\n[ \t]*/g, ' ') : raw
    const carryRevision = raw === null ? definitionRevision : hash(`carry\0${carryText}`)
    return { id, definitionRevision, definitionSource: raw === null ? 'intent' : 'raw', carryRevision,
      text, definition, ordinal: i + 1, at: box.at, checked: box.checked, legacy: !explicit }
  })
  for (const criterion of criteria) {
    if (!criterion.definition) return refusal('criteria-empty', 'criterion definitions must not be empty')
    if (ids.has(criterion.id)) return refusal('criteria-ambiguous', `duplicate acceptance criterion ${criterion.id}`)
    if (criterion.legacy && legacyTexts.has(criterion.text)) return refusal('criteria-ambiguous', 'duplicate legacy criterion text requires explicit unique AC IDs')
    ids.add(criterion.id)
    if (criterion.legacy) legacyTexts.add(criterion.text)
    allTexts.set(criterion.text, (allTexts.get(criterion.text) || 0) + 1)
  }
  if ([...legacyTexts].some(text => allTexts.get(text) !== 1)) return refusal('criteria-ambiguous', 'legacy criterion text must be unique in the current body')
  return { version: 1, intentRevision, bodyRevision: hash(body), criteria }
}

function criteriaSelection({ snapshot, selectors, expectedIntentRevision }) {
  if (snapshot?.error) return snapshot
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.criteria)) return refusal('criteria-input', 'a current criteria snapshot is required')
  if (!expectedIntentRevision || expectedIntentRevision !== snapshot.intentRevision) {
    return refusal('criteria-stale', 'the intent revision changed or was not supplied; read and select the criteria again')
  }
  if (!Array.isArray(selectors) || !selectors.length) return refusal('criteria-selector', 'at least one criterion selector is required')
  const selected = []
  const seen = new Set()
  for (const selector of selectors) {
    let criterion
    if (Number.isSafeInteger(selector) && selector > 0) criterion = snapshot.criteria.find(item => item.ordinal === selector)
    else if (typeof selector === 'string') criterion = snapshot.criteria.find(item => item.id === selector)
    else if (selector && typeof selector === 'object' && typeof selector.id === 'string' && typeof selector.definitionRevision === 'string') {
      criterion = snapshot.criteria.find(item => item.id === selector.id && item.definitionRevision === selector.definitionRevision)
    }
    if (!criterion) return refusal('criteria-selector', 'a criterion ID, definition revision, or ordinal no longer matches this intent')
    if (seen.has(criterion.id)) return refusal('criteria-selector', 'each criterion may be selected only once')
    seen.add(criterion.id)
    selected.push(criterion)
  }
  return { criteria: selected, intentRevision: snapshot.intentRevision, bodyRevision: snapshot.bodyRevision }
}

function criteriaGate({ snapshot, expectedIntentRevision, criteriaRefs, requireChecked = true, requireAll = true }) {
  if (!Array.isArray(criteriaRefs) || !criteriaRefs.length || criteriaRefs.some(ref =>
    !ref || typeof ref !== 'object' || typeof ref.id !== 'string' || typeof ref.definitionRevision !== 'string')) {
    return refusal('criteria-evidence', 'evidence must identify each criterion by ID and definition revision')
  }
  const selected = criteriaSelection({ snapshot, selectors: criteriaRefs, expectedIntentRevision })
  if (selected.error) return selected
  if (requireAll && selected.criteria.length !== snapshot.criteria.length) return refusal('criteria-incomplete', 'evidence must cover every current acceptance criterion')
  if (requireChecked && selected.criteria.some(item => !item.checked)) return refusal('criteria-unchecked', 'every selected acceptance criterion must be checked')
  return { ok: true, ...selected }
}

function carryCriteriaChecks({ previous, next, trusted }) {
  if (previous?.error) return previous
  if (next?.error) return next
  if (!Array.isArray(previous?.criteria) || !Array.isArray(next?.criteria)) return refusal('criteria-input', 'old and new criteria snapshots are required')
  const carried = []
  const dropped = []
  for (const from of previous.criteria.filter(item => item.checked)) {
    const matches = trusted ? next.criteria.filter(to => {
      if (!from.legacy && !to.legacy) return from.id === to.id && from.definitionRevision === to.definitionRevision
      // Legacy reuse is deliberate rebinding during an approved intent edit, never reuse of an old receipt.
      return from.text === to.text && typeof from.carryRevision === 'string' && from.carryRevision === to.carryRevision
    }) : []
    if (matches.length === 1) carried.push({ from, to: matches[0] })
    else dropped.push(from.ordinal)
  }
  return { carried, dropped }
}

function requireOid(value, name) {
  if (!fullOid(value)) throw error('evidence-oid', `${name} must be one nonzero full lowercase object ID`)
}
function regularFile(file, limit = 16 * 1024 * 1024) {
  const stat = fs.lstatSync(file)
  if (!stat.isFile()) throw error('evidence-path', 'a regular local file is required')
  if (stat.size > limit) throw error('evidence-limit', 'a source file exceeds the configured byte limit')
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0))
  try {
    const current = fs.fstatSync(fd)
    if (!current.isFile() || current.size > limit || current.dev !== stat.dev || current.ino !== stat.ino) throw error('evidence-race', 'source changed while opening it')
    return fs.readFileSync(fd)
  } finally { fs.closeSync(fd) }
}
function localDirectory(directory) {
  const resolved = path.resolve(directory)
  if (/^(?:\\\\|\/\/)/.test(directory) || !fs.lstatSync(resolved).isDirectory() || fs.realpathSync(resolved) !== resolved) {
    throw error('evidence-path', 'an existing local directory without symlinks is required')
  }
  return resolved
}
function gitLayout(cwd) {
  const root = localDirectory(cwd)
  const dot = path.join(root, '.git')
  const stat = fs.lstatSync(dot)
  let gitdir
  if (stat.isDirectory()) gitdir = localDirectory(dot)
  else {
    const pointer = /^gitdir: ([^\r\n\0]+)\n?$/.exec(regularFile(dot, 4096).toString('utf8'))
    if (!pointer) throw error('evidence-layout', 'a Git worktree pointer or Git directory is required')
    gitdir = localDirectory(path.resolve(root, pointer[1]))
  }
  let common = gitdir
  try {
    const pointer = regularFile(path.join(gitdir, 'commondir'), 4096).toString('utf8').trim()
    if (!pointer || /[\r\n\0]/.test(pointer)) throw error('evidence-layout', 'invalid common Git directory')
    common = localDirectory(path.resolve(gitdir, pointer))
  } catch (failure) { if (failure.code !== 'ENOENT') throw failure }
  const objects = localDirectory(path.join(common, 'objects'))
  for (const name of ['alternates', 'http-alternates']) {
    try { if (regularFile(path.join(objects, 'info', name), 65536).toString('utf8').trim()) throw error('evidence-alternates', 'alternate object stores require a separate owned snapshot') }
    catch (failure) { if (failure.code !== 'ENOENT') throw failure }
  }
  return { root, gitdir, common, objects }
}
function gitBinary(gitPath) {
  if (gitPath) {
    if (!path.isAbsolute(gitPath) || !fs.statSync(gitPath).isFile()) throw error('evidence-git', 'gitPath must be an absolute trusted executable path')
    return gitPath
  }
  const executable = process.platform === 'win32' ? 'git.exe' : 'git'
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue
    const candidate = path.join(directory, executable)
    try { fs.accessSync(candidate, fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return candidate } catch {}
  }
  throw error('evidence-git', 'no Git executable was found on an absolute PATH entry')
}
function readEnvironment(emptyFile) {
  const env = {}
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key]
  Object.assign(env, { LC_ALL: 'C', LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: emptyFile,
    GIT_CONFIG_GLOBAL: emptyFile, GIT_ATTR_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1',
    GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat', PAGER: 'cat', GIT_PROTOCOL_FROM_USER: '0' })
  return env
}
function isolatedReader(layout, width, gitPath, limits) {
  const git = gitBinary(gitPath)
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-read-'))
  const emptyFile = path.join(temporary, 'empty')
  try {
    fs.chmodSync(temporary, 0o700)
    for (const name of ['objects', 'refs', 'hooks']) fs.mkdirSync(path.join(temporary, name))
    fs.writeFileSync(path.join(temporary, 'HEAD'), 'ref: refs/heads/unused\n')
    fs.writeFileSync(path.join(temporary, 'config'), `[core]\n\tbare = true\n\trepositoryformatversion = ${width === 64 ? 1 : 0}\n${width === 64 ? '[extensions]\n\tobjectFormat = sha256\n' : ''}`)
    // Git for Windows cannot read Node's null-device path as a config file.
    fs.writeFileSync(emptyFile, '', { flag: 'wx', mode: 0o600 })
  } catch (failure) {
    fs.rmSync(temporary, { recursive: true, force: true })
    throw failure
  }
  const env = { ...readEnvironment(emptyFile), GIT_DIR: temporary, GIT_OBJECT_DIRECTORY: layout.objects }
  const prefix = ['--no-pager', '--no-replace-objects', '--no-lazy-fetch', '-c', 'core.fsmonitor=false',
    '-c', 'core.commitGraph=false',
    '-c', 'core.untrackedCache=false', '-c', `core.hooksPath=${path.join(temporary, 'hooks')}`,
    '-c', `core.attributesFile=${emptyFile}`, '-c', 'diff.external=', '-c', 'protocol.allow=never', '-c', 'submodule.recurse=false']
  return {
    run(args, overrides = {}) {
      const result = spawnSync(git, [...prefix, ...args], { cwd: layout.root, env: { ...env, ...overrides }, shell: false,
        encoding: null, timeout: 30000, maxBuffer: limits.maxBytes + 65536, windowsHide: true })
      if (result.error || result.status !== 0) throw error('evidence-git-read', `Git read failed (${args[0]}): ${result.error?.message || result.stderr?.toString('utf8').trim() || result.status}`)
      return result.stdout
    },
    close() { fs.rmSync(temporary, { recursive: true, force: true }) },
  }
}
function headOid(layout) {
  const head = regularFile(path.join(layout.gitdir, 'HEAD'), 4096).toString('utf8').trim()
  if (fullOid(head)) return head
  const symbolic = /^ref: (refs\/heads\/[^\r\n\0]+)$/.exec(head)
  if (!symbolic || !validHeadRef(symbolic[1])) throw error('evidence-head', 'HEAD must be a local heads ref or a full detached object ID')
  try {
    const value = regularFile(path.join(layout.common, symbolic[1]), 4096).toString('utf8').trim()
    if (!fullOid(value)) throw error('evidence-head', 'HEAD ref does not contain a full object ID')
    return value
  } catch (failure) { if (failure.code !== 'ENOENT') throw failure }
  let packed
  try { packed = regularFile(path.join(layout.common, 'packed-refs')).toString('utf8') }
  catch (failure) { if (failure.code !== 'ENOENT') throw failure; throw error('evidence-head', 'the HEAD ref is not available in the owned snapshot') }
  const matches = packed.split('\n').filter(line => line.endsWith(` ${symbolic[1]}`)).map(line => line.split(' ')[0])
  if (matches.length !== 1 || !fullOid(matches[0])) throw error('evidence-head', 'the HEAD ref is not uniquely available in packed refs')
  return matches[0]
}
function parseTree(bytes) {
  if (!Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)) throw error('evidence-tree', 'tree paths must be UTF-8')
  const entries = []
  for (const row of bytes.toString('utf8').split('\0').filter(Boolean)) {
    const match = /^(040000|100644|100755|120000|160000) (tree|blob|commit) ([0-9a-f]+)\t([^\0]+)$/.exec(row)
    if (!match || !fullOid(match[3])) {
      throw error('evidence-tree', 'tree entries must have supported modes and UTF-8 names')
    }
    const name = match[4]
    if (name.split('/').some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git') || path.isAbsolute(name) || name.includes('\\')) throw error('evidence-tree', 'unsupported tree path')
    if (match[1] === '160000') throw error('evidence-submodule', 'submodules require separate owned review snapshots')
    entries.push({ mode: match[1], oid: match[3], path: name })
  }
  return entries
}
function objectOid(type, bytes, width) {
  return crypto.createHash(width === 64 ? 'sha256' : 'sha1').update(`${type} ${bytes.length}\0`).update(bytes).digest('hex')
}
const blobOid = (bytes, width) => objectOid('blob', bytes, width)
function cleanSnapshot(layout, head, tree, reader, limits) {
  if (headOid(layout) !== head) throw error('evidence-head', 'the owned worktree HEAD differs from the requested head')
  const index = path.join(layout.gitdir, 'index')
  const indexBytes = regularFile(index, limits.maxBytes)
  const listedIndex = reader.run(['ls-files', '--stage', '-z'], { GIT_INDEX_FILE: index, GIT_WORK_TREE: layout.root })
  if (!Buffer.from(listedIndex.toString('utf8'), 'utf8').equals(listedIndex)) {
    throw error('evidence-dirty-index', 'index paths must be lossless UTF-8')
  }
  const actualIndex = listedIndex.toString('utf8').split('\0').filter(Boolean).map(row => {
      const match = /^(100644|100755|120000) ([0-9a-f]+) 0\t([^\0]+)$/.exec(row)
      if (!match) throw error('evidence-dirty-index', 'the index must contain only resolved ordinary entries')
      return { mode: match[1], oid: match[2], path: match[3] }
    })
  if (JSON.stringify(actualIndex) !== JSON.stringify(tree)) throw error('evidence-dirty-index', 'the index differs from the requested head')
  const expected = new Map(tree.map(entry => [entry.path, entry]))
  const directories = new Set()
  for (const entry of tree) {
    const components = entry.path.split('/')
    for (let i = 1; i < components.length; i++) directories.add(components.slice(0, i).join('/'))
  }
  let count = 0
  function walk(directory, prefix) {
    for (const name of fs.readdirSync(directory)) {
      if (!prefix && name === '.git') continue
      const relative = prefix ? `${prefix}/${name}` : name
      const absolute = path.join(directory, name)
      const stat = fs.lstatSync(absolute)
      if (++count > limits.maxEntries * 2) throw error('evidence-limit', 'the source snapshot exceeds the entry limit')
      if (stat.isDirectory()) {
        if (!directories.has(relative)) throw error('evidence-untracked', 'untracked or ignored directories require a separate owned clean snapshot')
        walk(absolute, relative)
        continue
      }
      const entry = expected.get(relative)
      if (!entry) throw error('evidence-untracked', 'untracked or ignored files require a separate owned clean snapshot')
      let bytes
      if (entry.mode === '120000' && stat.isSymbolicLink()) bytes = fs.readlinkSync(absolute, { encoding: 'buffer' })
      else if (entry.mode !== '120000' && stat.isFile()) {
        bytes = regularFile(absolute, limits.maxBytes)
        if (process.platform !== 'win32' && Boolean(stat.mode & 0o111) !== (entry.mode === '100755')) throw error('evidence-dirty', 'a worktree executable mode differs from the requested head')
      } else throw error('evidence-dirty', 'a worktree file type differs from the requested head')
      if (blobOid(bytes, head.length) !== entry.oid) throw error('evidence-dirty', 'raw worktree bytes differ from the requested head; filters and line-ending conversions are not executed')
      expected.delete(relative)
    }
  }
  walk(layout.root, '')
  if (expected.size) throw error('evidence-dirty', 'a tracked file is missing from the owned worktree')
  if (headOid(layout) !== head || !regularFile(index, limits.maxBytes).equals(indexBytes)) throw error('evidence-race', 'HEAD or index changed during the clean snapshot check')
}

function reviewPackage({ cwd, base, head, ownedCleanSnapshot, gitPath, maxBytes = 16 * 1024 * 1024, maxEntries = 10000 }) {
  requireOid(base, 'base'); requireOid(head, 'head')
  if (base.length !== head.length) throw error('evidence-oid', 'base and head must use the same object format')
  if (ownedCleanSnapshot !== true) throw error('evidence-ownership', 'the caller must provide an exclusively owned clean snapshot')
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 128 * 1024 * 1024 || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 100000) throw error('evidence-limit', 'invalid review package bounds')
  const limits = { maxBytes, maxEntries }
  const layout = gitLayout(cwd)
  const reader = isolatedReader(layout, head.length, gitPath, limits)
  try {
    const commits = {}
    const trees = {}
    const verifiedTrees = new Map()
    for (const oid of new Set([base, head])) {
      if (reader.run(['cat-file', '-t', oid]).toString('utf8').trim() !== 'commit') throw error('evidence-commit', 'base and head must name commit objects directly')
      const bytes = reader.run(['cat-file', 'commit', oid])
      if (objectOid('commit', bytes, oid.length) !== oid) throw error('evidence-object', 'commit bytes do not match the requested object ID')
      const tree = /^tree ([0-9a-f]+)\n/.exec(bytes.toString('utf8'))?.[1]
      requireOid(tree, 'tree')
      commits[oid] = bytes.toString('base64')
      const entries = parseTree(reader.run(['ls-tree', '-r', '-t', '-z', '--full-tree', tree]))
      if (entries.length > maxEntries) throw error('evidence-limit', 'the source tree exceeds the entry limit')
      // Git object reads do not guarantee a content-hash check. Verify root and nested trees too: a locally
      // replaced loose object must not erase a change while retaining its advertised commit/tree identifier.
      for (const treeOid of [tree, ...entries.filter(entry => entry.mode === '040000').map(entry => entry.oid)]) {
        if (verifiedTrees.has(treeOid)) continue
        const raw = reader.run(['cat-file', 'tree', treeOid])
        if (objectOid('tree', raw, oid.length) !== treeOid) throw error('evidence-object', 'tree bytes do not match their exact object ID')
        verifiedTrees.set(treeOid, raw.length)
      }
      trees[oid] = entries.filter(entry => entry.mode !== '040000')
    }
    cleanSnapshot(layout, head, trees[head], reader, limits)
    const blobs = {}
    let total = Object.values(commits).reduce((sum, value) => sum + Buffer.byteLength(value, 'base64'), 0) +
      [...verifiedTrees.values()].reduce((sum, bytes) => sum + bytes, 0)
    if (total > maxBytes) throw error('evidence-limit', 'commit and tree bytes exceed the package limit')
    for (const entry of [...trees[base], ...trees[head]]) {
      if (Object.hasOwn(blobs, entry.oid)) continue
      const size = Number(reader.run(['cat-file', '-s', entry.oid]).toString('utf8').trim())
      if (!Number.isSafeInteger(size) || size < 0 || total + size > maxBytes) throw error('evidence-limit', 'source bytes exceed the package limit; no partial package was produced')
      const bytes = reader.run(['cat-file', 'blob', entry.oid])
      if (bytes.length !== size || blobOid(bytes, head.length) !== entry.oid) throw error('evidence-object', 'a source blob does not match its exact object ID')
      blobs[entry.oid] = bytes.toString('base64')
      total += size
    }
    const diff = reader.run(['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--ignore-submodules=none', '--submodule=short', '--binary', '--full-index', '--src-prefix=a/', '--dst-prefix=b/', '--unified=3', base, head, '--'])
    if (total + diff.length > maxBytes) throw error('evidence-limit', 'the complete package exceeds its byte limit')
    cleanSnapshot(layout, head, trees[head], reader, limits)
    return { version: 1, base, head, scope: 'owned-clean-worktree', dirtyCoverage: false,
      limitations: ['Exclusive ownership is a caller precondition; these checks are not an OS sandbox.', 'Raw tracked bytes and index must match head; untracked and ignored inputs are refused.', 'Submodules, alternate object stores, and non-UTF-8 paths require separate snapshots.'],
      commits, trees, blobs, diff: diff.toString('utf8'), sourceBytes: total }
  } finally { reader.close() }
}

function validHeadRef(ref) {
  return typeof ref === 'string' && ref.startsWith('refs/heads/') && ref.length > 11 &&
    !/[\x00-\x20\x7f~^:?*\[\\]/.test(ref) && !ref.includes('..') && !ref.includes('@{') &&
    ref.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock') && !part.endsWith('.'))
}
function deleteRunner({ cwd, gitPath }) {
  const git = gitBinary(gitPath)
  const root = localDirectory(cwd)
  // Keep the host's authentication and pre-push hook. Environment-injected Git config and repository selectors are not accepted.
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key]
  Object.assign(env, { GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', PAGER: 'cat' })
  return args => {
    const result = spawnSync(git, ['--no-pager', '--no-replace-objects', '--no-lazy-fetch', ...args], { cwd: root, env, shell: false, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true })
    if (result.error) throw error('delete-git', result.error.message)
    return { code: result.status, stdout: result.stdout, stderr: result.stderr }
  }
}
function deleteDestination(run, remote) {
  if (typeof remote !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remote)) throw error('delete-remote', 'one explicit named remote is required')
  const resolved = run(['remote', 'get-url', '--push', '--all', remote])
  if (resolved.code !== 0) throw error('delete-remote', 'the named remote has no resolvable push destination')
  const destinations = resolved.stdout.replace(/\r?\n$/, '').split(/\r?\n/)
  if (destinations.length !== 1 || !destinations[0]) throw error('delete-remote', 'the named remote must resolve to exactly one push destination')
  const destination = destinations[0]
  // Only ordinary local, HTTPS, or SSH destinations are supported. No ext:: or arbitrary remote helpers.
  const local = path.isAbsolute(destination) && !/^(?:\\\\|\/\/)/.test(destination)
  const https = /^https:\/\/[^\s/@:]+(?::[0-9]+)?\/[^\s]+$/.test(destination)
  const ssh = /^ssh:\/\/(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9][A-Za-z0-9.-]*(?::[0-9]+)?\/[^\s]+$/.test(destination) || /^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9][A-Za-z0-9.-]*:[^:\s][^\s]*$/.test(destination)
  if (!destination || /[\r\n\0]/.test(destination) || (!local && !https && !ssh)) throw error('delete-destination', 'the resolved destination must be one explicit local, HTTPS, or SSH repository')
  if (local) localDirectory(destination)
  // A literal destination can otherwise be rewritten a second time; refuse rewriting configuration rather than guessing its effect.
  const rewrites = run(['config', '--get-regexp', '^url\\..*\\.(insteadof|pushinsteadof)$'])
  if (rewrites.code !== 1 || rewrites.stdout) throw error('delete-rewrite', 'URL rewriting must be absent for an exact destination deletion')
  // A URL is also accepted as a configured remote name by Git. Reject that second interpretation, including
  // group names and legacy remotes, so its push URLs, mirror settings, or transport overrides cannot be used.
  const key = destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const configured = run(['config', '--name-only', '--get-regexp', `^(remote\\.${key}\\.|remotes\\.${key}$)`])
  if (configured.code !== 1 || configured.stdout) throw error('delete-alias', 'the resolved destination must not also name configured remote settings or a remote group')
  const legacy = run(['remote', 'get-url', '--push', '--all', '--', destination])
  if (legacy.code !== 2 || legacy.stdout) throw error('delete-alias', 'the resolved destination must not also name a configured or legacy remote')
  return { remote, destination, protocol: local ? 'file' : https ? 'https' : 'ssh' }
}
function resolveDeleteDestination({ cwd, remote, gitPath }) {
  const { destination } = deleteDestination(deleteRunner({ cwd, gitPath }), remote)
  return { remote, destination }
}
// The caller must exclude concurrent repository/remote and effective Git configuration changes through this call.
// The destination comparison is an observation, not an atomic fence across native Git processes.
function conditionalDelete({ cwd, remote, ref, expectedOid, expectedDestination, gitPath }) {
  requireOid(expectedOid, 'expectedOid')
  if (!validHeadRef(ref)) throw error('delete-ref', 'only one fully qualified refs/heads ref may be deleted')
  if (typeof expectedDestination !== 'string' || !expectedDestination || /[\r\n\0]/.test(expectedDestination)) {
    throw error('delete-expected-destination', 'the exact destination observed when preparing this deletion is required')
  }
  const run = deleteRunner({ cwd, gitPath })
  const { destination, protocol } = deleteDestination(run, remote)
  if (destination !== expectedDestination) throw error('delete-destination-stale', 'the push destination changed after this deletion was prepared')
  const lease = `--force-with-lease=${ref}:${expectedOid}`
  const result = run(['-c', 'push.followTags=false', '-c', 'remote.pushDefault=', '-c', 'push.recurseSubmodules=no',
    '-c', 'protocol.allow=never', '-c', `protocol.${protocol}.allow=always`,
    'push', '--porcelain', lease, '--', destination, `:${ref}`])
  return { ...result, remote, destination, expectedDestination, ref, expectedOid, deleted: result.code === 0 }
}

module.exports = { criteriaSnapshot, criteriaSelection, criteriaGate, carryCriteriaChecks, reviewPackage, resolveDeleteDestination, conditionalDelete }
