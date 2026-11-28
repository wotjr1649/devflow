---
name: devflow
description: "Drafts, revises or audits change-specific intent.md, spec.md and plan.md, including shared contracts and plan-only requests. Use for complex changes, tracked Issue start, approved implementation or resumption, independent review, assigned or tracked status, CI or production incidents, PR, merge or deployment readiness, cleanup and permissions, excluding routine fixes and general advice."
---

# Devflow

## Stages and paths

Spike for feasibility. Short design for bounded work. Approve intent, design and plan for architecture or shared contracts. Build, verify, review and ship. Reopen the earliest invalidated stage.

For assignments, run `change-check <stage> [id]` as authorized by project instructions or the user, alone before records or diff. Use `start` for intent, `design` for spec, `plan` for pre-build document audit or plan edits, `build` for implementation, `resume` for status and `review` only after implementation. Pass requested ID. On failure hold dependent work. Use returned paths and evidence.

- For approved builds, read [Resume](references/resume.md) immediately after a ready `build` check when assigned, before records or edits. Edit only files allowed by the approved plan. Resume alone for read-only status and unchanged-scope continuation, interruption or mode switch.
- Read [Change](references/change.md) before document work, new work, planning, branch setup, material decisions, delegation, incident diagnosis or independent review. For assigned documents read it immediately after a ready check, before records. Cards do not assign work.
- [Delivery](references/delivery.md) alone for PR, merge or deployment readiness, read-only. For uncertain external effects and before authorized commits, tracker writes, publication, integration, deployment or cleanup.

Recheck the stage and reopen its reference after scope change, compaction or restart.

Verify changed and preserved behavior. Require approved equivalent coverage before skipping, removing or weakening checks. For tracked work, record stage changes, decisions and blockers in the Issue. Record task progress and proof in the ledger.

For Issue I/O, require the Tool from the user or a valid host card ending in a `Tool:` line. Never search for tools. Reconcile truncation. Hold tracked builds without a valid card, target or base. Use approved records for local work.
