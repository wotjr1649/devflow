# Change

Done when verified. Analysis and review end at findings.

## Discover
Compare options/evidence. Ask blockers. Define spike question/exit.

## Start
Tracked build needs authorized Issue Tool, repo/worktree/branch/BASE, occupancy and dirty/ignored checks. Read back Issue creation or sub-issue links before retry. Bind ledger scope/checks.

## Design and plan
Approve intent (Issue or assigned `intent.md`), then `spec.md`, then `plan.md`. In `docs/changes/<id>/`, link plan → spec → intent. Record contracts, decisions, risks, dependencies and proof. Order overlaps into verifiable slices. Edit assigned revision only. Before plan approval, independently audit contracts, architecture, complex plans and trust boundaries read-only. Operator sets `auditRequired` and records verdict/binding. Trace requirements, preserved behavior and regressions. Resolve HOLD, reaudit, reapprove before build. Small unassigned work uses agreed scope/checks and an existing note.

## Execution modes
| Mode | When |
|---|---|
| M0 | Simple edit preserving contracts, outside trust boundaries. |
| M1 | Default: main builds, verifies, gets review. |
| M2 | Large/context-heavy/unattended. One implementer. |
| M3 | Stable contracts, disjoint writes. Claude `isolation: "worktree"`; otherwise serial. |

Record `runMode`. Main owns decisions/Issue/ledger/integration. Review M2/M3 first; verify combined acceptance.

## Build and verify
Track `task {current,total}`, `base`, `lastCommit`. Advance after proof and commit. Outside build/verify current > total. Reopen/reset progress for fixes. Reproduce first. Log command/revision/scope/result. Rerun affected/required checks. Change approach on repeat failure.

## Delegation
Claude `general-purpose`, Codex `fork_turns: "none"`. Use host defaults for model and effort unless the user overrides. English brief: role, task, Issue, BASE, files/scope, interfaces, ignored inputs, criteria, check/output. Delimit data. No worker publication, Issue writes or redelegation. Require approval for dependency/test changes.

Reserve `running <issue> add <label>` before precheck. Tracked reads: `delegation-check before`/`after`, same token, no Git/ledger writes between. Failed/unknown precheck blocks launch. Local drift/UNVERIFIED voids result and holds Git/card. Remote change/skip/unknown holds proof and unattended work. Retry `after` with original token.

M3 workers leave Issue/ledger alone, fast-forward only to BASE, return task commit. Integrate singly after authority/base/interface/proof checks. Workers edit only assigned files and run stated checks. Report `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_DECISION` or `BLOCKED` with executed proof and limits.

## Review
Give independent read-only reviewers and M1+ verifiers criteria, commands, baseline/diff, dirty/ignored inputs and contracts. Omit author's verdict. Check task acceptance and preservation of existing behavior and checks separately. Flag lost behavior, weaker assertions and disabled checks. Check callers/authority. Add a focused review for high risk. Report location, impact, executed proof and limits. Reverify/rereview fixes.

## Learn
Diagnose. Link approved follow-up to intent and regression proof. Record lessons in owning tests/contracts.
