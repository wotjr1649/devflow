# Build

**Exit:** the selected task's authorized edits are committed, real checks are recorded, and its next verify/review/acceptance action is explicit. A spike exits with findings in its throwaway scope, without tracked delivery or production completion claims.

**Input:** accepted design/plan, current task and attempt, task start head, delivery base, allowed files/interfaces, criteria revision and available inputs. Inspect actual HEAD and prior partial effects before editing or relaunching.

## Do

For new behavior show a failing test first or equivalent controlled before/after proof. For a bug reproduce the reported failure and retain its regression test. Do not weaken, skip or delete a failing test unless changed requirements or a demonstrably wrong expectation justify it; record the reason and resulting acceptance proof.

Implement within the task contract. Run affected tests and callers; use the full verification set when no defensible narrow set exists or shared code/config/tooling makes it necessary. Build/syntax-only results do not prove behavior. Install declared dependencies using project conventions/lockfiles; do not use sudo, change system setup, or bypass project hooks to hide missing prerequisites.

The coordinator owns decisions, Issue/ledger writes and integration. Before delegating, load delegation plus only the selected implementer role and host adapter. A complete draft brief can be produced even without a worker-launch tool. Launch only after the required execution identities/inputs and authority exist.

- **M0/M1:** main implements. M0 self-review is identified honestly; project-required independent review overrides it.
- **M2:** one task at a time. Verify, review where required, and accept its current result before starting any next task. An interactive coordinator may perform a truly tiny planned edit instead of delegation; record the exception. An unattended stretch uses fresh task workers to control context.
- **M3:** launch ready independent tasks together in verified-base worktrees. Review each returned result before selecting it for serial integration. After each integration, accept the task only with proof applicable to that integrated subject, and revalidate remaining results against the advancing head. Final delivery verification/review still covers all changes.

Mechanical single-file work without contract/trust effects may omit an extra task review when final review covers it and no project gate requires it. Trust-boundary changes receive a separate security perspective. Worker NEEDS_DECISION returns a concrete choice; the coordinator resolves in-grant choices or asks the user, then resumes that same task. Do not infer a decision from silence or a completion notification.

After edits, reconcile intended dirty changes and required inputs, commit within authority, and record the actual head and receipts through the supported helper. Task acceptance is separate from worker completion and from whole-delivery acceptance.

## Repairs

Recover a failed attempt's evidence and cause before trying again. Use focused root-cause exploration when needed. Allow two unsuccessful repairs for the same task, then at most one recorded promotion/escalation; if still unresolved, the coordinator changes the approach, takes over within scope, or records a blocker. Three failures at the same goal require an approach review, not another equivalent loop. Budgets persist across worker replacement, phase changes and resume; a new agent cannot reset them.

A running/interrupted worker is not safe to duplicate. Recover its result, establish exit including child processes and partial effects, and retain unknown activity until reconciled. Exit confirmation does not authorize termination.

**Return:** code/test defect → build; wrong task ordering/interface → plan; failed assumption → design; changed intent → start/discover. Record destination, reason, affected evidence and the retained attempt budget before continuing.
