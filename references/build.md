# Build

On an Issue-free spike, finish with the throwaway experiment and its evidence in chat; the Issue, ledger,
commit and mode steps below apply only to tracked work.

Done when every task in the plan (on the bounded path, the one change) is committed with the checks that execute it
passing, and the ledger holds the last commit and the next task.

## Before the first change of a task

- Work in the ledger's `runMode`, which plan picked (design, on the bounded path). Needing another mode goes back to
  where it was picked: plan, or design on the bounded path.
- Record `base` (`git rev-parse HEAD`) in the ledger. Reviews read BASE..HEAD; `HEAD~1` drops the first commits of a
  multi-commit task.

## The change

- New behaviour: see its test fail before the change, or with the change reverted. A bug fix starts from a
  reproduction test that fails, and the fix leaves that test as it is. A test never seen failing proves nothing.
- Fix the code, not the test. Change a test only when the requirement changed or its expectation is wrong, and say which
  in the commit or the checkpoint: review reads test changes for this
  ([ADR-0031](../docs/design/decisions/ADR-0031-guidance-over-enforcement.md)).
- Run the checks that execute the change and the behaviour it affects - the project's tests for the paths touched and
  their callers. Widen to the full `verify` when nothing justifies a narrower set (shared code, configuration, test
  tooling). The full `verify` follows the integration profile ([.devflow.json](../docs/specs/repository.md#devflowjson)):
  under `pr-ci`, CI's success on the same revision is its evidence; otherwise run it before the work leaves build.
  Syntax checks and checks that never started are not verification; name any check that could not run and why.
- A missing dependency the project already declares is installed with the project's package manager and lockfile.

## Delegating (M2, M3)

In interactive M2, the main agent may make a one- or two-line edit describable in one sentence and record it in the
ledger; a new delegation costs more than the edit. Unattended work keeps a fresh context for every task
([execution modes](../docs/specs/orchestration.md#실행-모드)).

In M2 and M3 each task gets a narrow review before the next starts: the host-specific task-review role from
[roles](../docs/specs/orchestration.md#모델과-effort), given that task's BASE..HEAD. A mechanical change inside one file that touches no trust boundary skips it; the final review covers it.

M3 (Claude only) launches the implementers in the background with the Agent tool's `isolation: "worktree"` on each call,
never in the agent definition, which would put M2 in worktrees too. Record each launch with `running <n> add <label>` and
its end with `running <n> done <label>`; a task worktree writes no ledger and posts no Issue text. Those worktrees start from the remote default branch,
so a brief whose BASE is not on it begins with `git merge --ff-only <BASE>` in its worktree, and every brief asks for a
commit there. The main session merges one result at a time into the Issue branch (fast-forward, then cherry-pick), runs
the checks the merged result affects after each merge. The worktrees and their branches stay until cleanup.

The main session keeps decisions, Issue writes, integration and the ledger; a subagent gets one task through a brief
in the shape of [위임 지시서](../docs/specs/orchestration.md#위임-지시서). Models and effort come from
[모델과 effort](../docs/specs/orchestration.md#모델과-effort). A subagent that ends with `NEEDS_DECISION` is
resumed after the main session decides, as in [서브에이전트의 질문](../docs/specs/orchestration.md#서브에이전트의-질문).

## Failures

Follow [수정 루프](../docs/specs/orchestration.md#수정-루프): an unclear cause goes to diagnosis first, the
implementer fixes a task at most twice, then one promotion, then the main session takes it or reports the blocker.
Count them in the ledger's `counts` for the task and add a `notes` line with the reason. A plan that turns out wrong goes back to plan; a broken
design assumption goes back to design.

## After the task

Commit, then `ledger-update` with `lastCommit` and `task`. The task moves to verify; after its verify the next task
starts here again, and after the last one verify covers every acceptance criterion.
