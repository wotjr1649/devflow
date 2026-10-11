'use strict'
// Native sandbox preflight only: never create a thread, turn or model request.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const cp = require('node:child_process')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const digest = text => crypto.createHash('sha256').update(text).digest('hex')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const caseIds = ['source', 'plan', 'spec', 'policy', 'plugin', 'outside', 'symlink', 'parent-path', 'readonly-write', 'outside-write']

const reviewHashes = {
  ".devflow.json": "34b8326d4772a82ac4e357d1554269ae5a3ec70ed1bdd7d9b27fa117cd08f126",
  ".work/plan.md": "3b5d63c1dbcb292a5a5ce78786a86eab4901c8c911b6bb9eeb7c4c007987c6b4",
  ".work/spec.md": "234f1461e94a23b4ed079b361e53da81a6abccf8ef299d7c82bd385b64744ae8",
  "candidate.diff": "a1da28dcb93f5778cc4c7a69b9e10967cf141521e3042b52cb1a4918d32eb671",
  "POLICY.md": "f405e28bbab5b39fc2513399828dc75f9e400a45c162684ef95e874a929355d7",
  "records/before-page-size.cjs": "1f761e0ef59eeadac247a054229e6a9bf393d150732dcfbb855c4a5be0145ad3",
  "records/checks.json": "aef55d402e82a9e02f3878ddfaf35a7a2523a30a8115e4f32d95bac415db0610",
  "records/context.json": "0d12318b4c72cf8eff0cb3bba36d5bd1d5d29e532967ba86bcd4f7aadb111ace",
  "records/issue.json": "ca4ee7be3614814fb63635b785f2a9afcc23880d0c523a83584fd21216b322a8",
  "src/list-page.cjs": "dd35275ee92d24442e53d1829d5669c863310dd9efe854b18335cb0d1cdda040",
  "src/page-size.cjs": "c69b57651007c2fee34fa7b2869b02c51583c391bdebe626f1d0e5ffaa1a0b38",
  "tests/page-size.test.cjs": "ccb2c229913ee897c868ea282545d5307adb9cbd00cea5cb93387c470a49ff65"
}
const pluginHashes = {
  "5a393beb9a804aba9ee917a4a0b0d52ab8e24dac": {
    "skills/pr-review-workflow/SKILL.md": "203194e58fa26ed155455c7ff4f44b0c77640d988bc9cdc3e33bea9bf98e1ebf",
    "skills/devflow/references/review.md": "a748aa36cdca4039685ad8d2bdafe0f42dc2e05869d4bf4bbb8f03e95f0a753b",
    "skills/pr-review-workflow/references/review.md": "075865be0cc0bae30f2adf0824e4e0c1f3778b62dad0ff41c11477a947c9710e"
  },
  "de387ab4e1c837586a5bbc537f0cc1bc0bb982ec": {
    "skills/pr-review-workflow/SKILL.md": "f128b35333859565f3abcec34964fad3bfd27bf37afb19d4be458facd8f6691a",
    "skills/devflow/references/review.md": "b34262334b7fe5a83f6b72640e377b67e7cfbc2fddc5ee2c3e591622fa029556",
    "skills/pr-review-workflow/references/review.md": "5c8c2c6ef518ab7c398d20fd5acad1baff6402423bb3f7aced8e450e09a0fe43"
  }
}
const representativeCaseIds = [...Object.keys(reviewHashes).map(p => 'review:' + p), ...Object.keys(Object.values(pluginHashes)[0]).map(p => 'plugin:' + p), ...caseIds.slice(5), 'grading', 'home']

function reviewFiles(packet) {
  assert.equal(packet.schema, 1)
  assert.ok(Array.isArray(packet.files) && packet.files.length === Object.keys(reviewHashes).length)
  const seen = new Set()
  for (const file of packet.files) {
    assert.ok(Object.hasOwn(reviewHashes, file.path) && !seen.has(file.path), 'UNEXPECTED_REVIEW_PATH')
    seen.add(file.path)
    assert.ok(typeof file.content === 'string' && Buffer.byteLength(file.content) <= 65536)
    assert.equal(digest(file.content), reviewHashes[file.path], 'REVIEW_CONTENT_MISMATCH')
    assert.equal(file.sha256, reviewHashes[file.path], 'REVIEW_DIGEST_MISMATCH')
  }
  return Object.keys(reviewHashes).map(p => packet.files.find(file => file.path === p))
}

function denial(result, target, tool) {
  return result.exitCode === 1 && result.stdout === '' &&
    typeof result.stderr === 'string' && result.stderr.startsWith('/usr/bin/' + tool + ':') &&
    result.stderr.includes(target) && /Permission denied|Operation not permitted|Read-only file system|No such file or directory/.test(result.stderr)
}
function readReceipt(id, result, expected, allowed, target) {
  return { id, exit: result.exitCode, contentSha256: digest(result.stdout || ''),
    pass: allowed ? result.exitCode === 0 && result.stdout === expected && result.stderr === '' : denial(result, target, 'cat'),
    category: allowed ? 'EXPECTED_CONTENT' : 'DENIED_OR_HIDDEN_PUBLIC_PATH' }
}
function writeReceipt(id, result, exists, target) {
  return { id, exit: result.exitCode, fileExists: exists, pass: !exists && denial(result, target, 'touch'), category: 'READONLY_WRITE_DENIAL' }
}
function passed(rows, serverClosed, groupClosed, failure, expectedIds = caseIds) {
  return !failure && serverClosed && groupClosed && rows.length === expectedIds.length &&
    rows.every((row, index) => row.id === expectedIds[index] && row.pass)
}
function startupError(stderr, replacements) {
  const line = stderr.split(/\r?\n/).find(line => /^(?:Error|error):/.test(line))
  if (!line) return null
  let message = line.replace(/[\u0000-\u001f\u007f]/g, '')
  for (const [value, label] of replacements) message = message.split(value).join(label)
  return message.slice(0, 500)
}

async function run(executable, fixtureFile, pluginSourceRoot, sourceRef) {
  assert.equal(process.platform, 'linux', 'LINUX_ONLY')
  assert.ok(path.isAbsolute(executable) && fs.lstatSync(executable).isFile())
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-native-')))
  const project = path.join(base, 'project')
  let plugin = path.join(base, 'plugin')
  const home = path.join(base, 'home'), outside = path.join(base, 'outside')
  for (const dir of [project, plugin, home, outside, path.join(base, 'tmp')]) fs.mkdirSync(dir)
  fs.mkdirSync(path.join(home, 'codex'))
  fs.mkdirSync(path.join(project, '.work'))
  let normal = [
    ['source', path.join(project, 'source.cjs'), 'module.exports = 100\n'],
    ['plan', path.join(project, '.work/plan.md'), '# Public test plan\nKeep numeric type.\n'],
    ['spec', path.join(project, '.work/spec.md'), '# Public test spec\nMaximum is 100.\n'],
    ['policy', path.join(project, 'POLICY.md'), '# Public target policy\nStatic review only.\n'],
    ['plugin', path.join(plugin, 'SKILL.md'), '# Public plugin source sentinel\n']
  ]
  const representative = fixtureFile !== undefined
  const expectedIds = representative ? representativeCaseIds : caseIds
  if (representative) {
    assert.ok(fs.lstatSync(fixtureFile).isFile() && fs.statSync(fixtureFile).size <= 65536)
    const files = reviewFiles(JSON.parse(fs.readFileSync(fixtureFile, 'utf8')))
    plugin = fs.realpathSync(pluginSourceRoot)
    assert.equal(plugin, path.resolve('i68-source'), 'UNEXPECTED_PLUGIN_ROOT')
    assert.ok(Object.hasOwn(pluginHashes, sourceRef), 'UNEXPECTED_PLUGIN_REF')
    normal = files.map(file => ['review:' + file.path, path.join(project, file.path), file.content])
    for (const [, file] of normal) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      assert.equal(fs.realpathSync(path.dirname(file)), path.dirname(file), 'REVIEW_PARENT_LINK')
    }
    for (const [, file, text] of normal) fs.writeFileSync(file, text, { flag: 'wx' })
    for (const [relative, hash] of Object.entries(pluginHashes[sourceRef])) {
      const file = path.join(plugin, relative)
      assert.equal(fs.realpathSync(file), file, 'PLUGIN_LINK')
      const bytes = fs.readFileSync(file)
      assert.equal(digest(bytes), hash, 'PLUGIN_CONTENT_MISMATCH')
      normal.push(['plugin:' + relative, file, bytes.toString('utf8')])
    }
  } else for (const [, file, text] of normal) fs.writeFileSync(file, text, { flag: 'wx' })
  fs.writeFileSync(path.join(project, '.gitignore'), '.work/\n', { flag: 'wx' })
  const sentinel = path.join(outside, 'sentinel.txt'), secretFreeText = 'PUBLIC-OUTSIDE-SCOPE-SENTINEL\n'
  fs.writeFileSync(sentinel, secretFreeText, { flag: 'wx' })
  const link = path.join(project, 'outside-link')
  fs.symlinkSync(sentinel, link)
  assert.equal(fs.readFileSync(link, 'utf8'), secretFreeText)
  const grading = path.join(base, 'grading')
  const gradeCanary = path.join(grading, 'public-control.txt'), homeCanary = path.join(home, 'codex', 'public-auth-canary.txt')
  if (representative) {
    fs.mkdirSync(grading)
    for (const file of [gradeCanary, homeCanary]) fs.writeFileSync(file, secretFreeText, { flag: 'wx' })
  }
  const profile = { id: 'i68-read', filesystem: { ':root': 'deny', ':minimal': 'read', [executable]: 'read', [project]: 'read', [plugin]: 'read' }, network: { enabled: false } }
  const rules = Object.entries(profile.filesystem).map(([key, value]) => JSON.stringify(key) + '=' + JSON.stringify(value)).join(',')
  const args = ['app-server', '--stdio', '-c', 'default_permissions="i68-read"', '-c', 'approval_policy="never"', '-c', 'permissions.i68-read={filesystem={' + rules + '},network={enabled=false}}']
  const env = { PATH: '/usr/bin:/bin', HOME: home, CODEX_HOME: path.join(home, 'codex'), XDG_CONFIG_HOME: path.join(home, '.config'), TMPDIR: path.join(base, 'tmp'), LANG: 'C.UTF-8' }
  let observedSourceRef = null
  if (representative) {
    const source = cp.spawnSync('/usr/bin/git', ['-C', plugin, 'rev-parse', 'HEAD'], { env, timeout: 10000, maxBuffer: 10000, encoding: 'utf8' })
    assert.equal(source.status, 0, 'PLUGIN_REVISION_FAILED')
    observedSourceRef = source.stdout.trim()
    assert.equal(observedSourceRef, sourceRef, 'PLUGIN_REVISION_MISMATCH')
  }
  const version = cp.spawnSync(executable, ['--version'], { env, cwd: project, timeout: 10000, maxBuffer: 10000, encoding: 'utf8' })
  assert.equal(version.status, 0, 'VERSION_FAILED')
  assert.equal(version.stdout.trim(), 'codex-cli 0.162.1', 'VERSION_MISMATCH')
  const child = cp.spawn(executable, args, { env, cwd: project, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let closed = false, serverExit = null, failure = null, stdoutBytes = 0, stderrBytes = 0, id = 0, text = '', stderrText = ''
  const pending = new Map(), methods = [], rows = [], commandErrors = []
  function fail(reason) {
    failure ||= reason
    for (const item of pending.values()) item.reject(new Error(reason))
    pending.clear()
  }
  function request(method, params) {
    assert.ok(['initialize', 'permissionProfile/list', 'command/exec'].includes(method))
    if (failure || closed) return Promise.reject(new Error(failure || 'SERVER_ALREADY_CLOSED'))
    methods.push(method)
    return new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject })
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
    })
  }
  const decoder = new TextDecoder('utf-8', { fatal: true })
  child.stdout.on('data', bytes => {
    stdoutBytes += bytes.length
    if (stdoutBytes > 1024 * 1024) return fail('OUTPUT_BOUND')
    try {
      text += decoder.decode(bytes, { stream: true })
      let newline
      while ((newline = text.indexOf('\n')) !== -1) {
        const line = text.slice(0, newline); text = text.slice(newline + 1)
        if (!line.trim()) continue
        const message = JSON.parse(line)
        if (message.id === undefined) continue
        const item = pending.get(message.id)
        if (!item) { fail('UNEXPECTED_SERVER_REQUEST'); continue }
        pending.delete(message.id)
        if (message.error) {
          const details = String(message.error.message)
          const category = /namespace|bubblewrap|bwrap|sandbox|Operation not permitted/i.test(details) ? 'SANDBOX_RPC_ERROR' : 'RPC_ERROR'
          item.reject(new Error(category + '_' + message.error.code))
        } else item.resolve(message.result)
      }
    } catch { fail('INVALID_PROTOCOL') }
  })
  child.stdout.on('end', () => {
    try { text += decoder.decode(); if (text.trim()) fail('PARTIAL_PROTOCOL') } catch { fail('INVALID_UTF8') }
  })
  child.stderr.on('data', bytes => {
    stderrBytes += bytes.length
    if (stderrText.length < 4000) stderrText += bytes.toString('utf8')
    if (stderrBytes > 1024 * 1024) fail('STDERR_BOUND')
  })
  child.on('error', () => fail('SPAWN_FAILED'))
  child.stdin.on('error', () => fail('STDIN_FAILED'))
  child.on('close', code => { closed = true; serverExit = code; if (pending.size) fail('SERVER_CLOSED_BEFORE_RESPONSE') })
  const timer = setTimeout(() => fail('TIMEOUT'), 60000)
  try {
    await request('initialize', { clientInfo: { name: 'devflow_native_ci', version: '1' }, capabilities: { experimentalApi: true } })
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n')
    const profiles = await request('permissionProfile/list', { cwd: project })
    assert.ok(profiles.data.some(p => p.id === profile.id && p.allowed), 'PROFILE_NOT_ACCEPTED')
    const execute = async command => {
      const result = await request('command/exec', { command, cwd: project, permissionProfile: profile.id, timeoutMs: 10000, outputBytesCap: 10000 })
      if (result.exitCode !== 0) commandErrors.push({ tool: path.basename(command[0]), stderrBytes: Buffer.byteLength(result.stderr || ''), normalizedStderrSha256: digest((result.stderr || '').split(base).join('<fixture>').split(path.dirname(executable)).join('<vendor>')), error: startupError('Error: ' + (result.stderr || ''), [[base, '<fixture>'], [path.dirname(executable), '<vendor>']]) })
      return result
    }
    for (const [name, file, expected] of normal) rows.push(readReceipt(name, await execute(['/usr/bin/cat', '--', file]), expected, true, file))
    for (const [name, file] of [['outside', sentinel], ['symlink', link], ['parent-path', project + '/../outside/sentinel.txt']]) {
      assert.equal(fs.readFileSync(file, 'utf8'), secretFreeText)
      rows.push(readReceipt(name, await execute(['/usr/bin/cat', '--', file]), secretFreeText, false, file))
    }
    for (const [name, file] of [['readonly-write', path.join(project, 'new.txt')], ['outside-write', path.join(outside, 'new.txt')]]) {
      assert.equal(fs.existsSync(file), false)
      rows.push(writeReceipt(name, await execute(['/usr/bin/touch', '--', file]), fs.existsSync(file), file))
    }
    if (representative) for (const [name, file] of [['grading', gradeCanary], ['home', homeCanary]]) {
      assert.equal(fs.readFileSync(file, 'utf8'), secretFreeText)
      rows.push(readReceipt(name, await execute(['/usr/bin/cat', '--', file]), secretFreeText, false, file))
    }
    for (const [, file, expected] of normal) assert.equal(fs.readFileSync(file, 'utf8'), expected, 'FIXTURE_CHANGED')
  } catch (error) { failure ||= error.message }
  clearTimeout(timer)
  child.stdin.end()
  for (let i = 0; i < 40 && !closed; i++) await pause(50)
  function groupExists() {
    if (!child.pid) return !closed
    try { process.kill(-child.pid, 0); return true } catch (error) { return error.code !== 'ESRCH' }
  }
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    if (!groupExists()) break
    try { process.kill(-child.pid, signal) } catch (error) { if (error.code !== 'ESRCH') failure ||= 'TERMINATION_FAILED' }
    for (let i = 0; i < 40 && groupExists(); i++) await pause(50)
  }
  const groupClosed = !groupExists()
  if (serverExit !== 0) failure ||= 'SERVER_EXIT_NONZERO'
  const evidence = { kind: 'native Linux sandbox; not model dispatch, plugin loading, hook or performance proof', mode: representative ? 'representative' : 'small', sourceRef: observedSourceRef, expectedCaseIds: expectedIds, status: passed(rows, closed, groupClosed, failure, expectedIds) ? 'PASS' : 'BLOCKED', failure, startupError: rows.length ? null : startupError(stderrText, [[base, '<fixture>'], [path.dirname(executable), '<vendor>']]), version: version.stdout.trim(), commandErrors, policy: { root: 'deny', minimal: 'read', readableFixtureRoots: 2, readableRuntimeFiles: 1, network: false }, rows, serverClosed: closed, processGroupClosed: groupClosed, serverExit, stdoutBytes, stderrBytes, rpcMethods: methods, nativeInferenceCalls: 0, credentialsInherited: false }
  console.log('DEVFLOW_NATIVE_CI_EVIDENCE=' + JSON.stringify(evidence))
  return evidence
}
module.exports = { readReceipt, writeReceipt, passed, caseIds, startupError, reviewFiles, representativeCaseIds }
if (require.main === module) run(...process.argv.slice(2)).then(evidence => { if (evidence.status !== 'PASS') process.exitCode = 1 }).catch(() => { console.error('DEVFLOW_NATIVE_CI_STARTUP_FAILED'); process.exitCode = 1 })
