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

const pre = (cwd, command, tool = 'Bash') => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command }, cwd })
const decision = out => out && JSON.parse(out).hookSpecificOutput.permissionDecision
const noAliases = { run: () => ({ code: 0, stdout: 'co: pr checkout\n', stderr: '' }) }
const check = (c, cwd = '.') => hook.issueWrite(c, { cwd, env: noAliases })
const encoded = s => Buffer.from(s, 'utf16le').toString('base64')
const ghPath = () => ['C:', 'Program Files', 'GitHub CLI', 'gh.exe'].join(String.fromCharCode(92))

test('follows what the command runs to the Issue write', () => {
  const writes = [
    'bash -c "gh issue comment 1 --body x"',
    "sh -lc 'gh issue close 1'",
    'eval "gh issue close 1"',
    'timeout 30 gh issue close 1',
    'env GH_DEBUG=1 gh issue close 1',
    'echo 1 | xargs -n1 gh issue close',
    'x=issue; gh $x comment 1 --body y',
    'gh $(echo issue) comment 1',
    '$GH issue close 1',
    'echo "gh issue close 1" | bash',
    'bash <<EOF\ngh issue close 1\nEOF',
    'cat <<\'EOF\' | sh\ngh issue close 1\nEOF',
    'bash <<< "gh issue close 1"',
    'for i in 1; do gh issue comment $i --body x; done',
    'if true; then gh issue close 1; fi',
    '(gh issue close 1)',
    'echo $(gh issue close 1)',
    'find . -name x -exec gh issue close 1 \\;',
    'pwsh -NoProfile -Command "gh issue close 1"',
    `pwsh -EncodedCommand ${encoded('gh issue close 1')}`,
    'cmd /c gh issue close 1',
    'Start-Process gh -ArgumentList "issue close 1"',
    `& "${ghPath()}" issue close 1`,
    'sudo -u me sh -c "gh issue close 1"',
    'node -e "fetch(\'https://api.github.com/repos/o/r/issues/1/comments\', { method: \'POST\' })"',
  ]
  for (const c of writes) assert.ok(check(c), c)
})

test('does not read quoted text and data as commands', () => {
  const allowed = [
    'git commit -m "gh issue comment docs"',
    "git commit -m 'gh issue close 1'",
    'git commit -F - <<EOF\ngh issue close 1\nEOF',
    'echo "gh issue close 1"',
    'grep -rn "gh issue comment" docs',
    'printf "%s\\n" "gh issue close 1" > notes.txt',
    'echo "gh issue close 1" | grep bash',
    'gh pr comment 3 --body "gh issue close 1"',
  ]
  for (const c of allowed) assert.equal(check(c), null, c)
})

test('resolves gh aliases', () => {
  const env = { run: () => ({ code: 0, stdout: 'ic: issue comment\nbye: !gh issue close "$1"\nco: pr checkout\n', stderr: '' }) }
  assert.ok(hook.issueWrite('gh ic 1 --body x', { env }))
  assert.ok(hook.issueWrite('gh bye 1', { env }))
  assert.equal(hook.issueWrite('gh co 3', { env }), null)
  const failing = { run: () => ({ code: 1, stdout: '', stderr: '' }) }
  assert.match(hook.issueWrite('gh mystery 1', { env: failing }), /alias lookup failed/)
})

test('reads script files that a command runs', () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, 'post.sh'), '#!/bin/sh\ngh issue comment 1 --body x\n')
  assert.ok(check('bash post.sh', d))
  assert.ok(check('./post.sh', d))
  assert.ok(check('. ./post.sh', d))
})

test('blocks GitHub MCP Issue writes only', () => {
  for (const t of ['mcp__github__issue_write', 'mcp__github__add_issue_comment', 'mcp__plugin_x_github__sub_issue_write', 'mcp__claude_ai_GitHub__issue_write']) {
    assert.ok(hook.mcpIssueWrite(t), t)
  }
  for (const t of ['mcp__github__issue_read', 'mcp__github__list_issues', 'mcp__github__search_issues', 'mcp__github__get_issue_comments', 'mcp__linear__create_issue']) {
    assert.equal(hook.mcpIssueWrite(t), null, t)
  }
  assert.equal(decision(hook.handle(pre(dir(true), undefined, 'mcp__github__issue_write'))), 'deny')
})

test('checks PowerShell tool commands and array commands', () => {
  assert.equal(decision(hook.handle(pre(dir(true), 'gh issue close 1', 'PowerShell'))), 'deny')
  assert.ok(check(['bash', '-lc', 'gh issue close 1']))
  assert.equal(check(['git', 'commit', '-m', 'gh issue close 1']), null)
})

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
