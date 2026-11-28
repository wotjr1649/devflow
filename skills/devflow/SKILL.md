---
name: devflow
description: "Use when working on consequential changes, intent/spec/plan, tracked Issues, audits, handoffs, assigned status, incidents, PR, merge or deployment readiness, cleanup or permissions. Skip routine fixes and general advice."
---

# Devflow

## Stages and paths

Spike feasibility; briefly design bounded work. Approve intent/spec/plan for architecture or shared contracts. Build, verify, review, ship.

For assignments, run `change-check <stage> [id]` as authorized by project instructions or the user, alone before records or diff. Pass requested ID. Use returned paths/evidence. Use `start` for intent, `design` for spec, `plan` for plans/pre-build audit, `build` for implementation, `resume` for status, `review` after build. Hold dependent work on failure.

- [Resume](references/resume.md) alone for unchanged continuation, status, interruption or mode switch and immediately after a ready build before records or edits. Edit only approved files.
- [Change](references/change.md) before new work, documents, planning, branch setup, material decisions, delegation, incidents or independent review. For assigned documents read it immediately after a ready check. Cards do not assign work.
- [Delivery](references/delivery.md) alone for PR, merge or deployment readiness, read-only. Read before commits, external writes, cleanup or reconciling uncertain effects.

After scope change, compaction or restart, reopen the earliest invalidated stage and read its reference. Verify changed and preserved behavior. Require approved equivalent coverage to weaken, skip or remove checks. Track stage/decisions/blockers in the Issue, progress/proof in the ledger.

For Issue I/O, require the Tool from the user or a valid host card ending in a `Tool:` line. Never search for tools. Reconcile truncation. Hold tracked builds without a valid card, target or base. Use approved local records.
