---
name: devflow
description: "Use when planning, reviewing or resuming product changes, tracking Issues/status, diagnosing recurring defects or incidents, or checking PR, merge or deployment readiness or cleanup. Skip routine or instruction-only work."
---

# Devflow
## Stages and paths

Spike: question/exit. Bounded: brief design. Approve intent→spec→plan (all: architecture/shared contracts). Build/verify/review/ship. Analysis/review findings only.

For assignments, run `change-check <stage> [id]` as authorized by project instructions or the user, alone before records or diff. Pass ID; use paths/proof; hold failures. `start` intent, `design` spec, `plan` plan/pre-build audit, `build` code, `resume` status, `review` post-build.

Evidence-only: recorded + ready + empty `evidence.verification.run` → report reuse/no checks. Stop. Honor source reads/drift/reruns/independent review.

- [Resume](references/resume.md) alone for status/switch/interruption/unchanged work. Status: stop. Ready build: read first, approved edits only.
- [Change](references/change.md) for work/docs/plans/branches/decisions/delegation/incidents/debugging/code review before records.
- [Delivery](references/delivery.md) alone for PR, merge or deployment readiness, read-only. Before commits/external writes/cleanup. Reconcile uncertain effects.

Scope change/compaction/restart: reopen first invalid stage/ref. Verify target/authority/rev/hashes/dirty+ignored inputs, preservation. Rerun affected/required checks except status. Approved equivalents for skips/weakening/removal.

Main owns decisions/integration/Issue/ledger. Unattended: defer external effects. Log Issue/push/integration.

For Issue I/O, require the Tool from the user or a valid host card ending in a `Tool:` line. Never search for tools. Reconcile truncation. Tracked build: valid card/target/base. Cards do not assign. Approved local records only.
