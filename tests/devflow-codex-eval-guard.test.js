'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const tmpdir = require('./tmpdir')
const { permits } = require('../bin/devflow-codex-eval-guard')
const { guardCommand, checkGuardCommand, cleanEnv } = require('../bin/devflow-codex-eval')

function setup() {
  const home = tmpdir('codex-eval-guard-')
  const file = path.join(home, 'skills', 'grilling', 'SKILL.md')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, 'public test')
  fs.writeFileSync(path.join(home, 'auth.json'), 'public denied canary')
  fs.writeFileSync(path.join(home, 'eval-public-root.json'), JSON.stringify({ root: home }))
  return { home, file }
}
const event = command => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } })

test('public reads run; shell expansion, execution and private paths are denied', () => {
  const { home, file } = setup()
  assert.equal(permits(event(`Get-Content -LiteralPath '${file}' -Raw`), home), true)
  assert.equal(permits(event(`cat "${file}"`), home), true)
  const denied = [
    `Get-Content '${path.join(home, 'auth.json')}'`, `cat '${file}'; whoami`, `cat '${file}' | node`,
    `cat '${file}' > output`, `echo 'cat "${file}"'`, `node -e "require('fs').readFileSync('${file}')"`,
    `powershell -Command "Get-Content '${file}'"`, `Get-Content '${file}' -Tail 1 -Wait`,
    `cat '${file.replace('SKILL.md', '..' + path.sep + 'SKILL.md')}'`, `cat '$env:CODEX_HOME/auth.json'`,
  ]
  for (const command of denied) assert.equal(permits(event(command), home), false, command)
  for (const tool of ['apply_patch', 'Agent', 'mcp__example__read', 'functions.exec', 'write_stdin']) {
    assert.equal(permits({ ...event(`cat '${file}'`), tool_name: tool }, home), false)
  }
  assert.equal(permits({ ...event(`cat '${file}'`), tool_input: { command: `cat '${file}'`, login: true } }, home), false)
})

test('a symlink inside the snapshot cannot expose another file', () => {
  const { home, file } = setup()
  const link = path.join(path.dirname(file), 'linked.md')
  fs.symlinkSync(path.join(home, 'auth.json'), link)
  assert.equal(permits(event(`cat '${link}'`), home), false)
})

test('guard CLI rejects malformed input and emits actual allow/deny decisions', () => {
  const { home, file } = setup()
  for (const [input, expected] of [[JSON.stringify(event(`cat '${file}'`)), 'allow'], ['invalid JSON', 'deny'], [JSON.stringify(event('whoami')), 'deny']]) {
    const run = spawnSync(process.execPath, [path.resolve(__dirname, '../bin/devflow-codex-eval-guard')], { input, encoding: 'utf8', env: { CODEX_HOME: home }, timeout: 3000 })
    assert.equal(run.status, 0)
    assert.equal(JSON.parse(run.stdout).hookSpecificOutput.permissionDecision, expected)
  }
  const audit = fs.readFileSync(path.join(home, 'eval-guard-audit.jsonl'), 'utf8')
  assert.equal(audit.includes(file), false)
  assert.equal(audit.includes('whoami'), false)
})

test('hook remains configured when its shell environment excludes CODEX_HOME', () => {
  const { home, file } = setup()
  const run = spawnSync(process.execPath, [path.resolve(__dirname, '../bin/devflow-codex-eval-guard'), home], {
    input: JSON.stringify(event(`cat '${file}'`)), encoding: 'utf8', env: {}, timeout: 3000,
  })
  assert.equal(run.status, 0)
  assert.equal(JSON.parse(run.stdout).hookSpecificOutput.permissionDecision, 'allow')
  assert.equal(fs.existsSync(path.join(home, 'eval-guard-audit.jsonl')), true)
})

test('the configured hook command runs through the host shell with allow and deny audit', () => {
  const { home } = setup()
  fs.copyFileSync(path.resolve(__dirname, '../bin/devflow-codex-eval-guard'), path.join(home, 'eval-guard.cjs'))
  checkGuardCommand(home, home, cleanEnv(home))
  assert.deepEqual(fs.readFileSync(path.join(home, 'eval-guard-audit.jsonl'), 'utf8').trim().split('\n').map(JSON.parse), [
    { allowed: true }, { allowed: false }, { allowed: false },
  ])
  if (process.platform === 'win32') {
    const previous = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', guardCommand(home).slice(2)], {
      input: '{}', encoding: 'utf8', timeout: 3000,
    })
    assert.notEqual(previous.status, 0)
    assert.match(previous.stderr, /ParserError|Unexpected token/)
  }
})
