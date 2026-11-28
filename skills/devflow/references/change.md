# Change

Done when proven.

## Start
Tracked: match Issue scope, pass baseline, verify repo/worktree/branch/BASE/occupancy. Bind ledger scope/checks; read back creates/sub-issues before retry.
## Design and plan
Issue: intent/stage/decisions/blockers; ledger: tasks/blockers/private proof; plan: scope/Git.
`docs/changes/<id>/`: `plan.md` → `spec.md` → Issue/`intent.md`. Log contracts/decisions/risks/deps/proof/test order. Edit assigned revision only. Plan gate: independent read-only audit of contracts/architecture/complex plans/trust boundaries; trace requirements/preservation/regressions. Operator sets `auditRequired`/verdict/binding. HOLD: fix/reaudit/reapprove. Small unassigned: agree scope/checks; reuse note.
## Execution modes
| Mode | Work |
|---|---|
| M0 | Simple, outside trust boundaries; keep contracts |
| M1 | Default: main builds/checks, review |
| M2 | Large/context-heavy/unattended: one worker |
| M3 | Fixed contracts/disjoint writes; Claude `isolation: "worktree"` or serial |

Set `runMode`. M2/M3: review → integrate → joint check.
## Build and verify
`task {current,total}`/`base`/`lastCommit`: advance on proof+commit; current > total outside build/verify. Reopen/reset. Reproduce first; adapt on repeats. Log command/rev/scope/result. Direct runs/targeted tests prove criteria; others stay open.
## Delegation
Claude `general-purpose`, Codex `fork_turns: "none"`; host defaults for model and effort unless the user overrides. English brief: role/task/Issue/BASE/scope/files/interfaces/ignored inputs/criteria/check/output; delimit data. Ban publish/Issue writes/redelegation; require deps/test approval.

`running <issue> add <label>` first. Tracked reads: `delegation-check before`/`after`, same token on retry, no interim Git/ledger writes. Block bad/unknown precheck. Local drift/UNVERIFIED: void proof; hold Git/card. Remote diff/skip/unknown: hold proof/unattended.

M3: read-only ledger; fast-forward only to BASE; return commit. Integrate singly after authority/base/interface/proof.

Implementer brief: edit only assigned files and run stated checks. ≤2 fixes/check/delegation after first failure; then `BLOCKED` if failing. `DONE`/`DONE_WITH_CONCERNS`/`NEEDS_DECISION` as needed. Report attempts, executed proof and limits.
## Review
Brief independent read-only reviewers/M1+ verifiers: criteria/commands/base/diff/dirty+ignored inputs/contracts; no verdict. Check task acceptance and preservation of existing behavior and checks separately. Flag lost/weaker/disabled checks. Check callers/authority. Report location/impact/proof/limits. Reverify/rereview.
## Learn
Diagnose. Link approved follow-up to intent/regression proof. Log in tests/contracts.
