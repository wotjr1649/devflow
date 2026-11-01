# Running and testing a local development build

Codex and Claude Code test a commit from the same clean worktree. Codex copies those files into its install cache, and
Claude Code loads the folder directly with `--plugin-dir`. The test profiles for both hosts are prepared once and reused.
This guide assumes PowerShell 7 and the root of the repository's main work tree. Real Windows backend tests are run only
with PowerShell 7, and Windows PowerShell 5 is outside the verification scope.

## Locations and labels

| Target | Role | Loading method and label |
|---|---|---|
| Issue working branch, worktree | Code changes, checks, commits | Development work location |
| `.work/plugin-test/source` | Install source holding only the commit to verify | Detached worktree shared by both hosts |
| `.work/plugin-test/smoke` | Project for testing tool and hook behavior | Run location separate from the source |
| `.work/plugin-test/codex-home` | Codex test settings, authentication, cache | `devflow@devflow-local` installed |
| `.work/plugin-test/claude-home` | Claude test settings, authentication, history | Directly loaded `devflow@inline` |
| Everyday profile | Uses the released version | `devflow@wotjr1649` |

Code changes are made on the Issue working branch. `source` is kept as a copy of the commit under test, and tests that
can create session records or a ledger are done in `smoke`. Before changing the commit both hosts use, end the tests in
progress first.

`inline` is not a remote release label. With Claude's direct loading, `devflow @ inline` appears under Installed even
without registering a development marketplace. The `devflow@devflow-local` identifier is used only when marketplace
installation is chosen.
The manifest version can stay the same during development, so do not judge the source commit by the version number
alone.

## Opening a prepared environment

If the local launch scripts are prepared, run them from the root of the main work tree.

```powershell
& ./.work/plugin-test/start.ps1
& ./.work/plugin-test/start-claude.ps1
```

Each command opens a test session for its host, so run one at a time. These scripts are local files kept in the private
`.work` and are not included in a clone. If the files are missing, use the direct launch from the first-time setup
below.
If scripts already exist, check that they point to this test's profile, source and run location, and preserve the
user's changes.

| What to do | When to repeat |
|---|---|
| Prepare the worktree and profiles | Once, the first time |
| Log in | Once, the first time, and again when authentication is cleared and a new login is required |
| Review and trust Codex hooks | At first-time setup and when the host asks for a new review |
| Update the `source` commit | When testing another development commit |
| Reinstall the Codex cache | After updating `source` |
| Open a new test session | When checking the updated development build on the real host |

Keeping the same profile reuses the saved login and settings. Do not reset the login or hook trust for every test.
[Codex auth storage](https://learn.chatgpt.com/docs/auth#login-caching),
[Claude direct loading for development](https://code.claude.com/docs/en/plugins/create#load-a-plugin-for-one-session).

## First-time setup

Follow this procedure when the owner has instructed the creation and installation of that test environment. If an
environment already exists, do not recreate it; go on to the commit update in the next section. Why a worktree without
private files is used, and the distribution path, follow the [distribution contract](specs/repository.md#distribution).

Set the following variables in PowerShell. Put in `devflowRef` the full SHA of a commit that passed the repository
checks.

```powershell
$devflowTestRoot = Join-Path (Get-Location).Path '.work/plugin-test'
$devflowSource = Join-Path $devflowTestRoot 'source'
$devflowSmoke = Join-Path $devflowTestRoot 'smoke'
$devflowRef = '<full commit SHA to verify>'
```

For a new environment, prepare the source with `git worktree add --detach "$devflowSource" $devflowRef`, and create the
`codex-home`, `claude-home` and `smoke` folders outside the source. Prepare a separate Git repository and `.devflow.json`
in `smoke`.
A minimal profile example for session hook tests is `{}`. A minimal test project without a remote origin can test
session start and release, but does not verify the whole development cycle that uses GitHub Issues.

Do not put extra files such as `.work`, private plans or authentication files in `source`. Codex's local installation
can copy ignored files too. Do not copy authentication files from the existing everyday profile; log in from the test
profile.

### Installing and running Codex

The following block uses the test `CODEX_HOME` only in that PowerShell process and restores the previous value when it
ends.
Marketplace registration is done once, the first time, and `plugin add` is used for installation and later cache
updates.

```powershell
$devflowPreviousCodexHome = $env:CODEX_HOME
try {
    $env:CODEX_HOME = Join-Path $devflowTestRoot 'codex-home'
    codex plugin marketplace add "$devflowSource"
    if ($LASTEXITCODE -ne 0) { throw 'marketplace registration failed' }
    codex plugin add devflow@devflow-local
    if ($LASTEXITCODE -ne 0) { throw 'development build installation failed' }
    codex plugin list --marketplace devflow-local --json
    if ($LASTEXITCODE -ne 0) { throw 'install list check failed' }
    codex --no-daemon -C "$devflowSmoke"
} finally {
    $env:CODEX_HOME = $devflowPreviousCodexHome
}
```

If any command fails, do not go on to the next step. In the new session, log in and review and trust devflow's commands
in `/hooks`. After that, open the same profile with a local launch script such as `start.ps1`.
Check the current CLI's option support with `codex --help`.

### Running Claude Code directly

```powershell
$devflowPreviousClaudeHome = $env:CLAUDE_CONFIG_DIR
Push-Location -LiteralPath $devflowSmoke
try {
    $env:CLAUDE_CONFIG_DIR = Join-Path $devflowTestRoot 'claude-home'
    claude --plugin-dir "$devflowSource"
} finally {
    $env:CLAUDE_CONFIG_DIR = $devflowPreviousClaudeHome
    Pop-Location
}
```

Complete the new profile's login and the trust choices the host asks for. Under Installed in `/plugin`, check
`devflow @ inline`, `Enabled` and the expected components. This method does not need a separate registration and
installation of the `devflow-local` marketplace. After that, reuse a local launch script such as `start-claude.ps1`.

## Testing the next development commit

1. On the Issue working branch, run the checks that fit the change and commit the change to test. Integration gates
   follow [Integration and CI](specs/repository.md#integration-and-ci).
2. Set the variables above again and change `devflowRef` to this test commit. End the test sessions of both hosts.
3. Check `source` for tracked changes, untracked files and ignored files. If there is extra work, preserve it and find
   the cause before updating.

   ```powershell
   git -C "$devflowSource" status --short --untracked-files=all
   git -C "$devflowSource" ls-files --others --ignored --exclude-standard
   ```

4. Move only a clean source, where both outputs are empty, to this commit. If a command fails, do not proceed with
   installation.

   ```powershell
   git -C "$devflowSource" switch --detach $devflowRef
   if ($LASTEXITCODE -ne 0) { throw 'test commit update failed' }
   git -C "$devflowSource" rev-parse HEAD
   ```

5. For Codex, run `codex plugin add devflow@devflow-local` again under the test `CODEX_HOME` to update the cache.
   Use the profile setup and restore scope of the Codex block above, and skip the first-time marketplace registration
   command.
   Claude reads the same source on the next `--plugin-dir` run.
6. After checking the installed content and loading source, test the normal and failure paths of the changed feature in
   a new session.

Updating only `source` does not change Codex's already installed cache. Check `installedPath` in the reinstall result,
and compare the source SHA with the cache contents. Do not run the development `plugin add` in the everyday profile.

## Verifying installation and behavior

### Windows shell and read output

A terminal that opened the TUI being PowerShell 7 is not evidence that the model's tools chose the same shell.
In Codex's `exec_command`, set `shell` to the confirmed `pwsh.exe` path and `login=false` explicitly, and at the start of
the test check that `$PSVersionTable.PSVersion.Major` is `7`. A run whose child shell was not confirmed is not recorded
as PowerShell 7 verification.

UTF-8 decoding of files and encoding of command output are separate boundaries. On this machine, the Codex TUI was
observed printing broken Korean link anchors ([host observations](research/host-facts.md#codex)). Do not use broken
output as evidence of having read the original or as passing evidence in accuracy or efficiency comparisons. For paths
where non-ASCII output of file reads is not preserved, pass a JSON string as follows, and compare the decoded content
with the original.

```powershell
Get-Content -LiteralPath '<absolute path of the file to read>' -Raw -Encoding utf8 |
    ConvertTo-Json -Compress -EscapeHandling EscapeNonAscii
```

This method passed an explicit PowerShell 7 local comparison and an original-text comparison in the regular Codex
0.162.1 TUI (2026-10-14).
Do not replace the check in a new environment with console setting changes or sandbox or hook relaxation. In version
comparisons, apply the same reading conditions to both sides, and separate the effect of preparing those conditions
from the effect of the skill change.

### Files and loading source

From the main work tree, compare the cache path of the Codex installation result. The manifest `version` and the object
ids of the changed files must match the test commit.

```powershell
git rev-parse "$($devflowRef):hooks/devflow-hook.js"
git hash-object '<installedPath>/hooks/devflow-hook.js'
```

Also check that the cache has no private or unexpected files. The worktree's `.git` link file is not a tracked file but
can be included in a local folder copy.

Check Claude's loading state using the profile setup and restore scope of the Claude launch block above, replacing the
`claude` line with the following. Running only this command outside the block can also query the everyday profile's
settings.

```powershell
claude --plugin-dir "$devflowSource" plugin list
```

Check `devflow@inline`, the given source path and `loaded`. In the session, also check Installed and Errors in
`/plugin`. If only the remote `devflow@wotjr1649` was loaded, check the test session's profile and the `--plugin-dir`
argument again.

### Checks that fit the change

| Change | Needed checks |
|---|---|
| Docs, descriptions | Check links, commands, format and facts |
| Scripts, decision logic | Related tests, and a check that feeds synthetic input to the real hook command in the install cache |
| Skills, hook wiring, session handling | The checks above, plus checking real loading, the card, continuation count and session release in a new host session |
| Install and distribution paths | Comparing installed files and testing installation and updates on that path |

The synthetic input check covers the card, continuation and release of the three registered events. Input for removed
tool events must end without output.
If local check files already exist, first confirm that the expected SHA, cache version and inputs fit this test.
Checks that expect the behavior of the former blocking hook are not used as evidence of current behavior. Passing a
direct hook check and passing the full path where the host invokes the hook are separate evidence.

Run the final repository checks on the development working branch.

```powershell
node --test --test-timeout=120000 tests/*.test.js
```

The verification record holds the test commit, host versions, profile and loading source, the checks run and their
results, and the paths not run.
If only login and the plugin list were checked, do not record that hook behavior in real model conversations passed.
Public records do not include authentication information, local absolute paths or raw session content.

When testing the sub-issue feature, run the development build's `bin/devflow-state` with
`sub-issue add <parent> <child>` and `sub-issue list <parent>`, using parent and child numbers in an approved test
repository. Check rerunning the same link and the refusal of a different parent, and compare the parent and child bodies
and states before and after. Hooks block neither relations nor Issue text writes.
Going through `devflow-state` is an instruction, and direct calls do not get the CLI's public filter or the unattended
mode's write refusal.
In a new test session in each of Claude Code and Codex, check the source of the invoked script. Record the CLI automated
tests, real API writes and host execution paths separately, and do not let one replace another verification. The policy
and the handling of unconfirmed results follow [Issue I/O](specs/issues.md#issue-io). Create, link and clean up real
test targets only within the approved scope.

## Integration and distribution

Integration into `main` after testing a development build follows [Integration and CI](specs/repository.md#integration-and-ci).
Ordinary Issue integration and version changes are distinguished in the [version policy](specs/repository.md#version), and
when distributing, follow the order of tags, Release, common catalog and everyday-install verification in [Release and
rollback](specs/repository.md#release-and-rollback).
Running a development build per this guide is not an update of the everyday channel.
