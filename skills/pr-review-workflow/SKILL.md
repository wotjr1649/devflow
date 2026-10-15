---
name: pr-review-workflow
description: Use when preparing a PR, resolving its review findings, checking CI, merge or cleanup readiness, or completing the Issues it closes. Excludes a standalone review of a diff or PR, standalone implementation and releases.
---

# PR workflow

Requested phase only. Review-only ends with findings: no edits, posting, tracking completion or cleanup.

Resolve root/changes/base/head/remote/project contracts; preserve unrelated work. Map PR/MR to platform. Use project checks/severity. Absent rules: proportionate checks, no invented gates.

Reconcile fresh state before each mutation; without authority, prepare a reviewed draft naming the missing effect. Publish no raw or private evidence. Read back state/links; reconcile uncertainty before retries, recording partial success without repeating it.

References by phase (reopen the current one after compaction or a phase change):
- Review/fixes: [review](references/review.md).
- PR drafting: [integration](references/integration.md), [completion](references/completion.md).
- Integration or explicit tracking completion: [devflow ship](../../references/ship.md) with `.devflow.json`; otherwise integration plus completion, or completion alone for tracking.
- Cleanup, merged branches/worktrees too: [cleanup](references/cleanup.md).

Report identity, findings, artifacts and next/pending steps per phase, and each check on one line; your own work is a check only in review:
`<check>: kind <kind>; method <method>; environment <environment>; revision <rev>; result <outcome> (observed by me|supplied|unknown)`
Copy supplied values as given; assert only what inputs or your reads show ("not supplied" for gaps, else "unknown"). Write "not run by me" for your unrun checks, never "never ran" or "does not exist". Attribute only requirements a source states, quoting it. Name the action each prerequisite gates.
