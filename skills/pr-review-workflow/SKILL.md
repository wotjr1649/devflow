---
name: pr-review-workflow
description: Use when preparing a PR, resolving its review findings, checking CI, merge or cleanup readiness, or completing the Issues it closes. Excludes a standalone review of a diff or PR, standalone implementation and releases.
---

# PR workflow

Requested phase only; exclusions also bound readiness advice. Review-only ends with findings: no edits, posting, tracking completion or cleanup. Apply prerequisites only to the actions they gate.

Resolve root/changes/base/head/remote/project contracts; preserve unrelated work. Map PR/MR to platform. Use project checks/severity. Absent rules: proportionate checks, no invented gates.

Reconcile fresh state before each mutation and uncertainty before retries; without authority, prepare a reviewed draft naming the missing effect. Publish no raw or private evidence. Read back state/links, recording partial success without repeating it.

References (reopen after compaction or phase change):
- Review/fixes: [review](references/review.md).
- PR drafting: [integration](references/integration.md), [completion](references/completion.md).
- Integration or its readiness: [devflow ship](../../references/ship.md) with `.devflow.json`; otherwise integration plus completion. Tracking alone: completion.
- Cleanup, merged branches/worktrees too: [cleanup](references/cleanup.md).

Per phase, report identity, findings, artifacts, next/pending steps and each check on one line, every supplied state, not configured too; your own work is a check only in review:
`<check>: kind …; method …; environment …; revision …; result … (<provenance>)`
Every fact, opening and tracker state included, is observed by me (method), supplied (file/field) or unknown. Preserve supplied values; verify derived facts. Judge criteria by supplied check results, conflicts kept.
Missing input is "not supplied", a failed read "unreadable", your unrun check "not run by me"; none proves absence or another actor's history, or erases a recorded result. Say "not configured" only when supplied evidence states it for that component. Attribute only stated requirements, quoting exact source spans.
