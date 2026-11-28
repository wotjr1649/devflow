# Change

Done when proven.

Weigh evidence/options; ask blockers.
## Start
Tracked: match Issue scope, pass baseline, verify repo/worktree/branch/BASE/occupancy. Bind ledger scope/checks; read back creation/sub-issues before retry.
## Design and plan
Link `plan.md` → `spec.md` → Issue/`intent.md` under `docs/changes/<id>/`. Log contracts/decisions/risks/deps/proof and testable order. Edit assigned revision only. Plan approval: independent read-only audit of contracts/architecture/complex plans/trust boundaries. Trace requirements/preservation/regressions. Operator sets `auditRequired`/verdict/binding. HOLD: fix/reaudit/reapprove. Small unassigned: agree scope/checks; reuse note.
## Execution modes
| Mode | Work |
|---|---|
| M0 | Simple; outside trust boundaries; keep contracts |
| M1 | Default: main builds/checks, gets review |
| M2 | Large/context-heavy/unattended: one worker |
| M3 | Fixed contracts/disjoint writes; Claude `isolation: "worktree"` or serial |

Set `runMode`. M2/M3: review → integrate → joint check.
## Build and verify
Track `task {current,total}`/`base`/`lastCommit`; advance after proof+commit. Outside build/verify current > total. Reopen/reset fixes; reproduce first, adapt on repeats. Log command/revision/scope/result. Direct runs/targeted tests prove criteria; others stay open.
## Delegation
Claude `general-purpose`, Codex `fork_turns: "none"`; host defaults for model and effort unless the user overrides. English brief: role/task/Issue/BASE/scope/files/interfaces/ignored inputs/criteria/check/output; delimit data. No publish/Issue writes/redelegation. Require dependency/test approval.

Reserve `running <issue> add <label>` first. Tracked reads: `delegation-check before`/`after`, same token on retries, no interim Git/ledger writes. Bad/unknown precheck blocks launch. Local drift/UNVERIFIED voids result/holds Git/card. Remote diff/skip/unknown holds proof/unattended.

M3: ledger read-only; fast-forward only to BASE, return commit. Integrate singly after authority/base/interface/proof. Workers edit only assigned files and run stated checks; report `DONE`/`DONE_WITH_CONCERNS`/`NEEDS_DECISION`/`BLOCKED`, executed proof and limits.
## Review
Brief independent read-only reviewers/M1+ verifiers: criteria/commands/base/diff/dirty+ignored inputs/contracts; no verdict. Check task acceptance and preservation of existing behavior and checks separately. Flag losses/weaker or disabled checks. Check callers/authority. Focus risks; report location/impact/proof/limits, reverify/rereview.
## Learn
Diagnose; link approved follow-up to intent/regression proof. Log lessons in tests/contracts.
