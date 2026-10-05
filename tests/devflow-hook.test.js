'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const tmpdir = require('./tmpdir')
const { execFileSync, spawnSync } = require('child_process')
const hook = require('../hooks/devflow-hook')

function dir(devflow) {
  const d = tmpdir('devflow-hook-')
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

test('the deny reason names every devflow-state write, so a new one is not left out (Issue #8)', () => {
  const reason = JSON.parse(hook.handle(pre(dir(true), 'gh issue edit 1 --body-file b.md'))).hookSpecificOutput.permissionDecisionReason
  const listed = /devflow-state \(([^)]*)\)/.exec(reason)[1].split(', ')
  assert.deepEqual(listed, [...require('../bin/devflow-state').WRITE_OPS])
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
  const d = tmpdir('devflow-audit-')
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
  for (const l of [{ ...open, blocked: [], decisions: [], running: [] }, { ...open, blocked: {} }, { ...open, blocked: '' }]) {
    setLedger(l)
    assert.equal(JSON.parse(stop()).decision, 'block', `empty keys still continue: ${JSON.stringify(l)}`)
  }
  setLedger({ ...open, mode: 'interactive', runMode: 'M2' })
  assert.equal(stop(), '', 'an interactive session delegating in M2 is attended')
  setLedger('{ broken')
  assert.equal(stop(), '', 'an unreadable ledger lets the session stop')
  // Issue #10: the count goes through the ledger lock; a lock another write holds lets the session stop untouched.
  setLedger(open)
  const lock = path.join(path.dirname(ledgerFile), 'ledger.lock')
  fs.writeFileSync(lock, 'other-writer')
  assert.equal(stop(), '', 'a held lock lets the session stop')
  assert.equal(JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).counts, undefined)
  assert.equal(fs.readFileSync(lock, 'utf8'), 'other-writer')
  fs.rmSync(lock)
  assert.equal(JSON.parse(stop()).decision, 'block')
  assert.ok(!fs.existsSync(lock), 'the hook releases its own lock')
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

test('Git Bash drive paths reach the protected-path check on Windows', { skip: process.platform !== 'win32' }, () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  const posix = '/' + d[0].toLowerCase() + d.slice(2).split(path.sep).join('/')
  assert.equal(decision(hook.handle(pre(d, `rm ${posix}/_ref/x`))), 'deny')
  assert.equal(decision(hook.handle(pre(d, `rm /cygdrive${posix}/_ref/x`))), 'deny')
  assert.equal(decision(hook.handle(event('PreToolUse', d, { tool_name: 'Edit', tool_input: { file_path: `${posix}/_ref/x` } }))), 'deny')
  assert.equal(hook.handle(pre(d, `rm ${posix}/notes/x`)), '')
})

test('protected folders themselves, patterns and repository-wide writes (2026-10-01 re-review)', () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  const run = command => decision(hook.handle(pre(d, command))) || 'allow'
  for (const c of ['rm -rf _ref', 'rm -rf _ref/', 'cp -r src _ref', 'rm -rf *', 'rm -rf .', 'git clean -fdx',
    'git -C . checkout -- _ref/x', 'find _ref -delete']) assert.equal(run(c), 'deny', c)
  for (const c of ['cat < _ref/x.md', 'while read l; do echo "$l"; done < _ref/list', 'cp notes.md .', 'mkdir build',
    'git checkout main', 'find _ref -name "*.md"']) assert.equal(run(c), 'allow', c)
})

test('an unreadable profile still lets the session repair it', () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, '.devflow.json'), '{ broken')
  const edit = file => decision(hook.handle(event('PreToolUse', d, { tool_name: 'Edit', tool_input: { file_path: path.join(d, file) } }))) || 'allow'
  assert.equal(edit('.devflow.json'), 'allow')
  assert.equal(edit('src.md'), 'deny')
  assert.equal(decision(hook.handle(pre(d, 'cat < _ref/x.md'))) || 'allow', 'allow')
  assert.equal(decision(hook.handle(pre(d, 'gh issue close 1'))), 'deny', 'Issue writes are still checked')
})

test('an option value before -c does not hide the script (2026-10-01 re-review regression)', () => {
  for (const c of ['pwsh -ep Bypass -c "gh issue close 1"', 'pwsh -wd . -c "gh issue close 1"', 'bash -O extglob -c "gh issue close 1"',
    'bash --rcfile x -c "gh issue close 1"', 'pwsh -ExecutionPolicy Bypass -File nope.ps1 -Command "gh issue close 1"']) {
    assert.ok(check(c), c)
  }
})

// Issue #6: blocks are logged to the Issue of the branch; the real repository's log must not change under the suite.
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=',
    '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8', env: cleanEnv() })
  assert.equal(r.status, 0, r.stderr)
}
function gitRepo(branch, profile = { protected: ['_ref/**'] }) {
  const d = fs.realpathSync.native(tmpdir('devflow-hookgit-'))
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify(profile))
  git(d, 'init', '-q')
  git(d, 'add', '.devflow.json')
  git(d, 'commit', '-q', '-m', 'a')
  if (branch !== 'main') git(d, 'switch', '-q', '-c', branch)
  return d
}
const guards = (root, n) => {
  const f = path.join(root, '.work', 'devflow', `i${n}`, 'guard-events.jsonl')
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).guard) : []
}

const repoLog = (() => {
  const r = spawnSync('git', ['branch', '--show-current'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' })
  const m = /^[^/]+\/(\d+)-/.exec((r.stdout || '').trim())
  return m ? path.join(__dirname, '..', '.work', 'devflow', `i${m[1]}`, 'guard-events.jsonl') : null
})()
const repoCount = () => (repoLog && fs.existsSync(repoLog) ? fs.readFileSync(repoLog, 'utf8').split('\n').filter(Boolean).length : 0)
let repoBefore = 0
test.before(() => { repoBefore = repoCount() })
test.after(() => assert.equal(repoCount(), repoBefore, 'the test suite wrote to the real guard log'))

test('locked tests are protected on both hosts while the Issue ledger says so, and only then (#20)', () => {
  const d = gitRepo('fix/7-x', { tests: ['tests/**'] })
  const ledgerFile = path.join(d, '.work', 'devflow', 'i7', 'ledger.json')
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true })
  const lock = on => fs.writeFileSync(ledgerFile, JSON.stringify(on ? { stage: 'build', testsLocked: { at: 'abc1234' } } : { stage: 'build' }))
  const edit = (tool, input) => hook.handle(event('PreToolUse', d, { tool_name: tool, tool_input: input }))
  const file = path.join(d, 'tests', 'a.test.js')
  const patch = '*** Begin Patch\n*** Update File: tests/a.test.js\n@@\n-x\n+y\n*** End Patch\n'
  lock(false)
  assert.equal(edit('Edit', { file_path: file }), '', 'unlocked: the reproduction test is written freely')
  lock(true)
  const reason = out => JSON.parse(out).hookSpecificOutput.permissionDecisionReason
  assert.match(reason(edit('Edit', { file_path: file })), /tests\/a\.test\.js is a test file, locked/)
  assert.equal(decision(edit('apply_patch', { command: patch })), 'deny')
  assert.equal(decision(hook.handle(pre(d, 'rm tests/a.test.js'))), 'deny')
  assert.equal(decision(hook.handle(pre(d, "sed -i 's/a/b/' tests/a.test.js"))), 'deny')
  assert.equal(hook.handle(pre(d, 'cat tests/a.test.js')), '', 'reading stays open')
  assert.equal(edit('Edit', { file_path: path.join(d, 'src', 'a.js') }), '', 'code stays open')
  assert.deepEqual(guards(d, 7), ['test-locked', 'test-locked', 'test-locked', 'test-locked'])
  // Review: the ledger itself is locked, a broken ledger counts as locked, and a deep write is the lock's block.
  assert.equal(decision(hook.handle(pre(d, 'echo x > .work/devflow/i7/ledger.json'))), 'deny')
  assert.equal(decision(hook.handle(pre(d, 'rm -rf .'))), 'deny')
  assert.match(JSON.parse(edit('Write', { file_path: ledgerFile })).hookSpecificOutput.permissionDecisionReason, /the Issue ledger is a test file, locked|locked/)
  fs.writeFileSync(ledgerFile, '{ broken')
  assert.equal(decision(edit('Edit', { file_path: file })), 'deny')
  assert.deepEqual(guards(d, 7).slice(4), ['test-locked', 'test-locked', 'test-locked', 'test-locked'])
  // From a linked worktree the ledger lies in the main work tree, outside the root; edit tools still may not touch it.
  fs.writeFileSync(ledgerFile, JSON.stringify({ stage: 'build', testsLocked: { at: 'abc1234' } }))
  git(d, 'add', '.devflow.json')
  const wt = path.join(path.dirname(d), path.basename(d) + '-wt')
  git(d, 'worktree', 'add', '-q', '-b', 'fix/7-wt', wt)
  const fromWt = hook.handle(event('PreToolUse', wt, { tool_name: 'Write', tool_input: { file_path: ledgerFile } }))
  assert.equal(decision(fromWt), 'deny')
  git(d, 'worktree', 'remove', '--force', wt)
  // A profile without tests globs turns the lock off, whatever the ledger says.
  fs.writeFileSync(path.join(d, '.devflow.json'), '{}')
  assert.equal(edit('Edit', { file_path: file }), '')
})

test('a write after a cd that surely moved the shell is judged in that folder (#53)', () => {
  const d = gitRepo('fix/7-x', { tests: ['tests/**'] })
  const ledgerFile = path.join(d, '.work', 'devflow', 'i7', 'ledger.json')
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true })
  fs.writeFileSync(ledgerFile, JSON.stringify({ stage: 'build', testsLocked: { at: 'abc1234' } }))
  // Another repository in the temp folder, as the #50 verifier used: its .devflow.json and tests are not this lock's.
  const other = path.join(path.dirname(d), path.basename(d) + '-other')
  fs.mkdirSync(other)
  const o = other.split(path.sep).join('/')
  const here = d.split(path.sep).join('/')
  const run = c => decision(hook.handle(pre(d, c)))
  for (const c of [
    `cd "${o}" && echo '{}' > .devflow.json`,
    `cd ${o} && printf x > .devflow.json && rm -f tests/a.test.js`,
    `(cd "${o}" && cat > .devflow.json <<'EOF'\n{}\nEOF\n)`,
    `Set-Location '${o}' && Set-Content .devflow.json x`,
    `cd "${o}" && bash -c "echo x > .devflow.json"`,
  ]) assert.equal(run(c), '', c)
  for (const c of [
    `cd "${o}"; echo x > .devflow.json`, // the cd may have failed
    `cd "${o}" || echo x > .devflow.json`,
    `true | cd "${o}" && echo x > .devflow.json`, // a cd in a pipeline runs in a subshell
    `(cd "${o}") && echo x > .devflow.json`,
    `timeout 5 cd "${o}" && echo x > .devflow.json`, // not the shell's own cd
    `cd "${o}" && cd "${here}" && rm tests/a.test.js`,
    `cd "${o}" && cd - && rm tests/a.test.js`,
    `cd "${o}" && popd && rm tests/a.test.js`,
    `cd "${o}" && eval "cd ${here}" && rm tests/a.test.js`,
    `cd "${o}" && bash -c "cd ${here} && rm tests/a.test.js"`,
    `cd "$X" && echo x > .devflow.json`,
    `cmd /c "cd ${o} && echo x > .devflow.json"`, // cmd does not change drives on cd
    'cd tests && rm a.test.js', // followed into the repository too
    'cd ./tests && rm a.test.js',
    `true || cd "${o}" && echo x > .devflow.json`, // the cd may be skipped
    // Review: a relative cd after one whose folder is unknown, and a cd that is no shell's own (2026-10-05).
    'cd -P tests && cd .. && rm tests/a.test.js',
    'builtin cd tests && cd .. && rm tests/a.test.js',
    'eval cd tests && cd .. && rm tests/a.test.js',
    'Set-Location -Path tests && Set-Location .. && Remove-Item tests/a.test.js',
    'cd -P tests && bash -c "cd .. && rm tests/a.test.js"',
    `cd() { :; }; cd "${o}" && echo x > .devflow.json`,
    `function Set-Location {}; Set-Location '${o}' && Set-Content .devflow.json x`,
    `sl "${o}" && echo x > .devflow.json`,
    `chdir "${o}" && echo x > .devflow.json`,
    // Re-review: definitions a sourced file or module makes, and a cd that is a program found by its path.
    `. ./defs.sh; cd "${o}" && echo x > .devflow.json`,
    `source ./defs.sh && cd "${o}" && echo x > .devflow.json`,
    `eval "$(cat defs)"; cd "${o}" && echo x > .devflow.json`,
    `enable -n cd; cd "${o}" && echo x > .devflow.json`,
    `Import-Module ./m.psm1; Set-Location '${o}' && Set-Content .devflow.json x`,
    `/usr/bin/cd "${o}" && echo x > .devflow.json`,
    `./cd "${o}" && echo x > .devflow.json`,
    // Second re-review: a PowerShell filter, a definition read in a substitution, bash's case, and a pattern the shell expands.
    `filter Set-Location { }; Set-Location '${o}' && Set-Content .devflow.json x`,
    `$(Import-Module ./m.psm1); Set-Location '${o}' && Set-Content .devflow.json x`,
    `CD "${o}" && echo x > .devflow.json`,
    `cd ${here.slice(0, -1)}[${here.slice(-1)}] && echo x > .devflow.json`,
    `cd ${here.slice(0, -1)}* && echo x > .devflow.json`,
  ]) assert.equal(run(c), 'deny', c)
  // Git Bash mounts /tmp on the user's temp folder, where this repository is; the hook cannot place it.
  if (process.platform === 'win32') {
    const msys = '/tmp/' + path.relative(path.dirname(tmpdir.root), d).split(path.sep).join('/')
    assert.equal(run(`cd ${msys} && rm tests/a.test.js`), 'deny')
  }
})

test('a block on an Issue branch is logged by a fixed id and the decision is unchanged', () => {
  const d = gitRepo('feat/7-x')
  const plain = dir(true)
  fs.writeFileSync(path.join(plain, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  const runs = [
    [cwd => hook.handle(pre(cwd, 'gh issue close 1')), 'issue-write'],
    [cwd => hook.handle(pre(cwd, 'rm _ref/x')), 'protected-path'],
    [cwd => hook.handle(event('PreToolUse', cwd, { tool_name: 'Edit', tool_input: { file_path: path.join(cwd, '_ref', 'x.md') } })), 'protected-path'],
  ]
  for (const [run, id] of runs) {
    const out = run(d)
    assert.equal(out, run(plain), 'same decision with and without a log')
    assert.equal(decision(out), 'deny')
    assert.equal(guards(d, 7).pop(), id)
  }
  assert.deepEqual(guards(d, 7), ['issue-write', 'protected-path', 'protected-path'])
  assert.doesNotMatch(fs.readFileSync(path.join(d, '.work/devflow/i7/guard-events.jsonl'), 'utf8'), /gh issue|_ref/)
  fs.writeFileSync(path.join(d, '.devflow.json'), '{ broken')
  assert.equal(decision(hook.handle(event('PreToolUse', d, { tool_name: 'Edit', tool_input: { file_path: path.join(d, 'src.md') } }))), 'deny')
  assert.equal(guards(d, 7).pop(), 'profile-unreadable')
})

test('blocks off an Issue branch, allowed calls and unreadable input are not logged', () => {
  const d = gitRepo('main')
  assert.equal(decision(hook.handle(pre(d, 'gh issue close 1'))), 'deny')
  assert.equal(fs.existsSync(path.join(d, '.work')), false)
  const f = gitRepo('feat/7-x')
  assert.equal(hook.handle(pre(f, 'npm test')), '')
  assert.equal(decision(hook.handle('{not json')), 'deny')
  assert.equal(fs.existsSync(path.join(f, '.work')), false)
})

test('a block in a worktree off the Issue branch is logged to the main work tree on the Issue branch (M3)', () => {
  const d = gitRepo('feat/7-x')
  const wt = path.join(d, '.claude', 'worktrees', 'task1')
  git(d, 'worktree', 'add', '-q', '-b', 'task-1', wt)
  assert.equal(decision(hook.handle(pre(wt, 'gh issue close 1'))), 'deny')
  assert.deepEqual(guards(d, 7), ['issue-write'])
  assert.equal(fs.existsSync(path.join(wt, '.work')), false)
})

test('a broken .git does not change the decision', () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  const expected = hook.handle(pre(d, 'gh issue close 1'))
  for (const content of ['gitdir: ' + path.join(d, 'nowhere'), 'garbage', '']) {
    fs.writeFileSync(path.join(d, '.git'), content)
    assert.equal(hook.handle(pre(d, 'gh issue close 1')), expected)
  }
  fs.rmSync(path.join(d, '.git'))
  fs.mkdirSync(path.join(d, '.git', 'HEAD'), { recursive: true })
  assert.equal(hook.handle(pre(d, 'gh issue close 1')), expected)
})

test('git metadata that is large, linked, special or on a network path is not read, and the decision is unchanged (2026-10-02 security review)', t => {
  const plain = dir(true)
  fs.writeFileSync(path.join(plain, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  const expected = hook.handle(pre(plain, 'gh issue close 1'))
  const make = gitdirValue => {
    const d = dir(true)
    fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
    fs.writeFileSync(path.join(d, '.git'), 'gitdir: ' + gitdirValue)
    return d
  }
  // A HEAD far larger than any real one.
  const big = tmpdir('devflow-big-')
  fs.writeFileSync(path.join(big, 'HEAD'), 'ref: refs/heads/feat/7-x\n' + 'x'.repeat(64 * 1024))
  const d1 = make(big)
  assert.equal(hook.handle(pre(d1, 'gh issue close 1')), expected)
  assert.equal(fs.existsSync(path.join(d1, '.work')), false)
  // Network paths are never opened: the call returns at once.
  const bs = String.fromCharCode(92)
  for (const unc of [bs + bs + 'devflow-no-such-host' + bs + 'share', '//devflow-no-such-host/share']) {
    const d = make(unc)
    const started = Date.now()
    assert.equal(hook.handle(pre(d, 'gh issue close 1')), expected)
    assert.ok(Date.now() - started < 5000, unc)
  }
  // A HEAD that is a link is not followed.
  const linked = tmpdir('devflow-lnk-')
  fs.writeFileSync(path.join(big, 'small-head'), 'ref: refs/heads/feat/7-x\n')
  try { fs.symlinkSync(path.join(big, 'small-head'), path.join(linked, 'HEAD')) } catch { return t.skip('file symlinks need privileges here') }
  const d2 = make(linked)
  assert.equal(hook.handle(pre(d2, 'gh issue close 1')), expected)
  assert.equal(fs.existsSync(path.join(d2, '.work')), false)
})

// Issue #14: the Issue folder lives in the main work tree, so a worktree anywhere logs there, once git's own records
// prove it belongs to that repository (the 2026-10-02 security review kept outside worktrees out for want of a proof).
const sibling = () => fs.realpathSync.native(tmpdir('devflow-sib-')) + '-wt'
test('a worktree outside the main work tree, proven by git, logs to the main one (#14)', () => {
  const d = gitRepo('feat/7-x')
  const task = sibling()
  git(d, 'worktree', 'add', '-q', '-b', 'task-2', task)
  assert.equal(decision(hook.handle(pre(task, 'gh issue close 1'))), 'deny')
  assert.deepEqual(guards(d, 7), ['issue-write'], 'a task branch logs under the main tree Issue')
  const own = sibling()
  git(d, 'worktree', 'add', '-q', '-b', 'fix/7-wt', own)
  hook.handle(pre(own, 'gh issue close 1'))
  assert.deepEqual(guards(d, 7), ['issue-write', 'issue-write'], 'its own Issue branch logs there too')
  assert.equal(fs.existsSync(path.join(own, '.work')), false)
  const rel = sibling()
  git(d, 'worktree', 'add', '-q', '--relative-paths', '-b', 'fix/7-rel', rel)
  hook.handle(pre(rel, 'gh issue close 1'))
  assert.deepEqual(guards(d, 7).length, 3, 'a worktree made with relative paths is proven too')
})

test('a .git file that only claims a repository does not log into it (#14)', () => {
  const victim = gitRepo('feat/7-x')
  // An extracted archive: its own gitdir, pointed at the victim's common dir, with a back link to itself.
  const x = fs.realpathSync.native(tmpdir('devflow-forged-'))
  fs.writeFileSync(path.join(x, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  fs.mkdirSync(path.join(x, 'wt'))
  fs.writeFileSync(path.join(x, '.git'), 'gitdir: wt\n')
  fs.writeFileSync(path.join(x, 'wt', 'commondir'), path.join(victim, '.git') + '\n')
  fs.writeFileSync(path.join(x, 'wt', 'gitdir'), '../.git\n')
  fs.writeFileSync(path.join(x, 'wt', 'HEAD'), 'ref: refs/heads/feat/99-y\n')
  assert.equal(decision(hook.handle(pre(x, 'gh issue close 1'))), 'deny')
  assert.deepEqual(guards(victim, 99), [])
  assert.deepEqual(guards(victim, 7), [])
  // Pointed at a real worktree's gitdir in the victim: the back link there names that worktree, not this folder.
  const real = sibling()
  git(victim, 'worktree', 'add', '-q', '-b', 'fix/7-real', real)
  const y = fs.realpathSync.native(tmpdir('devflow-forged-'))
  fs.writeFileSync(path.join(y, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  fs.writeFileSync(path.join(y, '.git'), `gitdir: ${path.join(victim, '.git', 'worktrees', path.basename(real))}\n`)
  hook.handle(pre(y, 'gh issue close 1'))
  assert.deepEqual(guards(victim, 7), [], 'a gitdir whose back link names another worktree')
})

test('a crafted commondir on a network path is never opened (#14 security review)', () => {
  const x = fs.realpathSync.native(tmpdir('devflow-forged-'))
  fs.writeFileSync(path.join(x, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  const expected = hook.handle(pre(x, 'gh issue close 1'))
  fs.mkdirSync(path.join(x, 'wt'))
  fs.writeFileSync(path.join(x, '.git'), 'gitdir: wt\n')
  const bs = String.fromCharCode(92)
  fs.writeFileSync(path.join(x, 'wt', 'commondir'), [bs + bs + 'devflow-no-such-host', 'share', '.git'].join(bs) + '\n')
  fs.writeFileSync(path.join(x, 'wt', 'gitdir'), '../.git\n')
  fs.writeFileSync(path.join(x, 'wt', 'HEAD'), 'ref: refs/heads/feat/7-y\n')
  // A name that does not resolve fails fast, so timing proves nothing: record every lookup of a network path instead.
  const seen = []
  const spy = name => { const real = fs[name]; fs[name] = (p, ...a) => { if (/^(\\\\|\/\/)/.test(String(p))) seen.push(name); return real(p, ...a) }; return () => { fs[name] = real } }
  const undo = ['lstatSync', 'statSync', 'openSync', 'readFileSync', 'existsSync'].map(spy)
  try {
    assert.equal(hook.handle(pre(x, 'gh issue close 1')), expected)
  } finally {
    undo.forEach(u => u())
  }
  assert.deepEqual(seen, [], 'no network path was looked up')
})

test('a main work tree with a commit without .devflow.json checked out still takes the log, as devflow-state decides (#14)', () => {
  const d = gitRepo('feat/7-x')
  const wt = sibling()
  git(d, 'worktree', 'add', '-q', '-b', 'fix/7-wt', wt)
  fs.rmSync(path.join(d, '.devflow.json'))
  hook.handle(pre(wt, 'gh issue close 1'))
  assert.deepEqual(guards(d, 7), ['issue-write'])
  assert.equal(fs.existsSync(path.join(wt, '.work')), false)
})

test('a separate git dir is no main work tree, even inside a devflow folder (#14)', () => {
  const base = fs.realpathSync.native(tmpdir('devflow-sep-'))
  fs.writeFileSync(path.join(base, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  git(base, 'init', '-q', '--separate-git-dir', path.join(base, 'gd'), 'main')
  const main = path.join(base, 'main')
  fs.writeFileSync(path.join(main, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  git(main, 'add', '.devflow.json')
  git(main, 'commit', '-q', '-m', 'a')
  const wt = sibling()
  git(main, 'worktree', 'add', '-q', '-b', 'fix/7-wt', wt)
  hook.handle(pre(wt, 'gh issue close 1'))
  assert.deepEqual(guards(base, 7), [], 'not the folder above the git dir')
  assert.deepEqual(guards(wt, 7), ['issue-write'], 'the worktree in hand, as before')
})

test('a folder link to a network path inside the gitdir is not followed (2026-10-02 re-review)', t => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  const expected = hook.handle(pre(d, 'gh issue close 1'))
  const bs = String.fromCharCode(92)
  const target = bs + bs + 'devflow-no-such-host' + bs + 'share'
  try { fs.symlinkSync(target, path.join(d, 'l'), 'dir') } catch { return t.skip('folder symlinks need privileges here') }
  // The real target must not be needed: lstat of the link itself is local, and its text names a network path.
  fs.writeFileSync(path.join(d, '.git'), 'gitdir: ' + path.join(d, 'l'))
  assert.equal(hook.handle(pre(d, 'gh issue close 1')), expected)
  assert.equal(hook.localPath(path.join(d, 'l', 'HEAD')), false)
  assert.equal(hook.localPath(path.join(d, '.devflow.json')), true)
})

test('a chain of links is judged by every link in it, up to a limit (#53)', t => {
  const d = dir(true)
  const bs = String.fromCharCode(92)
  const link = (name, to) => fs.symlinkSync(to, path.join(d, name), 'dir')
  try { link('net', bs + bs + 'devflow-no-such-host' + bs + 'share') } catch { return t.skip('folder symlinks need privileges here') }
  link('via', path.join(d, 'net'))
  link('rel', 'via')
  assert.equal(hook.localPath(path.join(d, 'via', 'HEAD')), false, 'a local link to a link to a share')
  assert.equal(hook.localPath(path.join(d, 'rel', 'HEAD')), false, 'the same through a relative link')
  link('l0', path.join(d, 'sub'))
  for (let i = 1; i <= 8; i++) link(`l${i}`, `l${i - 1}`)
  assert.equal(hook.localPath(path.join(d, 'l1', 'x')), true, 'a short local chain')
  assert.equal(hook.localPath(path.join(d, 'l8', 'x')), false, 'a chain past the limit counts as remote')
  // Review: each link counts once, however deep it sits under other relative links.
  fs.mkdirSync(path.join(d, 'R1', 'R2', 'R3', 'R4'), { recursive: true })
  link('N1', 'R1')
  link(path.join('R1', 'N2'), 'R2')
  link(path.join('R1', 'R2', 'N3'), 'R3')
  link(path.join('R1', 'R2', 'R3', 'N4'), 'R4')
  assert.equal(hook.localPath(path.join(d, 'N1', 'N2', 'N3', 'N4', 'x')), true, 'four nested relative links')
})

test('an unreadable profile applies the same repair exception to shell and edit writes', () => {
  const d = dir(true)
  const run = c => hook.handle(pre(d, c))
  for (const profile of ['{ broken', '{"protected":42}', 'null']) {
    fs.writeFileSync(path.join(d, '.devflow.json'), profile)
    for (const c of ['echo x > src.md', 'rm -rf .', 'cp src.md notes.md', 'bash -c "rm _ref/x"',
      'Set-Content notes.md x', 'echo x > .devflow.json; echo x > src.md']) {
      const out = run(c)
      assert.equal(decision(out), 'deny', c)
      assert.match(JSON.parse(out).hookSpecificOutput.permissionDecisionReason, /fix .devflow.json first/)
    }
    for (const c of ['cat < _ref/x', 'git status', 'echo "{}" > .devflow.json',
      'Set-Content .devflow.json "{}"', 'cp fixed.json .devflow.json']) assert.equal(run(c), '', c)
    assert.equal(hook.handle(event('PreToolUse', d, { tool_name: 'Edit', tool_input: { file_path: path.join(d, '.devflow.json') } })), '')
  }
})

test('large and non-regular profiles are unreadable without being opened', t => {
  const d = dir(true)
  const profile = path.join(d, '.devflow.json')
  const checkProfile = () => {
    assert.equal(decision(hook.handle(pre(d, 'echo x > src.md'))), 'deny')
    assert.equal(hook.handle(pre(d, 'echo "{}" > .devflow.json')), '')
    assert.equal(decision(hook.handle(pre(d, 'gh issue close 1'))), 'deny')
  }
  fs.writeFileSync(profile, '{}' + ' '.repeat(256 * 1024))
  checkProfile()
  fs.rmSync(profile)
  fs.mkdirSync(profile)
  checkProfile()
  fs.rmdirSync(profile)
  const target = path.join(d, 'linked.json')
  fs.writeFileSync(target, '{}')
  try { fs.symlinkSync(target, profile) } catch { return t.skip('file symlinks need privileges here') }
  checkProfile()
  fs.rmSync(target)
  checkProfile() // a broken link still identifies a devflow repository
})

test('the actual PreToolUse entry point denies analysis that runs past five seconds', () => {
  const d = gitRepo('fix/7-deadline')
  fs.writeFileSync(path.join(d, 'heavy.sh'), 'echo ok\n'.repeat(8000))
  const command = 'bash heavy.sh;'.repeat(15000) + 'gh issue close 1'
  const started = Date.now()
  const r = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main()', path.resolve(__dirname, '../hooks/devflow-hook.js')], {
    cwd: d, input: pre(d, command), encoding: 'utf8', timeout: 13000,
  })
  assert.equal(r.status, 0, 'the hook must finish before the host timeout')
  const out = JSON.parse(r.stdout)
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /5.second.*deadline/i)
  // The budget is the host's PreToolUse timeout (15 s) less a margin, not a speed target: a slow runner took 9.07 s (#33).
  assert.ok(Date.now() - started < 12000)
  assert.deepEqual(guards(d, 7), ['analysis-deadline'])
})

// The hook's stdin read once never returned on macOS and ran before every deadline (Issue #37): input that does not
// finish arriving must not hold the hook past the host's timeout.
function startHook(partial) {
  const { spawn } = require('child_process')
  const child = spawn(process.execPath, ['-e', 'require(process.argv[1]).main()', path.resolve(__dirname, '../hooks/devflow-hook.js')], { stdio: ['pipe', 'pipe', 'ignore'] })
  child.stdin.write(partial)
  const started = Date.now()
  return new Promise(resolve => {
    let out = ''
    child.stdout.on('data', d => { out += d })
    const kill = setTimeout(() => { child.kill('SIGKILL'); resolve({ out, ms: Date.now() - started, killed: true }) }, 9000)
    child.on('close', () => { clearTimeout(kill); resolve({ out, ms: Date.now() - started, killed: false }) })
  })
}

test('hook input that never finishes arriving is denied for a tool call within the input limit (#37)', async () => {
  const r = await startHook('{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"gh issue close 1"')
  assert.equal(r.killed, false, 'the hook ends on its own')
  assert.ok(r.ms < 6000, `took ${r.ms} ms`)
  assert.equal(JSON.parse(r.out).hookSpecificOutput.permissionDecision, 'deny')
})

test('stalled input that has not yet named its event is denied, failing closed (#37 review)', async () => {
  for (const partial of ['', '{"tool_name":"Bash","tool_input":{"command":"gh issue close 1"']) {
    const r = await startHook(partial)
    assert.equal(r.killed, false, JSON.stringify(partial))
    assert.equal(JSON.parse(r.out).hookSpecificOutput.permissionDecision, 'deny', JSON.stringify(partial))
  }
})

test('stalled input for another event ends with no output (#37)', async () => {
  const r = await startHook('{"hook_event_name":"SessionStart","cwd":"x"')
  assert.equal(r.killed, false)
  assert.equal(r.out, '')
})

test('a FIFO profile cannot hold the hook open', { skip: process.platform === 'win32' }, () => {
  const d = dir(true)
  const profile = path.join(d, '.devflow.json')
  fs.rmSync(profile)
  execFileSync('mkfifo', [profile])
  const r = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main()', path.resolve(__dirname, '../hooks/devflow-hook.js')], {
    cwd: d, input: pre(d, 'echo x > src.md'), encoding: 'utf8', timeout: 8000,
  })
  assert.equal(r.status, 0)
  assert.equal(decision(r.stdout), 'deny')
})

test('a FIFO ledger cannot hold the test-lock guard open; it counts as locked (#46)', { skip: process.platform === 'win32' }, () => {
  const d = gitRepo('fix/7-x', { tests: ['tests/**'] })
  const ledgerFile = path.join(d, '.work', 'devflow', 'i7', 'ledger.json')
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true })
  execFileSync('mkfifo', [ledgerFile])
  const input = event('PreToolUse', d, { tool_name: 'Edit', tool_input: { file_path: path.join(d, 'tests', 'a.test.js') } })
  const r = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main()', path.resolve(__dirname, '../hooks/devflow-hook.js')], {
    cwd: d, input, encoding: 'utf8', timeout: 8000,
  })
  assert.equal(r.signal, null, 'the hook did not answer before the timeout')
  assert.equal(decision(r.stdout), 'deny')
})

test('PowerShell content parameters cannot hide the actual write path', () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  const run = c => hook.handle(pre(d, c, 'PowerShell'))
  assert.equal(decision(run('Set-Content -Encoding utf8 _ref/x.md x')), 'deny')
  assert.equal(decision(run('Set-Content -Value x -Path _ref/x.md')), 'deny')
  fs.writeFileSync(path.join(d, '.devflow.json'), '{ broken')
  assert.equal(decision(run('Set-Content -Value .devflow.json src.md')), 'deny')
  assert.equal(run('Set-Content -Encoding utf8 .devflow.json "{}"'), '')
  assert.equal(run('Set-Content -Value "{}" .devflow.json'), '')
  assert.equal(run('Set-Content -LiteralPath .devflow.json -Value "{}"'), '')
})

// Issue #48: PowerShell and cmd separate paths with a backslash, which the Bash reading drops as an escape. Codex sends
// pwsh commands as Bash, so a path word is checked in both readings.
test('backslash paths count as paths: protected folders, locked tests and scripts (#48)', () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  for (const tool of ['PowerShell', 'Bash']) {
    for (const c of ['Remove-Item -Recurse .\\_ref\\docs', 'Set-Content _ref\\a.md x', 'Remove-Item -Recurse "_ref\\docs"',
      'Set-Content -Path .\\_ref\\a.md -Value x', 'rm -rf _ref\\docs', 'echo x > _ref\\a.md', 'Copy-Item a.md _ref\\a.md']) {
      assert.equal(decision(hook.handle(pre(d, c, tool))), 'deny', `${tool}: ${c}`)
    }
  }
  // The Bash reading still holds where no backslash path is protected.
  assert.equal(hook.handle(pre(d, 'rm -rf build\\ dir')), '')
  assert.equal(hook.handle(pre(d, 'echo a\\ b > out.txt')), '')
  fs.mkdirSync(path.join(d, 'scripts'))
  fs.writeFileSync(path.join(d, 'scripts', 'post.ps1'), 'gh issue close 1\n')
  assert.ok(check('& .\\scripts\\post.ps1', d))
  assert.ok(check('.\\scripts\\post.ps1', d))
  assert.ok(check('pwsh -File scripts\\post.ps1', d))
  const g = gitRepo('fix/7-x', { tests: ['tests/**'] })
  const ledger = path.join(g, '.work', 'devflow', 'i7', 'ledger.json')
  fs.mkdirSync(path.dirname(ledger), { recursive: true })
  fs.writeFileSync(ledger, JSON.stringify({ stage: 'build', testsLocked: { at: 'abc1234' } }))
  assert.equal(decision(hook.handle(pre(g, 'Set-Content tests\\a.test.js y', 'PowerShell'))), 'deny')
  assert.equal(decision(hook.handle(pre(g, 'Remove-Item .\\tests\\a.test.js'))), 'deny')
})

test('backslash paths inside a script handed to a shell, decoy scripts, and paths outside the root (#48 review)', () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ protected: ['_ref/**', '**/secret/**'] }))
  for (const tool of ['PowerShell', 'Bash']) {
    for (const c of ['pwsh -Command "Remove-Item -Recurse .\\_ref\\docs"', 'cmd /c del _ref\\a.md',
      'powershell -c "Set-Content _ref\\a.md x"', 'Invoke-Expression "Remove-Item .\\_ref\\a.md"']) {
      assert.equal(decision(hook.handle(pre(d, c, tool))), 'deny', `${tool}: ${c}`)
    }
  }
  fs.mkdirSync(path.join(d, 'scripts'))
  fs.writeFileSync(path.join(d, 'scripts', 'post.ps1'), 'gh issue close 1\n')
  fs.writeFileSync(path.join(d, 'scripts', 'post.cmd'), 'gh issue close 1\n')
  assert.ok(check('pwsh -c "& .\\scripts\\post.ps1"', d))
  assert.ok(check('powershell .\\scripts\\post.ps1', d))
  assert.ok(check('cmd /c .\\scripts\\post.cmd', d))
  // A file under the Bash reading's name must not hide the script the Windows reading names.
  for (const decoy of ['echo hi\n', '#!/usr/bin/python\nprint(1)\n']) {
    fs.writeFileSync(path.join(d, '.scriptspost.ps1'), decoy)
    assert.ok(check('& .\\scripts\\post.ps1', d), JSON.stringify(decoy))
  }
  // Another drive or a share is outside the repository, whatever the protected globs say. The drive is assembled so the
  // source holds no absolute path (doctor's local-path check).
  const drive = ['C', ':'].join('')
  // A drive letter with forward slashes names a drive only on Windows; elsewhere it is a relative path inside the
  // repository and stays checked.
  const outside = [`Copy-Item a.md ${drive}\\tmp\\secret\\a.md`, 'Remove-Item \\\\server\\share\\secret\\a.md',
    ...(process.platform === 'win32' ? [`Remove-Item ${drive}/tmp/secret/a.md`] : [])]
  for (const c of outside) assert.equal(hook.handle(pre(d, c, 'PowerShell')), '', c)
  assert.equal(decision(hook.handle(pre(d, 'Remove-Item .\\secret\\a.md', 'PowerShell'))), 'deny')
})

test('Windows spellings of a path inside the repository stay inside it, and shares are not read (#48 security review)', { skip: process.platform !== 'win32' }, () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  const inside = path.join(d, '_ref', 'a.md')
  for (const p of [`\\\\?\\${inside}`, `\\\\.\\${inside}`]) {
    assert.equal(decision(hook.handle(pre(d, `Remove-Item ${p}`, 'PowerShell'))), 'deny', p)
  }
  // The admin share holds a $, which the shell check counts as a word built at run time (ADR-0004); edit tools name the
  // file outright.
  for (const p of [`\\\\localhost\\${inside[0]}$${inside.slice(2)}`, `\\\\?\\UNC\\localhost\\${inside[0]}$${inside.slice(2)}`, `\\\\?\\${inside}`]) {
    assert.equal(decision(hook.handle(event('PreToolUse', d, { tool_name: 'Write', tool_input: { file_path: p } }))), 'deny', p)
  }
  // A script on a share is not opened to look inside it: opening it would reach the server (and offer it credentials).
  const seen = []
  const stat = fs.statSync
  fs.statSync = (p, ...a) => { seen.push(String(p)); return stat(p, ...a) }
  try {
    check('& \\\\nohost.devflow.invalid\\share\\x.ps1', d)
    check('pwsh -File \\\\nohost.devflow.invalid\\share\\x.ps1', d)
  } finally {
    fs.statSync = stat
  }
  assert.deepEqual(seen.filter(p => /^[\\/]{2}/.test(p)), [])
})

test('an entry-point deadline is logged to the input worktree even from a subfolder', () => {
  const parent = gitRepo('fix/8-other')
  const input = gitRepo('fix/7-deadline')
  const cwd = path.join(input, 'sub')
  fs.mkdirSync(cwd)
  fs.writeFileSync(path.join(input, 'heavy.sh'), 'echo ok\n'.repeat(8000))
  const r = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main()', path.resolve(__dirname, '../hooks/devflow-hook.js')], {
    // The host's limit for the hook (hooks.json): logging may use what is left of it (#53).
    cwd: parent, input: pre(cwd, 'bash ../heavy.sh;'.repeat(15000)), encoding: 'utf8', timeout: 15000,
  })
  assert.equal(r.status, 0)
  assert.equal(decision(r.stdout), 'deny')
  assert.deepEqual(guards(input, 7), ['analysis-deadline'])
  assert.deepEqual(guards(parent, 8), [])
})

test('a profile link to a device is not opened', t => {
  const d = dir(true)
  const profile = path.join(d, '.devflow.json')
  fs.rmSync(profile)
  try { fs.symlinkSync(process.platform === 'win32' ? 'NUL' : '/dev/zero', profile) }
  catch { return t.skip('file symlinks need privileges here') }
  const r = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main()', path.resolve(__dirname, '../hooks/devflow-hook.js')], {
    cwd: d, input: pre(d, 'echo x > src.md'), encoding: 'utf8', timeout: 8000,
  })
  assert.equal(r.status, 0)
  assert.equal(decision(r.stdout), 'deny')
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /fix .devflow.json first/)
})

test('profile replacement or growth at open cannot bypass the type and byte limits', async t => {
  for (const attack of ['link', 'same-inode-link', 'grow']) await t.test(attack, t => {
    const d = dir(true)
    const profile = path.join(d, '.devflow.json')
    const target = path.join(d, 'target.json')
    fs.writeFileSync(target, '{}')
    if (attack !== 'grow') {
      const probe = path.join(d, 'probe-link')
      try { fs.symlinkSync(target, probe) } catch { return t.skip('file symlinks need privileges here') }
      fs.unlinkSync(probe)
    }
    const open = fs.openSync
    let attempted = false, changed = false
    // Inject a real file change at the race boundary; opening, fstat and reading still use the native filesystem.
    fs.openSync = (p, ...args) => {
      if (p === profile && !attempted) {
        attempted = true
        if (attack === 'link') { fs.unlinkSync(profile); fs.symlinkSync(target, profile) }
        else if (attack === 'same-inode-link') { fs.unlinkSync(target); fs.renameSync(profile, target); fs.symlinkSync(target, profile) }
        else fs.appendFileSync(profile, ' '.repeat(256 * 1024))
        changed = true
      }
      return open(p, ...args)
    }
    try {
      assert.equal(decision(hook.handle(pre(d, 'echo x > src.md'))), 'deny', attack)
      assert.equal(changed, true, 'the race boundary was exercised')
    } finally { fs.openSync = open }
  })
})

test('non-object profile roots do not silently disable protection', () => {
  const d = dir(true)
  for (const profile of ['[]', '"x"', '42', 'true', '{"protected":false}', '{"protected":null}']) {
    fs.writeFileSync(path.join(d, '.devflow.json'), profile)
    assert.equal(decision(hook.handle(pre(d, 'echo x > src.md'))), 'deny', profile)
    assert.equal(hook.handle(pre(d, 'echo "{}" > .devflow.json')), '', profile)
  }
})

test('alias lookup consumes the remaining hook budget including profile inspection', () => {
  const d = dir(true)
  let timeout
  const env = { run: (cmd, args, opts) => { timeout = opts.timeout; return { code: 0, stdout: 'co: pr checkout\n' } } }
  assert.equal(hook.handle(pre(d, 'gh co 1'), env, performance.now() + 100), '')
  assert.ok(timeout > 0 && timeout <= 100)
})

// Issue #10: Claude's SessionStart hands its session id to the shell; SessionEnd drops the session from every Issue's
// recent writers. Codex has no CLAUDE_ENV_FILE (its shell has CODEX_THREAD_ID), and runs SessionEnd too (#42).
const hashOf = id => require('crypto').createHash('sha256').update(id).digest('hex').slice(0, 12)
const SID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'
const noGit = { run: () => ({ code: 1, stdout: '', stderr: '' }) }

test('SessionStart writes the session id to CLAUDE_ENV_FILE only in a devflow repository, for a well-formed id, outside Codex', () => {
  const envFile = path.join(tmpdir('devflow-envfile-'), 'env.sh')
  const start = (cwd, sid, vars) => hook.handle(event('SessionStart', cwd, { source: 'startup', session_id: sid }), { ...noGit, vars })
  start(dir(true), SID, { CLAUDE_ENV_FILE: envFile })
  assert.equal(fs.readFileSync(envFile, 'utf8'), `export DEVFLOW_SESSION_ID="${SID}"\n`)
  fs.rmSync(envFile)
  start(dir(true), 'x"; rm -rf ~; "', { CLAUDE_ENV_FILE: envFile })
  start(dir(false), SID, { CLAUDE_ENV_FILE: envFile })
  start(dir(true), SID, { CLAUDE_ENV_FILE: envFile, CODEX_THREAD_ID: 'c-1' })
  start(dir(true), SID, {})
  assert.ok(!fs.existsSync(envFile))
})

test('SessionEnd releases the session from every Issue folder and gives up fast on a held lock', () => {
  const root = dir(true)
  const other = hashOf('someone-else')
  const write = n => {
    const d = path.join(root, '.work', 'devflow', `i${n}`)
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'sessions.json'), JSON.stringify({ [hashOf(SID)]: { host: 'claude', at: Date.now() }, [other]: { host: 'codex', at: Date.now() } }))
    return path.join(d, 'sessions.json')
  }
  const [s1, s2] = [write(1), write(2)]
  fs.writeFileSync(path.join(path.dirname(s1), 'ledger.lock'), 'held')
  const t = Date.now()
  assert.equal(hook.handle(event('SessionEnd', path.join(root, 'sub'), { session_id: SID, reason: 'clear' }), noGit), '')
  assert.ok(Date.now() - t < 1000, 'well inside the 1.5 s SessionEnd budget')
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(s2, 'utf8'))), [other])
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(s1, 'utf8'))).length, 2, 'a held lock is left alone; 30 minutes clear it')
  assert.equal(hook.handle(event('SessionEnd', dir(false), { session_id: SID }), noGit), '')
})

test('SessionEnd in a worktree releases the session from the main work tree folders; Stop leaves a worktree ledger alone (#14)', () => {
  const d = gitRepo('feat/7-x')
  const wt = sibling()
  git(d, 'worktree', 'add', '-q', '-b', 'fix/7-wt', wt)
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
  const realGit = { vars: {}, run: (cmd, args, opts = {}) => {
    const r = spawnSync(cmd, args, { cwd: opts.cwd, encoding: 'utf8', env: cleanEnv, timeout: opts.timeout || 10000 })
    return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
  } }
  const folder = path.join(d, '.work', 'devflow', 'i7')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, 'sessions.json'), JSON.stringify({ [hashOf(SID)]: { host: 'claude', at: Date.now() } }))
  assert.equal(hook.handle(event('SessionEnd', wt, { session_id: SID }), realGit), '')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, 'sessions.json'), 'utf8')), {})
  // An autonomous ledger left in the worktree: Stop neither continues the work nor writes either ledger.
  const old = path.join(wt, '.work', 'devflow', 'i7')
  fs.mkdirSync(old, { recursive: true })
  const ledger = JSON.stringify({ mode: 'autonomous', stage: 'build', task: { current: 1, total: 2 } })
  fs.writeFileSync(path.join(old, 'ledger.json'), ledger)
  assert.equal(hook.handle(event('Stop', wt, { stop_hook_active: false }), realGit), '')
  assert.equal(fs.readFileSync(path.join(old, 'ledger.json'), 'utf8'), ledger)
  assert.equal(fs.existsSync(path.join(folder, 'ledger.json')), false)
})

test('SessionEnd lives in hooks.json, which both hosts read; no Claude-only hook file is left (#42)', () => {
  const shared = require('../hooks/hooks.json').hooks
  assert.equal(shared.SessionEnd.length, 1)
  // No matcher: Claude matches it on the end reason, Codex on its one reason "other".
  assert.equal(shared.SessionEnd[0].matcher, undefined)
  const { command, timeout } = shared.SessionEnd[0].hooks[0]
  assert.equal(command, shared.Stop[0].hooks[0].command)
  assert.ok(timeout <= 3, 'Codex caps SessionEnd at 3 s')
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'hooks', 'claude-hooks.json')), false)
  assert.equal('hooks' in require('../.claude-plugin/plugin.json'), false, 'Claude reads hooks/hooks.json by default')
  assert.equal(require('../.codex-plugin/plugin.json').hooks, './hooks/hooks.json')
})

test('SessionEnd in the Codex input shape releases the thread the session was recorded under (#42)', () => {
  // codex-rs/hooks/src/events/session_end.rs (rust-v0.160.0): session_id is the thread id, reason is always "other".
  const tid = '019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5b'
  const root = dir(true)
  const d = path.join(root, '.work', 'devflow', 'i3')
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, 'sessions.json'), JSON.stringify({ [hashOf(tid)]: { host: 'codex', at: Date.now() } }))
  const input = { session_id: tid, transcript_path: null, reason: 'other' }
  assert.equal(hook.handle(event('SessionEnd', root, input), noGit), '')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, 'sessions.json'), 'utf8')), {})
})

test('SessionStart passes the session id to the card, so its own writes are not warned about', () => {
  const root = dir(true)
  const d = path.join(root, '.work', 'devflow', 'i1')
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, 'sessions.json'), JSON.stringify({ [hashOf(SID)]: { host: 'claude', at: Date.now() } }))
  const gitEnv = { vars: {}, run: (cmd, args) => {
    const out = { 'rev-parse --show-toplevel': root, 'branch --show-current': 'feat/1-x', 'rev-parse --short HEAD': 'abc1234',
      'remote get-url origin': 'https://github.com/o/r.git' }[args.join(' ')]
    return out ? { code: 0, stdout: out + '\n', stderr: '' } : { code: 1, stdout: '', stderr: '' }
  } }
  const card = sid => JSON.parse(hook.handle(event('SessionStart', root, { source: 'resume', session_id: sid }), gitEnv)).hookSpecificOutput.additionalContext
  assert.doesNotMatch(card(SID), /another claude session/)
  assert.match(card('ffffffff-0000'), /another claude session/)
})

test('SessionEnd leaves a sessions file behind a linked Issue folder alone (2026-10-03 security review)', () => {
  const root = dir(true)
  const outside = tmpdir('devflow-out-')
  const body = JSON.stringify({ [hashOf(SID)]: { host: 'claude', at: Date.now() } })
  fs.writeFileSync(path.join(outside, 'sessions.json'), body)
  fs.mkdirSync(path.join(root, '.work', 'devflow'), { recursive: true })
  fs.symlinkSync(outside, path.join(root, '.work', 'devflow', 'i1'), 'junction')
  assert.equal(hook.handle(event('SessionEnd', root, { session_id: SID }), noGit), '')
  assert.equal(fs.readFileSync(path.join(outside, 'sessions.json'), 'utf8'), body)
})

// Issue #52: outside a devflow repository the hook does nothing, so it must not deny for its own reasons there either.
test('outside a devflow repository PreToolUse starts no analyzer and allows (#52)', () => {
  const d = dir(false)
  const r = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main()', path.resolve(__dirname, '../hooks/devflow-hook.js')], {
    cwd: d, input: pre(d, 'gh issue close 1'), encoding: 'utf8', timeout: 8000, env: { ...process.env, DEVFLOW_HOOK_TIMING: '1' },
  })
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), '')
  assert.doesNotMatch(r.stderr, /analyzer-start/)
})

test('late input from a project without devflow ends with no output; from a devflow project it is still denied (#52)', async () => {
  const head = (cwd, rest = '"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"gh issue close 1"') =>
    `{"session_id":"s","cwd":${JSON.stringify(cwd)},${rest}`
  const outside = await startHook(head(dir(false)))
  assert.equal(outside.killed, false)
  assert.equal(outside.out.trim(), '')
  assert.equal(decision((await startHook(head(dir(true)))).out.trim()), 'deny')
  // A cwd that appears only inside the tool input says nothing about where the session runs.
  const nested = `{"hook_event_name":"PreToolUse","tool_name":"mcp__x__y","tool_input":{"cwd":${JSON.stringify(dir(false))},"a":"`
  assert.equal(decision((await startHook(nested)).out.trim()), 'deny')
})

test('while tests are locked the profile is locked too, so dropping its tests key cannot lift the lock (#52)', () => {
  const g = gitRepo('fix/7-x', { tests: ['tests/**'] })
  const ledger = path.join(g, '.work', 'devflow', 'i7', 'ledger.json')
  fs.mkdirSync(path.dirname(ledger), { recursive: true })
  fs.writeFileSync(ledger, JSON.stringify({ stage: 'build', testsLocked: { at: 'abc1234' } }))
  const edit = file => hook.handle(event('PreToolUse', g, { tool_name: 'Edit', tool_input: { file_path: file } }))
  assert.equal(decision(edit(path.join(g, '.devflow.json'))), 'deny')
  assert.equal(decision(hook.handle(pre(g, 'echo {} > .devflow.json'))), 'deny')
  fs.writeFileSync(ledger, JSON.stringify({ stage: 'build' }))
  assert.equal(edit(path.join(g, '.devflow.json')), '', 'unlocked: the profile is editable')
})

// Issue #50: the command a test lock runs is checked like any other command.
test('the command after "devflow-state tests <n> lock --" is checked by the guard (#50)', () => {
  const d = dir(true)
  fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
  for (const lead of ['node bin/devflow-state', 'node "/plugin/bin/devflow-state"']) {
    assert.equal(decision(hook.handle(pre(d, `${lead} tests 1 lock -- rm -rf _ref/docs`))), 'deny', lead)
    assert.equal(hook.handle(pre(d, `${lead} tests 1 lock -- node --test tests/a.test.js`)), '', lead)
  }
  assert.ok(check('node bin/devflow-state tests 1 lock -- gh issue close 1', d))
  // Review: spellings the shell reads as the same words, and devflow-state named more than once.
  for (const cmd of [
    "node bin/devflow-state te''sts 1 lock -- rm -rf _ref/docs",
    'node bin/devflow-state tests 1 l\\ock -- rm -rf _ref/docs',
    'node -r ./bin/devflow-state bin/devflow-state tests 1 lock -- rm -rf _ref/docs',
    "node bin/devflow-st''ate tests 1 lock -- rm -rf _ref/docs",
  ]) assert.equal(decision(hook.handle(pre(d, cmd))), 'deny', cmd)
})

// Issue #50: a lock now carries its evidence; the hook still reads it as locked.
test('a lock with its failing evidence still protects the tests (#50)', () => {
  const d = gitRepo('fix/7-x', { tests: ['tests/**'] })
  const ledgerFile = path.join(d, '.work', 'devflow', 'i7', 'ledger.json')
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true })
  fs.writeFileSync(ledgerFile, JSON.stringify({ stage: 'build', testsLocked: { at: 'abc1234', failing: { command: 'node t.js', exit: 1 } } }))
  const out = hook.handle(event('PreToolUse', d, { tool_name: 'Edit', tool_input: { file_path: path.join(d, 'tests', 'a.test.js') } }))
  assert.match(JSON.parse(out).hookSpecificOutput.permissionDecisionReason, /locked/)
})
