# Build

Done when every task in the plan (on the bounded path, the one change) is committed with the checks that execute it
passing, and the ledger holds the last commit and the next task. On an Issue-free spike, done is the throwaway
experiment and its evidence in chat; the Issue, ledger, commit and mode steps below apply only to tracked work.

## Before the first change of a task

- Work in the ledger's `runMode`. Needing another mode goes back to where it was picked: plan, or design on the
  bounded path.
- Record `base` (`git rev-parse HEAD`) in the ledger before the change or the delegation. Reviews read BASE..HEAD;
  `HEAD~1` drops the first commits of a multi-commit task.

## The change

- New behaviour: see its test fail before the change, or with the change reverted. A bug fix starts from a reproduction
  test that fails, and the fix leaves that test as it is. A test never seen failing proves nothing.
- Fix the code, not the test. Change a test only when the requirement changed or its expectation is wrong, and say
  which in the commit or the checkpoint, because review reads test changes for this.
- Run the checks that execute the change and the behaviour it affects: the project's tests for the paths touched and
  their callers. When nothing justifies a narrower set (shared code, configuration, test tooling), run the full
  `verify` locally now.
- The full `verify` that gates integration follows the integration profile. Under `pr-ci`, ship takes CI's `verify`
  success on the pushed revision as the evidence; when CI does not run `verify` or its result cannot be verified, run
  `verify` locally and still wait for required CI. Under `local-merge` and `push-on-request`, ship runs it locally.
- Syntax checks and checks that never started are not verification; name any check that could not run and why.
- A missing dependency the project already declares is installed with the project's package manager and lockfile, not
  with sudo or a system package manager.

## Delegating (M2, M3)

- The main session keeps decisions, Issue writes, integration and the ledger, so unstated choices of several writers do
  not collide. A subagent gets one task through a brief, in English, that starts `TASK k/N · Issue #i · BASE <sha>` and
  gives the goal, acceptance, files it may change, interfaces, constraints and the check with healthy output. It puts
  push, Issue writes, spawning subagents, deleting or weakening tests and adding dependencies out of scope, asks for one
  end status (`DONE`, `DONE_WITH_CONCERNS`, `NEEDS_DECISION`, `BLOCKED`) with files changed and checks run or not, and
  ends: keep working until done, stopping early only with `NEEDS_DECISION` or `BLOCKED`; once the checks pass, stop and
  report, with no extra rounds or changes outside the listed files.
- Delegate to `implementer`. Model and effort come from the router's Roles table: mechanical work runs on the
  definition's default, work that needs judgment across files on a stronger model; settle design decisions before
  delegating it. Report the model and effort a run used from its records, or unconfirmed.
- In interactive M2, the main session may make a one- or two-line edit describable in one sentence and record it in the
  ledger; a delegation costs more. Unattended work keeps a fresh context per task, so it has no such exception.
- In M2 and M3 each task gets a narrow review before the next starts: `reviewer` (Claude Code, with `model: sonnet`;
  Codex, the per-task review worker of the router's Roles table), given that task's BASE..HEAD. A mechanical change
  inside one file that touches no trust boundary skips it; the final review covers it. A change to a trust boundary gets one
  separate review with the security perspective.
- A subagent that ends with `NEEDS_DECISION` is resumed after the main session decides what lies within existing
  permissions and the brief (Claude Code: `SendMessage` to the same agent; Codex: a follow-up task to the same agent).
  Messages during its run are notifications; do not act on a guessed decision.

M3 (Claude Code only; files do not overlap and interfaces are fixed in the plan, two or three at once):

- Launch implementers in the background with the Agent tool's `isolation: "worktree"` on each call, never in the agent
  definition, which would put M2 in worktrees too.
- Record each launch with `running <n> add <label>`. Run `running <n> done <label>` only once the result is recovered and
  the exit confirmed; after a failure, timeout or interruption, confirm child processes and partial effects too, and if
  you cannot, leave the entry, continue only independent work and do not launch it again. Confirming an exit does not
  permit terminating it.
- A task worktree writes no ledger and posts no Issue text. Task worktrees start from the remote default branch, so a
  brief whose BASE is not on it begins with `git merge --ff-only <BASE>` in its worktree, and every M3 brief asks for a
  commit there.
- Merge one result at a time into the Issue branch (fast-forward, then cherry-pick) and run the checks the merged result
  affects after each merge. The task worktrees and their branches stay until cleanup.

## Failures

The fix loop separates finding a cause from fixing it, so fixes do not cover symptoms:

1. A check or CI failure with an unclear cause goes first to `explorer` with the root-cause perspective, which reports
   the cause and evidence without changing files. If it finds none, run it once more on a stronger model (Claude Code:
   `model: opus`).
2. The implementer fixes a task at most twice.
3. Then one promotion, one step to the promotion column of the router's Roles table, tried once.
4. Then the main session takes the task over or reports where it is blocked.

Record each fix attempt and each promotion as one ledger `notes` line with its reason; `counts` holds only the Stop
hook's `{continue}`. After three failures toward the same goal, change the approach or stop and report. A plan that
turns out wrong goes back to plan, fixed on the spot; a build that departs from the plan fixes the private plan before
the task ends and notes a changed public summary in the next checkpoint. A broken design assumption goes back to design.

## After the task

Commit, then `ledger-update` with `lastCommit` and `task`. The task moves to verify; after its verify the next task
starts here again, and after the last one verify covers every acceptance criterion.
