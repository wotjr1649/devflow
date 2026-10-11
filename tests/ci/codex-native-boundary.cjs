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
function passed(rows, serverClosed, groupClosed, failure) {
  return !failure && serverClosed && groupClosed && rows.length === caseIds.length &&
    rows.every((row, index) => row.id === caseIds[index] && row.pass)
}

async function run(executable) {
  assert.equal(process.platform, 'linux', 'LINUX_ONLY')
  assert.ok(path.isAbsolute(executable) && fs.statSync(executable).isFile())
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-native-'))
  const project = path.join(base, 'project'), plugin = path.join(base, 'plugin')
  const home = path.join(base, 'home'), outside = path.join(base, 'outside')
  for (const dir of [project, plugin, home, outside, path.join(base, 'tmp')]) fs.mkdirSync(dir)
  fs.mkdirSync(path.join(project, '.work'))
  const normal = [
    ['source', path.join(project, 'source.cjs'), 'module.exports = 100\n'],
    ['plan', path.join(project, '.work/plan.md'), '# Public test plan\nKeep numeric type.\n'],
    ['spec', path.join(project, '.work/spec.md'), '# Public test spec\nMaximum is 100.\n'],
    ['policy', path.join(project, 'POLICY.md'), '# Public target policy\nStatic review only.\n'],
    ['plugin', path.join(plugin, 'SKILL.md'), '# Public plugin source sentinel\n']
  ]
  for (const [, file, text] of normal) fs.writeFileSync(file, text, { flag: 'wx' })
  fs.writeFileSync(path.join(project, '.gitignore'), '.work/\n', { flag: 'wx' })
  const sentinel = path.join(outside, 'sentinel.txt'), secretFreeText = 'PUBLIC-OUTSIDE-SCOPE-SENTINEL\n'
  fs.writeFileSync(sentinel, secretFreeText, { flag: 'wx' })
  const link = path.join(project, 'outside-link')
  fs.symlinkSync(sentinel, link)
  assert.equal(fs.readFileSync(link, 'utf8'), secretFreeText)
  const profile = { id: 'i68-read', filesystem: { ':root': 'deny', ':minimal': 'read', [project]: 'read', [plugin]: 'read' }, network: { enabled: false } }
  const rules = Object.entries(profile.filesystem).map(([key, value]) => JSON.stringify(key) + '=' + JSON.stringify(value)).join(',')
  const args = ['app-server', '--stdio', '-c', 'default_permissions="i68-read"', '-c', 'approval_policy="never"', '-c', 'permissions.i68-read={filesystem={' + rules + '},network={enabled=false}}']
  const env = { PATH: '/usr/bin:/bin', HOME: home, CODEX_HOME: path.join(home, 'codex'), XDG_CONFIG_HOME: path.join(home, '.config'), TMPDIR: path.join(base, 'tmp'), LANG: 'C.UTF-8' }
  const version = cp.spawnSync(executable, ['--version'], { env, cwd: project, timeout: 10000, maxBuffer: 10000, encoding: 'utf8' })
  assert.equal(version.status, 0, 'VERSION_FAILED')
  assert.equal(version.stdout.trim(), 'codex-cli 0.162.1', 'VERSION_MISMATCH')
  const child = cp.spawn(executable, args, { env, cwd: project, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let closed = false, serverExit = null, failure = null, stdoutBytes = 0, stderrBytes = 0, id = 0, text = ''
  const pending = new Map(), methods = [], rows = []
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
  child.stderr.on('data', bytes => { stderrBytes += bytes.length; if (stderrBytes > 1024 * 1024) fail('STDERR_BOUND') })
  child.on('error', () => fail('SPAWN_FAILED'))
  child.stdin.on('error', () => fail('STDIN_FAILED'))
  child.on('close', code => { closed = true; serverExit = code; if (pending.size) fail('SERVER_CLOSED_BEFORE_RESPONSE') })
  const timer = setTimeout(() => fail('TIMEOUT'), 60000)
  try {
    await request('initialize', { clientInfo: { name: 'devflow_native_ci', version: '1' }, capabilities: { experimentalApi: true } })
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n')
    const profiles = await request('permissionProfile/list', { cwd: project })
    assert.ok(profiles.data.some(p => p.id === profile.id && p.allowed), 'PROFILE_NOT_ACCEPTED')
    const execute = command => request('command/exec', { command, cwd: project, permissionProfile: profile.id, timeoutMs: 10000, outputBytesCap: 10000 })
    for (const [name, file, expected] of normal) rows.push(readReceipt(name, await execute(['/usr/bin/cat', '--', file]), expected, true, file))
    for (const [name, file] of [['outside', sentinel], ['symlink', link], ['parent-path', project + '/../outside/sentinel.txt']]) {
      assert.equal(fs.readFileSync(file, 'utf8'), secretFreeText)
      rows.push(readReceipt(name, await execute(['/usr/bin/cat', '--', file]), secretFreeText, false, file))
    }
    for (const [name, file] of [['readonly-write', path.join(project, 'new.txt')], ['outside-write', path.join(outside, 'new.txt')]]) {
      assert.equal(fs.existsSync(file), false)
      rows.push(writeReceipt(name, await execute(['/usr/bin/touch', '--', file]), fs.existsSync(file), file))
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
  const evidence = { kind: 'native Linux sandbox; not model dispatch, plugin loading, hook or performance proof', status: passed(rows, closed, groupClosed, failure) ? 'PASS' : 'BLOCKED', failure, version: version.stdout.trim(), policy: { root: 'deny', minimal: 'read', readableFixtureRoots: 2, network: false }, rows, serverClosed: closed, processGroupClosed: groupClosed, serverExit, stdoutBytes, stderrBytes, rpcMethods: methods, nativeInferenceCalls: 0, credentialsInherited: false }
  console.log('DEVFLOW_NATIVE_CI_EVIDENCE=' + JSON.stringify(evidence))
  return evidence
}
module.exports = { readReceipt, writeReceipt, passed, caseIds }
if (require.main === module) run(process.argv[2]).then(evidence => { if (evidence.status !== 'PASS') process.exitCode = 1 }).catch(() => { console.error('DEVFLOW_NATIVE_CI_STARTUP_FAILED'); process.exitCode = 1 })
