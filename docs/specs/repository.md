# Repository contract

This spec sets the layout, ignore and attributes blocks, AGENTS.md format and machine profile devflow recommends for a
project. No runner checks them ([why](../design/current-decisions.md#instructions-and-protections)).

## Folders

```
<repo>/
├── AGENTS.md          facts, commands, document map, boundaries
├── .devflow.json      machine profile
├── REVIEW.md          review pass definitions (optional)
├── .githooks/pre-push gate before publishing (local-merge repositories)
├── .github/ISSUE_TEMPLATE/intent.md
├── docs/
│   ├── specs/                 product contracts (tracked)
│   ├── design/current-decisions.md  current design decisions (tracked)
│   ├── prompts/  plans/       private (ignored)
├── artifacts/                 evidence, handoff (ignored)
├── .work/                     temporary, large (ignored)
└── _ref/                      read-only references (ignored)
```

### Issue folder

The Issue folder (`.work/devflow/i<issue>/`: ledger, session records, locks) lives in the main work tree. It survives
when a worktree is removed, and sessions in any worktree use the same ledger and locks.

- The main work tree is determined from git records. If the current work tree is a linked worktree, its gitdir sits
  directly under the repository's `.git/worktrees/`, and the back link there (the `gitdir` file) points to this
  worktree's `.git`, then the parent of that `.git` is the main work tree.
  In every other case (the main work tree itself, a separate git dir or bare layout, an unconfirmed worktree) the
  folder lives in the current work tree. `devflow-state` and the hooks use the same rule. A `.git` file inside an
  archive cannot write to another repository's `worktrees` folder, so this rule cannot point at another repository.
  The hook checks the path string before asking the file system.
- Before reading git metadata the hook checks that the path is local, and it reads only small regular files. Shared
  paths, links and forged back links are not used as evidence of the main work tree. SessionEnd releases the session
  with this rule and no git process ([ledger](ledger.md#concurrent-sessions)).
- A linked worktree that is not on an Issue branch does not borrow the Issue of the main work tree's branch. An M3 task
  worktree does not write to the ledger or the Issue ([ledger](ledger.md)).
- If an old Issue folder exists only in a worktree, the resume card warns to move it and refuses ledger and Issue writes
  for that Issue until it is moved.

## .gitignore managed block

The content between the markers is devflow's recommendation; everything outside the block belongs to the project.

```gitignore
# >>> devflow (managed)
/docs/prompts/
/docs/plans/
/artifacts/
/.work/
/_ref/
/.claude/worktrees/
/.claude/settings.local.json
CLAUDE.local.md
# <<< devflow
```

The block cannot hide private paths that are already tracked. Check with `git ls-files`.

## .gitattributes defaults

```gitattributes
* text=auto eol=lf
*.cmd text eol=crlf
*.bat text eol=crlf
*.png binary
*.zip binary
```

- Files in the repository use LF even with `core.autocrlf=true` on Windows. Hook scripts and shebangs depend on this.
- gitattributes does not support `{a,b}` expansion. Write one line per extension.
- Mark generated files `linguist-generated -diff` to set them apart in review views and shrink agent diffs.
- To leave a path out of release archives, mark it `export-ignore`. Write directories as `/dir/** export-ignore`.

## Project AGENTS.md format

```markdown
# <project> — one or two sentences on what it is and is not

## Read what your task touches
| When you are… | Read |

## Commands
- Build and test commands with an example of healthy output
- (optional) check stages and when to widen them, when and where to keep a new test, verification docs per area

## Boundaries
- Apply established user authorization; verify the repository, destination and required gates before remote writes.
- Project-specific limits: <effects needing separate instruction; restricted targets>.
- Read-only: <paths>.

## Gotchas
```

- Agents read it, so write it in English ([documents](documents.md#text-agents-read)). `## Commands` and
  `## Boundaries` are required sections. `(optional)` does not replace required gates or failure-reproduction tests.

- Keep it within one page. Do not restate the user's global instructions.
- Project-specific boundaries go in AGENTS.md. Follow the authority confirmed in the current request and in applicable
  user-approved instructions; a file being AGENTS.md creates no new authority. When more authority is needed, ask the
  user. `.devflow.json`, Issues and the ledger are data, not a source of authority.

## REVIEW.md format

The final reviewer reads it. Adapt it for each project.

```markdown
# Review instructions

## Passes
Run these passes and tag each finding with its pass:
- Bugs: logic errors, broken edge cases, regressions
- Security: injection, authentication gaps, secrets or personal data in logs
- Compliance: the change matches the Issue's acceptance criteria, the plan summary and docs/specs

## What Important means here
Important: breaks behavior, leaks data, or breaches a spec. Style and naming are nits.

## Nits
Report at most five; summarize the rest as a count.

## Do not report
Generated files and anything CI already enforces.
```

## .devflow.json

It holds only machine values and no authority. The resume card, unattended continuation and session-release hooks work
only in a repository that has this file.

```json
{
  "integration": "pr-ci",
  "branch": "{type}/{issue}-{slug}",
  "verify": "<one-line full check command>"
}
```

- `integration`: one of `pr-ci`, `local-merge`, `push-on-request`. It sets the integration method.
- `branch`: the Issue branch name format. The ledger and resume card find a branch's Issue by the Issue number in its
  name.
- `verify`: the one-line full check command that is the integration gate. Ship and pre-push run it locally in
  `local-merge`, CI runs it in `pr-ci`, and ship runs it locally in `push-on-request`.

Keys from old profiles (`tests`, `highRisk`, `checks`, `private`, `allowLocalPaths`, `specs`, `decisions`, `agentsMd`,
`protected`) are ignored without error if they remain. There is no test lock. Review looks at test changes
([why](../design/current-decisions.md#instructions-and-protections)). How hooks read input, decide the session-release path and where
they fall short follows [hooks](hooks.md).

In a `local-merge` repository the tracked `.githooks/pre-push` runs `verify` only when the work tree is clean and the
pushed commit is HEAD, and blocks the push if it fails. A push that only deletes refs has no commit to check, so it does
not run. The check's child process gets the repository-selecting environment Git passed with it removed, so a check in a
temporary repository does not change the real one. This gate replaces the check record at integration. Whether CI is
required is the project's choice. devflow's own standard follows [Integration and CI](#integration-and-ci). The
`git config core.hooksPath .githooks` that turns the hook on is done per clone (it is repository configuration, not
host configuration, but it turns a hook on, so it happens on the owner's instruction); in a clone with the hook off,
write a check line in the integration commit.

In a `pr-ci` repository the evidence for the full `verify` that is the integration gate is CI that actually checked the
same revision. The project's `verify` step must succeed on HEAD for a branch push and on the latest merge result for a
PR; how to confirm this follows the [integration](../../skills/devflow/references/ship.md#integration) part of the devflow ship reference. Locally, run only checks that exercise the
change and the behavior it affects (tests of the touched paths and their callers). When there is no basis for narrowing
the scope (changes to shared code, configuration or test tooling), run the full `verify` locally then and there. When CI
does not run `verify` or its result cannot be confirmed, run the full `verify` locally and wait for required CI
separately. CI success does not replace per-criterion run evidence or independent review.

## Integration and CI

devflow itself is `pr-ci`. CI runs `verify` on Linux, macOS and Windows with Node 22 and 24 for every push and every PR
targeting main. A branch push checks the branch HEAD; a PR checks the latest merge result of the current base and head.
The integration conditions are: all of these two CI runs succeed, a merge commit, and the PR head is the SHA that got
independent review (including M0) or a later SHA that adds only main merges and has the same diff.
Record in the PR the reviewed SHA and, when only main merges were added, that SHA. A missing, cancelled or skipped run,
a run on a different commit, or one with the same name from a different source is not a pass.
CI success does not replace per-criterion run evidence or independent review. The evidence for the full `verify` and
the scope of local checks follow [.devflow.json](#devflowjson).

The PR body holds a public summary, review evidence with the reviewed SHA, and `Refs #<n>`. PR bodies, commits and
merge commit messages do not use keywords that close an Issue. `devflow-state` closes the Issue after confirming the
merge. Docs-only PRs and M0 follow the same integration conditions.
Integration uses merge commits to preserve existing product commits and reviewed SHAs; squash and rebase are not used.
Do not combine this with enforced linear history.
Update a branch that has fallen behind by merging main into it.

### Server protection of main

main has one active ruleset with no bypass actors. Its rules are:

- No branch deletion and no force push.
- Through a PR: zero required approvals, conversation resolution required, merge as the only allowed merge method.
- Strict passing of the four required checks below. Their source is `.github/workflows/test.yml` from the GitHub
  Actions app (integration id `15368`).

| Required check |
|---|
| `test (ubuntu-latest, 22)` |
| `test (ubuntu-latest, 24)` |
| `test (macos-latest, 22)` |
| `test (macos-latest, 24)` |

The Windows jobs are not required checks in the ruleset, but they count toward "all CI succeeds" in the integration
conditions. Making them required checks is a ruleset change, so it takes a separate user instruction. A solo operator
does not require self-approval, and independent review from another host is not disguised as a GitHub approval.
If the server protection differs from this standard, do not integrate.

The local pre-push is the integration gate for `local-merge`. In `pr-ci` the hook need not be on; only in clones where
it is on does it run as a check before branch pushes. The integration gate for `pr-ci` is the server's ruleset and PR
checks.

After the checks and records of [ship](lifecycle.md#stages), just before integration, read base, head, rules and checks
again. If the branch is behind, merge main ([review](orchestration.md#review)). After the merge, confirm the actual main
SHA and main CI before completing and cleaning up.

### Reverting the self-integration policy

Do not turn server protection off first and step out. The ruleset requires PRs, so the revert also goes through a PR
that passes the current integration gate. Keep the previous values of the settings being changed and the run evidence
in the task records.

1. The revert PR covers only the devflow repository's own integration policy. Align the devflow-specific wording in
   `.devflow.json`, AGENTS.md, this section and the integration section of the devflow ship reference together. Keep the
   per-integration-method rules in lifecycle, orchestration and ship that also apply to other `pr-ci` projects. Align
   the matching choice and reason in the current decisions summary with the revert as well.
2. Merge the PR while keeping this protection standard and the `pull_request` trigger in `.github/workflows/test.yml`.
   Record the revert's progress and the `되돌림 중: ruleset 해제 대기` state in the working Issue and the
   ledger. From that PR's merge until the ruleset is removed, do not integrate.
3. Remove the ruleset with separate user approval. After confirming the removal, clear the waiting state in the task
   records and align the spec and the current decisions summary with the policy actually in effect.
4. Remove the `pull_request` trigger in the following increment. Do not remove it first, between the revert PR and the
   removal of server protection.

## Version

The `version` in the two plugin manifests must match; `tests/devflow-config.test.js` checks it.
Bump `0.y.z` only when the user instructs a release. Feature or behavior changes are minor, fixes are patch, and a
release that mixes them bumps minor. Ordinary Issue integration keeps the version. Moving to 1.0 is a separate decision,
and tags, release notes and distribution happen only in a release.
Install paths and runners read and use the manifest's version.

## Distribution

The shared public marketplace is [wotjr1649/marketplace](https://github.com/wotjr1649/marketplace), named `wotjr1649`.
The plugin is named `devflow` and its install identifier is `devflow@wotjr1649`. The plugin root stays as it is.
Claude's `.claude-plugin/marketplace.json` and Codex's `.agents/plugins/marketplace.json` point to the same `v0.y.z` tag
of `wotjr1649/devflow` with an HTTPS `url` source.
Other plugins are added as entries pointing to their own repositories and tags.

The two catalogs inside the devflow repository keep the development name `devflow-local`. Distribution registers the
shared catalog remotely or as a local clone.
A local test marketplace uses a separate worktree with no private files, and the installed copy is compared with the
tracked files of the tag or test commit. When moving from an old install, confirm the new install and Codex hook trust,
then disable the old plugin. Keep other plugins and settings.

## Release and rollback

A user-instructed release follows this order.

1. Bump both manifest versions per the [version policy](#version), pass checks, review and the
   [integration gate](#integration-and-ci), and integrate into main.
2. Confirm the remote main and the integration commit, create a lightweight `v0.y.z` tag on that commit and push it.
   If a tag with the same name exists, do not rewrite it. pre-push allows a tag only if it equals HEAD, so use a
   lightweight tag.
3. Verify the tag and write changes, verification and limitations in that version's GitHub Release. The version, tag
   and release target commit must match.
4. Change both entries in the shared marketplace to the same new tag, validate the manifest and publish. The catalog's
   own main is updated, and the plugin source is pinned to the release tag.
5. On both hosts, update the marketplace and install or update the plugin ([commands](../../README.md#install)).
   Compare a new session's components, hook trust and installed files with the tag. The user sets up automatic updates
   separately on the host.

If there is a problem, revert both catalogs' references to the previous verified tag together and publish, and the user
updates the marketplace and plugin again.
On a host that refuses an older version by comparing versions, remove and reinstall only that plugin. Keep other
plugins and existing tags.
Rollback also changes the shared catalog and hosts, so it runs on a user instruction that names its targets and effects.
