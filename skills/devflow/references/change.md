# Change

Done when proven.

## Start
Tracked: match Issue scope, pass baseline; verify repo/worktree/branch/BASE/use; bind ledger scope/checks; reread new (sub)Issues pre-retry.
## Design and plan
Issue intent/stage/decisions/blockers; ledger tasks/blockers/private proof.
`docs/changes/<id>/`: `plan.md` → `spec.md` → Issue/`intent.md`. Plan scope/Git/contracts/decisions/risks/deps/proof/test order. Edit assigned rev only. Independent read-only audit: contracts/architecture/complex plans/trust boundaries, trace requirements/preservation/regressions. Operator sets `auditRequired`/verdict/binding; HOLD: fix/reaudit/reapprove. Small unassigned: agree scope/checks; reuse note.
## Execution modes
| Mode | Work |
|---|---|
|M0|Simple, outside trust boundaries; keep contracts|
|M1|Default: main builds/checks, review|
|M2|Large/context-heavy/unattended: one worker|
|M3|Fixed contracts/disjoint writes; Claude `isolation: "worktree"` or serial|

Set `runMode`. M2/M3: review→integrate→joint check.
## Build and verify
`task {current,total}`/`base`/`lastCommit`: advance on proof+commit; current > total outside build/verify. Reopen/reset. Log cmd/rev/scope/result. Direct runs/targeted tests prove criteria; others stay open.
Repro. Failed fix/recurrence: trace read-only; test one cause pre-edit. 2 failed fixes/finding across sessions: stop edits; replan/design or hold. Rerun intact repro; rereview.
## Delegation
Claude `general-purpose`, Codex `fork_turns: "none"`; host defaults for model and effort unless the user overrides. English: role/task/Issue/BASE/scope/files/interfaces/ignored inputs/criteria/check/output. Delimit data. No publish/Issue writes/redelegate; deps/tests need approval.
`running <issue> add <label>` first. Tracked reads: `delegation-check before`/`after`, reuse retry token, no interim Git/ledger writes. Block failed/unknown precheck. Local drift/UNVERIFIED: void proof, hold Git/card. Remote diff/skip/unknown: hold proof/unattended.
M3: read-only ledger, ff to BASE only, return commit. Integrate singly after authority/base/interface/proof.
Implementer brief: edit only assigned files and run stated checks. ≤2 total fixes/delegation after first failure. `BLOCKED` if failing; out of scope: `NEEDS_DECISION`; else `DONE`/`DONE_WITH_CONCERNS`. Report attempts, executed proof and limits.
## Review
For independent read-only reviewers/M1+ verifiers: criteria/commands/base/diff/attempts/dirty+ignored inputs/contracts, no verdict. Check task acceptance and preservation of existing behavior and checks separately. Flag lost/weaker/disabled checks, caller/authority defects. Report location/impact/proof/limits.
## Learn
Diagnose. Link approved follow-up to intent/regression proof; log in tests/contracts.
