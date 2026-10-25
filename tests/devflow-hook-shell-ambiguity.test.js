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
fs.writeFileSync(path.join(root, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
const input = command => JSON.stringify({
  hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: root,
})
const output = command => JSON.parse(hook.handle(input(command), env)).hookSpecificOutput

test('a literal here-string ambiguity stays denied and identifies the missing shell (#69)', () => {
  for (const command of [source, source.replaceAll('\n', '\r\n'), '  ' + source]) {
    assert.match(check(command), /shell ambiguity.*execution shell/i)
    const result = output(command)
    assert.equal(result.permissionDecision, 'deny')
    assert.match(result.permissionDecisionReason, /PowerShell here-string/i)
    assert.match(result.permissionDecisionReason, /cannot establish command safety/i)
    assert.doesNotMatch(result.permissionDecisionReason, /Issue writes go through/)
  }
})

test('ordinary dynamic commands and confirmed writes retain their diagnostics (#69)', () => {
  assert.equal(check('$GH issue close 1'), 'command name built at run time with Issue words')
  assert.equal(check('gh issue close 1'), 'gh issue write')
  assert.equal(check('gh api -X POST repos/o/r/issues/1/comments -f body=x'), 'gh api Issue write')
  assert.equal(check(['gh', 'issue', 'close', '1']), 'gh issue write')
  assert.match(output('gh issue close 1').permissionDecisionReason, /Issue writes go through/)
  assert.equal(check("echo \"@'\"; $GH issue close 1"), 'command name built at run time with Issue words')
})

test('unresolved commands explain uncertainty without claiming an Issue write (#90)', () => {
  for (const command of [assigned, assigned.replaceAll('\n', '\r\n'), '$GH issue close 1', ['$GH', 'api', '-X', 'POST']]) {
    assert.equal(check(command), 'command name built at run time with Issue words')
    const result = output(command)
    assert.equal(result.permissionDecision, 'deny')
    assert.match(result.permissionDecisionReason, /cannot establish command safety.*parsed command name is unresolved/i)
    assert.doesNotMatch(result.permissionDecisionReason, /Issue writes go through|execution shell is not identified/i)
  }
})

test('here-string presence cannot allow writes or execution outside its body (#69)', () => {
  for (const command of [
    source + '; gh issue close 1',
    'gh issue close 1;\n' + source,
    source.replace('| node', '| bash'),
    source.replace('| node', '| pwsh'),
    source.replace('| node', '| Invoke-Expression'),
    source.replace("'$devflow'", "'$(gh issue close 1)'"),
  ]) assert.equal(output(command).permissionDecision, 'deny', command)
})

test('here-string ambiguity and shell-fed text retain protected path and write guards (#69)', () => {
  for (const command of [
    source + '; Set-Content _ref/probe.txt x',
    'Set-Content _ref/probe.txt x;\n' + source,
    'echo x > _ref/probe.txt',
    'printf "gh issue close 1" | bash',
    "cat <<'EOF' | sh\ngh issue close 1\nEOF",
    'pwsh -Command "gh issue close 1"',
  ]) assert.equal(output(command).permissionDecision, 'deny', command)
  assert.match(output('Set-Content _ref/probe.txt x').permissionDecisionReason, /protected path/)
})

test('ordinary literal data keeps its existing allow decision (#69)', () => {
  for (const command of [
    'git commit -m "gh issue close 1"',
    'Write-Output "gh issue close 1"',
    "node <<'EOF'\n'$devflow' Do not create Issue\nEOF",
    ['git', 'commit', '-m', 'gh issue close 1'],
  ]) assert.equal(check(command), null, String(command))
})

test('native hook process returns a deny, not an analyzer failure (#69)', () => {
  const run = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main()', path.resolve(__dirname, '../hooks/devflow-hook.js')], {
    input: input(source), encoding: 'utf8', timeout: 15000, windowsHide: true,
  })
  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(run.stdout).hookSpecificOutput
  assert.equal(result.permissionDecision, 'deny')
  assert.match(result.permissionDecisionReason, /shell ambiguity.*execution shell/i)
  assert.doesNotMatch(result.permissionDecisionReason, /check failed|deadline was exceeded/)
})

test('native unresolved-command denial keeps its issue-write guard record (#90)', () => {
  const cwd = tmpdir('unresolved-guard-')
  fs.writeFileSync(path.join(cwd, '.devflow.json'), '{}')
  const git = spawnSync('git', ['init', '-q', '--initial-branch=fix/90-fixture', cwd], { encoding: 'utf8', windowsHide: true })
  assert.equal(git.status, 0, git.stderr)
  const run = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main()', path.resolve(__dirname, '../hooks/devflow-hook.js')], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: assigned }, cwd }),
    encoding: 'utf8', timeout: 15000, windowsHide: true,
  })
  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(run.stdout).hookSpecificOutput
  assert.equal(result.permissionDecision, 'deny')
  assert.match(result.permissionDecisionReason, /cannot establish command safety.*parsed command name is unresolved/i)
  const records = fs.readFileSync(path.join(cwd, '.work/devflow/i90/guard-events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.deepEqual(records.map(r => r.guard), ['issue-write'])
})
