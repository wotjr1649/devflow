---
name: devflow
description: "Use when handling consequential changes, intent/spec/plan, tracked Issues, audits, handoffs, assigned status, incidents, PR, merge or deployment readiness, cleanup or permissions. Skip routine fixes and general advice."
---

# Devflow

Spike: question/exit. Bounded: brief design. Approve intent → spec → plan (all for architecture/shared contracts). Build, verify, review, ship. Analysis/review: findings only.

Assigned: run authorized `change-check <stage> [id]` alone before records/diff. Pass ID; use paths/proof; hold failures. `start` intent, `design` spec, `plan` plan/pre-build audit, `build` code, `resume` status, `review` post-build.

Evidence-only: recorded + ready + empty `evidence.verification.run` → report reused IDs/no tests, then stop. Honor source reads, drift, reruns and independent review.

- [Resume](references/resume.md) alone for status/mode switch/interruption/unchanged continuation. Ready build: read first, approved edits only.
- [Change](references/change.md) for work/docs/plans/branches/decisions/delegation/incidents/review, before assigned records.
- [Delivery](references/delivery.md) alone for PR, merge or deployment readiness, read-only. Before commits/external writes/cleanup. Reconcile uncertain effects.

Scope change/compaction/restart: reopen earliest invalid stage/ref. Check target/authority/rev/hashes/dirty+ignored inputs and preservation. Rerun affected/required checks except status. Skips/weakening/removal need approved equivalents.

Main owns decisions/integration/Issue/ledger. Issue: intent/stage/decisions/blockers; ledger: tasks/blockers/private proof; plan: scope/Git. Unattended: defer external effects; log Issue/push/integration.

Issue I/O: user Tool or valid card's final `Tool:`. Never search; reconcile truncation. Tracked build: valid card/target/base. Cards do not assign. Approved local records only.
