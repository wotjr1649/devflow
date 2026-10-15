---
name: pr-review-workflow
description: Use when preparing a PR, resolving its review findings, checking CI, merge or cleanup readiness, or completing the Issues it closes. Excludes a standalone review of a diff or PR, standalone implementation and releases.
---

# PR workflow

Requested phase only. Review-only ends with findings: no edits, posting, tracking completion or cleanup. Tags, releases and package publication are separate work.

Resolve root/changes/base/head/remote/project contracts; preserve unrelated work. Map PR/MR to platform. Use project checks/severity; campaign rules only when assigned. Absent rules: proportionate checks, stated uncertainty, no invented gates. Absent remote metadata: local drafts bound to available diff.

Reconcile fresh state before each mutation. Where authority is missing, prepare a reviewed draft naming the missing effect. Keep raw or private evidence out of what you publish. Read back state/links; reconcile uncertainty before retries, recording partial success without repeating it.

Select references for the requested work:
- Review/fixes: [review](references/review.md).
- PR drafting: [integration](references/integration.md), [completion](references/completion.md).
- Integration or explicit tracking completion: [devflow ship](../devflow/references/ship.md) with `.devflow.json`; otherwise integration and completion for integration, completion alone for tracking.
- Cleanup, including merged branches/worktrees after verified merge: [cleanup handoff](references/cleanup.md).

After compaction or phase changes, reopen the current phase's reference; earlier reads are not current state.

Report identity, observed/unrun checks, findings, artifacts and next/pending steps separately for each phase. For every check, including your own assessment in this phase, report its kind (static, local or hosted), method (command, or how you read), environment (host program and tool), revision and result.
Mark each result or state as observed by you, supplied or unknown. Report missing evidence as missing or not supplied, never as not run or nonexistent. Attribute a requirement to a source only by citing its clause, and state prerequisites per action.
