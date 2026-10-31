'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const tmpdir = require('./tmpdir')
const hook = require('../hooks/devflow-hook')

const env = { run() { throw new Error('This fixture must not invoke external commands') } }
const check = command => hook.issueWrite(command, { env })
// Synthetic data only: no message is sent and no command in the here-string is executed.
const source = [
  "@'",
  "const prompt=['$devflow', 'Do not create Issue or call GitHub.'];",
  "process.stdout.write(prompt.join('\\n'));",
  "'@ | node",
].join('\n')
const assigned = [
  "$ErrorActionPreference = 'Stop'",
  "$prompt = @'",
  "Read this project's Issue description and '$example' as data.",
  "'@",
  'Write-Output $prompt',
].join('\n')
const root = tmpdir('shell-ambiguity-')
fs.writeFileSync(path.join(root, '.devflow.json'), '{}')
const input = command => JSON.stringify({
  hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: root,
})
const output = command => JSON.parse(hook.handle(input(command), env)).hookSpecificOutput

test('here-string and unresolved-command ambiguity passes (#69, #90)', () => {
  for (const command of [source, source.replaceAll('\n', '\r\n'), '  ' + source,
    assigned, assigned.replaceAll('\n', '\r\n'), '$GH issue close 1', ['$GH', 'api', '-X', 'POST'],
    'gh $operation 1', 'gh issue $operation 1',
  ]) {
    assert.equal(check(command), null, String(command))
    assert.equal(hook.handle(input(command), env), '', String(command))
  }
})

test('confirmed text writes still block outside literal data', () => {
  for (const command of [
    'gh issue comment 1 --body x',
    'gh api -X POST repos/o/r/issues/1/comments -f body=x',
    source + '; gh issue comment 1 --body x',
    'gh issue comment 1 --body x;\n' + source,
    'printf "gh issue comment 1 --body x" | bash',
    "cat <<'EOF' | sh\ngh issue comment 1 --body x\nEOF",
    'pwsh -Command "gh issue comment 1 --body x"',
  ]) {
    const result = output(command)
    assert.equal(result.permissionDecision, 'deny', command)
    assert.match(result.permissionDecisionReason, /Issue writes go through/)
  }
})

test('literal data and removed protected paths pass', () => {
  for (const command of [
    'git commit -m "gh issue comment 1 --body x"',
    'Write-Output "gh issue comment 1 --body x"',
    "node <<'EOF'\n'$devflow' Do not create Issue\nEOF",
    ['git', 'commit', '-m', 'gh issue comment 1 --body x'],
    source + '; Set-Content _ref/probe.txt x',
    'Set-Content _ref/probe.txt x;\n' + source,
    'echo x > _ref/probe.txt',
  ]) assert.equal(hook.handle(input(command), env), '', String(command))
})

test('native hook process allows unresolved commands without guard records', () => {
  for (const command of [source, assigned]) {
    const run = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main()', path.resolve(__dirname, '../hooks/devflow-hook.js')], {
      input: input(command), encoding: 'utf8', timeout: 15000, windowsHide: true,
    })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.stdout.trim(), '')
    assert.equal(fs.existsSync(path.join(root, '.work')), false)
  }
})
