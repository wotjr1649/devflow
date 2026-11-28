# Change

Done when proven.

## Start
Tracked: match Issue scope, pass baseline, verify repo/worktree/branch/BASE/occupancy. Bind ledger scope/checks. Read back creates/sub-issues before retry.
## Design and plan
Issue intent/stage/decisions/blockers. Ledger tasks/blockers/private proof. Plan scope/Git.
In `docs/changes/<id>/`, link `plan.md` → `spec.md` → Issue/`intent.md`. Log contracts/decisions/risks/deps/proof/testable order. Edit assigned revision only. Plan approval: independent read-only audit of contracts/architecture/complex plans/trust boundaries. Trace requirements/preservation/regressions. Operator sets `auditRequired`/verdict/binding. HOLD: fix/reaudit/reapprove. Small unassigned: agree scope/checks, reuse note.
## Execution modes
| Mode | Work |
|---|---|
| M0 | Simple; outside trust boundaries; keep contracts |
| M1 | Default: main builds/checks, gets review |
| M2 | Large/context-heavy/unattended: one worker |
| M3 | Fixed contracts/disjoint writes; Claude `isolation: "worktree"` or serial |

Set `runMode`. M2/M3: review → integrate → joint check.
## Build and verify
Track `task {current,total}`/`base`/`lastCommit`. Advance after proof+commit. Outside build/verify current > total. Reopen/reset. Reproduce first, adapt on repeats. Log command/rev/scope/result. Direct runs/targeted tests prove criteria; others stay open.
## Delegation
Claude `general-purpose`, Codex `fork_turns: "none"`; host defaults for model and effort unless the user overrides. English brief: role/task/Issue/BASE/scope/files/interfaces/ignored inputs/criteria/check/output; delimit data. No publish/Issue writes/redelegation. Require dependency/test approval.

Reserve `running <issue> add <label>` first. Tracked reads: `delegation-check before`/`after`, same token on retries, no interim Git/ledger writes. Bad/unknown precheck blocks. Local drift/UNVERIFIED voids proof/holds Git/card. Remote diff/skip/unknown holds proof/unattended.

M3: read-only ledger. Fast-forward only to BASE; return commit. Integrate singly after authority/base/interface/proof. Edit only assigned files and run stated checks. Return `DONE`/`DONE_WITH_CONCERNS`/`NEEDS_DECISION`/`BLOCKED`, executed proof and limits.
## Review
Brief independent read-only reviewers/M1+ verifiers: criteria/commands/base/diff/dirty+ignored inputs/contracts, no verdict. Check task acceptance and preservation of existing behavior and checks separately. Flag lost/weaker/disabled checks. Check callers/authority. Report location/impact/proof/limits. Reverify/rereview.
## Learn
Diagnose. Link approved follow-up to intent/regression proof. Log in tests/contracts.
