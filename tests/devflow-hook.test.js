'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const hook = require('../hooks/devflow-hook')

function dir(devflow) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-hook-'))
  if (devflow) fs.writeFileSync(path.join(d, '.devflow.json'), '{}')
  fs.mkdirSync(path.join(d, 'sub'))
  return d
}

const pre = (cwd, command) => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd })
const decision = out => out && JSON.parse(out).hookSpecificOutput.permissionDecision

test('blocks direct Issue writes', () => {
  const writes = [
    'gh issue comment 1 -R o/r --body "x"',
    'gh issue edit 1 --body-file b.md',
    'cd x && gh.exe issue close 3',
    'gh issue create --title t --body b',
    'gh api repos/o/r/issues/1/comments -f body=x',
    'gh api -X PATCH repos/o/r/issues/1 -f state=closed',
    'gh api --method=POST repos/o/r/issues',
    'gh api graphql -f query=\'mutation { addComment(input:{}) { clientMutationId } }\'',
    'gh api graphql -F query=@q.graphql',
    'curl -X POST https://api.github.com/repos/o/r/issues/1/comments -d "{}"',
    'Invoke-RestMethod -Method Post -Uri https://api.github.com/repos/o/r/issues -Body $b',
  ]
  for (const c of writes) assert.ok(hook.issueWrite(c), c)
})

test('allows Issue reads and other commands', () => {
  const reads = [
    'gh issue view 1 -R o/r --json body',
    'gh issue list',
    'gh api repos/o/r/issues/1',
    'gh api -X GET repos/o/r/issues -f state=open',
    'gh api graphql -f query=\'query { viewer { login } }\'',
    'gh api repos/o/r/pulls -f title=x',
    'node bin/devflow-state comment 1 < c.md',
    'curl https://api.github.com/repos/o/r/issues/1',
  ]
  for (const c of reads) assert.equal(hook.issueWrite(c), null, c)
})

test('PreToolUse denies a raw Issue write inside a devflow repository', () => {
  const d = dir(true)
  const out = hook.handle(pre(path.join(d, 'sub'), 'gh issue comment 1 --body x'))
  assert.equal(decision(out), 'deny')
  assert.match(JSON.parse(out).hookSpecificOutput.permissionDecisionReason, /devflow-state/)
})

test('PreToolUse allows the same command outside a devflow repository', () => {
  assert.equal(hook.handle(pre(dir(false), 'gh issue comment 1 --body x')), '')
})

test('PreToolUse allows ordinary commands', () => {
  assert.equal(hook.handle(pre(dir(true), 'npm test')), '')
})

test('unreadable hook input is denied', () => {
  assert.equal(decision(hook.handle('{not json')), 'deny')
})

test('SessionStart prints nothing outside a devflow repository', () => {
  const d = dir(false)
  const env = { run: () => ({ code: 0, stdout: d + '\n', stderr: '' }) }
  assert.equal(hook.handle(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: d }), env), '')
})

test('SessionStart turns a card failure into a reason line', () => {
  const env = { run: () => { throw new Error('spawn failed') } }
  const out = JSON.parse(hook.handle(JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact', cwd: '.' }), env))
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(out.hookSpecificOutput.additionalContext, /resume card failed: spawn failed/)
})

test('the hooks.json command runs the hook through a shell', () => {
  const { command } = require('../hooks/hooks.json').hooks.PreToolUse[0].hooks[0]
  const d = dir(true)
  const win = process.platform === 'win32'
  const out = execFileSync(win ? 'cmd.exe' : 'sh', win ? ['/d', '/s', '/c', `"${command}"`] : ['-c', command], {
    input: pre(d, 'gh issue close 1'),
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: path.resolve(__dirname, '..') },
    encoding: 'utf8',
    windowsVerbatimArguments: win,
  })
  assert.equal(decision(out.trim()), 'deny')
})
