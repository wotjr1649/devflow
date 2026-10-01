'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')
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

test('catches the forms the 2026-10-01 review found', () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, 'post.sh'), 'gh issue close 1\n')
  fs.writeFileSync(path.join(d, 'safe.sh'), 'echo ok\n')
  const writes = [
    'cat <<EOF\n$(gh issue close 1)\nEOF',
    'cat <<EOF\n`gh issue close 1`\nEOF',
    'gh api repos/o/r/issues/1/comments -fbody=x',
    'gh api graphql -Fquery=@q.graphql',
    'gh api graphql --raw-field=query="$Q"',
    "gh api /graphql -f query='mutation { addComment(input: {}) { clientMutationId } }'",
    'curl -X POST https://api.github.com/graphql -d \'{"query":"mutation { addComment }"}\'',
    'powershell "gh issue close 1"',
    'echo "gh issue close 1" | pwsh -Command -',
    'cat post.sh | bash',
    'env -S "gh issue close 1"',
    'bash -o pipefail post.sh',
  ]
  for (const c of writes) assert.ok(check(c, d), c)
  assert.equal(check("cat <<'EOF'\n$(gh issue close 1)\nEOF", d), null, 'a quoted heredoc is data')
  assert.equal(check('bash -o pipefail safe.sh', d), null)
})

test('reads YAML-quoted gh aliases and refuses unreadable ones', () => {
  const calls = []
  const env = stdout => ({ run: (cmd, args, opts) => (calls.push(opts), { code: 0, stdout, stderr: '' }) })
  assert.ok(hook.issueWrite('gh bye 1', { env: env('bye: \'!gh issue close "$1"\'\n') }))
  assert.ok(hook.issueWrite('gh ic 1', { env: env('ic: "issue comment"\n') }))
  assert.match(hook.issueWrite('gh multi 1', { env: env('multi: |-\n  issue close\n') }), /could not be read/)
  assert.ok(calls.every(o => o.timeout <= 3000), 'alias lookup ends before the hook timeout')
})

test('the PreToolUse matcher covers shells and GitHub MCP tools only', () => {
  const { matcher, hooks } = require('../hooks/hooks.json').hooks.PreToolUse[0]
  const re = new RegExp(matcher)
  for (const t of ['Bash', 'PowerShell', 'mcp__github__issue_write', 'mcp__claude_ai_GitHub__add_issue_comment']) assert.ok(re.test(t), t)
  for (const t of ['Edit', 'Write', 'NotebookEdit', 'apply_patch']) assert.ok(re.test(t), t)
  for (const t of ['BashOutput', 'Read', 'MultiEditor', 'mcp__memory__create_entities']) assert.ok(!re.test(t), t)
  assert.ok(hooks[0].timeout * 1000 > 3000 + 5000, 'the hook outlives the alias lookup with room for node to start')
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

const event = (name, cwd, extra = {}) => JSON.stringify({ hook_event_name: name, cwd, ...extra })

test('PreToolUse blocks edits to protected paths and nothing else', () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  const edit = (tool, input, cwd = d) => hook.handle(event('PreToolUse', cwd, { tool_name: tool, tool_input: input }))
  assert.equal(decision(edit('Edit', { file_path: path.join(d, '_ref', 'x.md') })), 'deny')
  assert.equal(decision(edit('NotebookEdit', { notebook_path: path.join(d, '_ref', 'n.ipynb') })), 'deny')
  const patch = '*** Begin Patch\n*** Update File: _ref/a.md\n@@\n-x\n+y\n*** End Patch\n'
  assert.equal(decision(edit('apply_patch', { command: patch })), 'deny')
  assert.equal(decision(edit('apply_patch', { command: patch }, path.join(d, 'sub'))), '', 'relative to the sub folder it is not _ref')
  assert.equal(edit('Write', { file_path: path.join(d, 'src', 'x.md') }), '')
  const outside = dir(false)
  assert.equal(edit('Edit', { file_path: path.join(outside, '_ref', 'x.md') }, outside), '')
  fs.writeFileSync(path.join(d, '.devflow.json'), '{ broken')
  assert.equal(decision(edit('Edit', { file_path: path.join(d, 'a.md') })), 'deny', 'an unreadable profile fails closed')
})

test('PostToolUse reports doctor findings for an edited instruction file', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-audit-'))
  spawnSync('git', ['-C', d, 'init', '-q'])
  fs.writeFileSync(path.join(d, '.devflow.json'), '{}')
  fs.writeFileSync(path.join(d, 'AGENTS.md'), '# demo\n\n## Commands\n- test\n')
  fs.writeFileSync(path.join(d, 'notes.txt'), 'x\n')
  const post = file => hook.handle(event('PostToolUse', d, { tool_name: 'Write', tool_input: { file_path: path.join(d, file) } }))
  const out = JSON.parse(post('AGENTS.md')).hookSpecificOutput
  assert.equal(out.hookEventName, 'PostToolUse')
  assert.match(out.additionalContext, /FAIL agents-md: no "## Boundaries" section/)
  assert.equal(post('notes.txt'), '')
  assert.equal(hook.handle(event('PostToolUse', dir(false), { tool_name: 'Write', tool_input: { file_path: 'AGENTS.md' } })), '')
})

test('Stop continues open unattended work at most twice per task', () => {
  const root = dir(true)
  const ledgerFile = path.join(root, '.work/devflow/i1/ledger.json')
  const setLedger = l => {
    fs.mkdirSync(path.dirname(ledgerFile), { recursive: true })
    fs.writeFileSync(ledgerFile, typeof l === 'string' ? l : JSON.stringify(l))
  }
  const env = { run: (cmd, args) => {
    const a = args.join(' ')
    const out = { 'rev-parse --show-toplevel': root, 'branch --show-current': 'feat/1-x', 'rev-parse --short HEAD': 'abc1234',
      'remote get-url origin': 'https://github.com/o/r.git' }[a]
    return out ? { code: 0, stdout: out + '\n', stderr: '' } : { code: 1, stdout: '', stderr: '' }
  } }
  const stop = () => hook.handle(event('Stop', root, { stop_hook_active: false }), env)
  const open = { mode: 'autonomous', stage: 'build', task: { current: 1, total: 2 } }
  setLedger(open)
  assert.equal(JSON.parse(stop()).decision, 'block')
  assert.match(JSON.parse(stop()).reason, /task 1\/2 is open \(build\)/)
  assert.equal(stop(), '', 'the third stop in the same task is allowed')
  assert.equal(JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).counts['1'].continue, 2)
  for (const l of [{ ...open, mode: 'interactive' }, { ...open, decisions: ['which API?'] }, { ...open, blocked: 'CI down' },
    { ...open, running: ['reviewer'] }, { ...open, stage: 'review' }, { ...open, task: { current: 3, total: 2 } }]) {
    setLedger(l)
    assert.equal(stop(), '', JSON.stringify(l))
  }
  setLedger({ ...open, mode: 'interactive', runMode: 'M2' })
  assert.equal(JSON.parse(stop()).decision, 'block', 'M2 delegation counts as unattended')
  setLedger('{ broken')
  assert.equal(stop(), '', 'an unreadable ledger lets the session stop')
})

test('a script operand ends the shell options (2026-10-01 review)', () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, 'evil.sh'), 'gh issue close 1\n')
  assert.ok(check('bash evil.sh -c true', d))
  assert.ok(check('pwsh -NoProfile -ExecutionPolicy Bypass -Command "gh issue close 1"', d))
  fs.writeFileSync(path.join(d, 'evil.ps1'), 'gh issue close 1\n')
  assert.ok(check('pwsh -File evil.ps1 -c true', d))
})

test('shell writes to protected paths are blocked, reads are not', () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  const run = (command, tool = 'Bash') => hook.handle(pre(d, command, tool))
  for (const c of ['echo x > _ref/a.md', 'rm -rf _ref/x', 'sed -i s/a/b/ _ref/x.md', 'bash -c "rm _ref/x"', 'cp src.md _ref/x.md',
    'git checkout -- _ref/x.md', 'timeout 5 tee _ref/log.txt']) {
    const out = run(c)
    assert.equal(decision(out), 'deny', c)
    assert.match(JSON.parse(out).hookSpecificOutput.permissionDecisionReason, /protected path/, c)
  }
  assert.equal(decision(run('Remove-Item _ref/x.md', 'PowerShell')), 'deny')
  for (const c of ['cp _ref/x.md notes/', 'cat _ref/x.md', 'grep -r foo _ref', 'echo hi > /dev/null', 'git checkout main']) {
    assert.equal(run(c), '', c)
  }
  if (/^(win32|darwin)$/.test(process.platform)) {
    assert.equal(decision(hook.handle(event('PreToolUse', d, { tool_name: 'Edit', tool_input: { file_path: path.join(d, '_REF', 'x.md') } }))), 'deny')
    assert.equal(decision(run('rm _Ref/x')), 'deny')
  }
})
