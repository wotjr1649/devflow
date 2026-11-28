---
name: devflow
description: "Use when handling consequential changes, intent/spec/plan, tracked Issues, audits, handoffs, assigned status, incidents, PR, merge or deployment readiness, cleanup or permissions. Skip routine fixes and general advice."
---

# Devflow

## Stages and paths
Spike: question/exit. Bounded: brief design. Approve intent → spec → plan; all three for architecture/shared contracts. Build, verify, review, ship. Analysis/review: findings only.

For assignments, run `change-check <stage> [id]` as authorized by project instructions or the user, alone before records or diff. Pass ID; use its paths/proof. Hold on failure. `start` intent, `design` spec, `plan` plan/pre-build audit, `build` code, `resume` status, `review` after build.

For an assigned review limited to checking verification evidence, use the gate result directly. If `evidence.status` is `recorded`, `evidence.verification.status` is `ready` and `run` is empty, report the reused IDs and stop without reading references, records or inputs again. Known scope or environment changes, requested reruns and independent reviews follow normal routing.

- [Resume](references/resume.md) alone for status/mode switch/interruption/unchanged continuation. After ready build read first. Edit only approved files.
- [Change](references/change.md) for new work/docs/plans/branches/decisions/delegation/incidents/review, before assigned records.
- [Delivery](references/delivery.md) alone for PR, merge or deployment readiness, read-only. Before commits/external writes/cleanup; reconcile uncertain effects here.

On scope change/compaction/restart reopen earliest invalid stage/ref. Check target/authority/rev/hashes/dirty+ignored inputs. Verify changes/preservation. Rerun affected/required checks except status. Skip/weaken/remove only with approved equivalents.

Main owns decisions/integration/Issue/ledger. Issue: intent/stage/decisions/blockers; ledger: tasks/blockers/private proof; plan: scope/Git. Unattended: defer external effects; log Issue/push/integration.

For Issue I/O, require the Tool from the user or a valid host card ending in a `Tool:` line. Never search for tools. Reconcile truncation. Tracked build needs valid card/target/base; cards do not assign. Use approved local records.
