# Build

Done when every task in the plan (on the bounded path, the one change) is committed with the checks that execute it
passing, and the ledger holds the last commit and the next task.

## Before the first change of a task

- Work in the ledger's `runMode`, which ready picked (design, on the bounded path). Needing another mode means the plan
  was wrong: go back through plan and ready.
- Record `base` (`git rev-parse HEAD`) in the ledger. Reviews read BASE..HEAD; `HEAD~1` drops the first commits of a
  multi-commit task.

## The change

- New behaviour: see its test fail before the change, or with the change reverted. A bug fix starts from a
  reproduction test that fails, and the fix leaves that test as it is. A test never seen failing proves nothing.
  Where `.devflow.json` lists `tests`, commit the reproduction test and run `tests <issue> lock`; unlock only when
  the test itself is wrong, with the reason on stdin.
- Run the checks that execute the change: the `.devflow.json` `checks` entry for the paths touched, and `verify`
  before the work leaves build. Syntax checks and checks that never started are not verification; name any check
  that could not run and why.
- A missing dependency the project already declares is installed with the project's package manager and lockfile.

## Delegating (M2, M3)

In M2 and M3 each task gets a narrow review before the next starts: the `reviewer` with `model: sonnet`, given
that task's BASE..HEAD. A mechanical change inside one file outside `highRisk` skips it; the final review covers it.

M3 (Claude only) launches the implementers in the background with the Agent tool's `isolation: "worktree"` on each call,
never in the agent definition, which would put M2 in worktrees too. Those worktrees start from the remote default branch,
so a brief whose BASE is not on it begins with `git merge --ff-only <BASE>` in its worktree, and every brief asks for a
commit there. The main session merges one result at a time into the Issue branch (fast-forward, then cherry-pick), runs
the full checks after each merge. The worktrees and their branches stay until cleanup, after ship has measured the
cycle: removing a worktree removes its reflog, which the measurement reads. Creating these worktrees has
rewritten the shared `core.hooksPath` to an absolute path; doctor accepts that as the same gate.

The main session keeps decisions, Issue writes, integration and the ledger; a subagent gets one task through a brief
in the shape of [위임 지시서](../../../docs/specs/orchestration.md#위임-지시서). Models and effort come from
[모델과 effort](../../../docs/specs/orchestration.md#모델과-effort). A subagent that ends with `NEEDS_DECISION` is
resumed after the main session decides, as in [서브에이전트의 질문](../../../docs/specs/orchestration.md#서브에이전트의-질문).

## Failures

Follow [수정 루프](../../../docs/specs/orchestration.md#수정-루프): an unclear cause goes to diagnosis first, the
implementer fixes a task at most twice, then one promotion, then the main session takes it or reports the blocker.
Count them in the ledger's `counts` for the task and add a `notes` line with the reason. A plan that turns out wrong goes back to plan; a broken
design assumption goes back to design.

## After the task

Commit, then `ledger-update` with `lastCommit` and `task`. The task moves to verify; after its verify the next task
starts here again, and after the last one verify covers every acceptance criterion.
