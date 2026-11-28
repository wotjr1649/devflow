---
name: devflow
description: "Use when working on consequential changes, intent/spec/plan, tracked Issues, audits, handoffs, assigned status, incidents, PR, merge or deployment readiness, cleanup or permissions. Skip routine fixes and general advice."
---

# Devflow

Spike feasibility, design bounded work, and approve intent, spec and plan for architecture or shared contracts. Build, verify, review and ship. Reopen the earliest invalidated stage.

For assignments, run `change-check <stage> [id]` as authorized by project instructions or the user, alone before records or diff. Pass the requested ID. Use `start` for intent, `design` for spec, `plan` for plan or pre-build audit, `build` for implementation, `resume` for status, and `review` after implementation. Hold dependent work on failure.

- [Resume](references/resume.md) alone for status, mode switch or unchanged continuation and immediately after a ready build before records or edits. Edit only approved files.
- [Change](references/change.md) before new work, documents, planning, branch setup, material decisions, delegation, incidents or independent review. For assigned documents read it immediately after a ready check. Cards do not assign work.
- [Delivery](references/delivery.md) alone for PR, merge or deployment readiness, read-only. Read before external writes, cleanup or reconciling uncertain effects.

Recheck the stage and its reference after scope change, compaction or restart. Verify changed and preserved behavior. Require approved equivalent coverage before weakening, skipping or removing checks. Record tracked stage, decisions and blockers in the Issue and progress/proof in the ledger.

For Issue I/O, require the Tool from the user or a valid host card ending in a `Tool:` line. Never search for tools. Reconcile truncation. Hold tracked builds without a valid card, target or base. Use approved local records.
