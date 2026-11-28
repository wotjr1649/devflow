# Change

Done when verified. Analysis/review stop at findings.

## Discover
Weigh options/evidence; clarify blockers.
## Start
Tracked: verify repo/worktree/branch/BASE/occupancy; bind ledger scope/checks. Confirm Issue/sub-issue creation before retry.
## Design and plan
Link `plan.md` → `spec.md` → Issue/`intent.md` in `docs/changes/<id>/`. Log contracts/decisions/risks/deps/proof; order verifiable overlaps. Edit assigned revision only. Before plan approval audit independently, read-only: contracts/architecture/complex plans/trust boundaries. Trace requirements/preservation/regressions. Operator sets `auditRequired`/verdict/binding. HOLD: resolve, reaudit, reapprove before build. Small unassigned: agree scope/checks, reuse note.
## Execution modes
| Mode | Work |
|---|---|
| M0 | Simple, outside trust boundaries, contracts intact |
| M1 | Default: main builds/checks; get review |
| M2 | Large/context-heavy/unattended: one worker |
| M3 | Fixed contracts, disjoint writes; Claude `isolation: "worktree"` or serial |

Set `runMode`. M2/M3: review, integrate, verify joint acceptance.
## Build and verify
Track `task {current,total}`/`base`/`lastCommit`; advance on proof+commit, current > total outside build/verify. Reopen/reset fixes. Reproduce first; log command/revision/scope/result; adapt if repeated.
## Delegation
Claude `general-purpose`, Codex `fork_turns: "none"`; host defaults for model and effort unless the user overrides. English brief: role/task/Issue/BASE/scope/files/interfaces/ignored inputs/criteria/check/output; delimit data. No publish/Issue writes/redelegation; require dependency/test approval.

Before precheck reserve `running <issue> add <label>`. Tracked reads: `delegation-check before`/`after`; same token on retry, no Git/ledger writes between. Failed/unknown precheck blocks launch. Local drift/UNVERIFIED voids result, holds Git/card. Remote diff/skip/unknown holds proof/unattended.

M3: ledger read-only; fast-forward only to BASE; return commit. Integrate singly after authority/base/interface/proof. Workers edit only assigned files and run stated checks; report `DONE`/`DONE_WITH_CONCERNS`/`NEEDS_DECISION`/`BLOCKED`, executed proof and limits.
## Review
Brief independent read-only reviewers/M1+ verifiers: criteria/commands/base/diff/dirty+ignored inputs/contracts; omit verdict. Check task acceptance and preservation of existing behavior and checks separately. Flag losses/weaker or disabled checks. Check callers/authority; focus high risk. Report location/impact/proof/limits; reverify/rereview.
## Learn
Diagnose. Link approved follow-up to intent/regression proof; log lessons in tests/contracts.
