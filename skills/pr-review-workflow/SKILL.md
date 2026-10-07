---
name: pr-review-workflow
description: Use when preparing a PR, resolving its review findings, checking CI, merge or cleanup readiness, or completing the Issues it closes. Excludes a standalone review of a diff or PR, standalone implementation and releases.
---

# PR workflow

Requested phase only. Review-only ends with findings: no edits, posting, tracking completion or cleanup. Tags, releases and package publication are separate work.

Resolve root/changes/base/head/remote/project contracts; preserve unrelated work. Map PR/MR to platform. Use project checks/severity; campaign rules only when assigned. Absent rules: proportionate checks, stated uncertainty, no invented gates. Absent remote metadata: local drafts bound to available diff.

Reconcile fresh state before each mutation and preserve others' changes. Where authority is missing, prepare a reviewed draft naming the missing effect. Keep raw or private evidence out of what you publish. Read back state/links; reconcile uncertainty before retries, recording partial success without repeating it.

In a repository with `.devflow.json`, the requested phase selects the devflow procedure: review/fixes uses
[review](../devflow/references/review.md); integration or tracking completion uses [ship](../devflow/references/ship.md).
Read the selected reference for the sequence, then the common gates below as that phase needs them. The reference
does not call this skill back. Review-only ends with its findings; it does not enter ship or cleanup. After compaction
or a phase change, reopen the current phase's reference; an earlier read is not the current state.

Without `.devflow.json`, use the common procedure below; no devflow card or ledger is required.

Common gates and procedures:
- Review/fixes: [review](references/review.md).
- PR preparation/integration: [integration](references/integration.md).
- PR preparation/integration or explicit tracking completion: [completion](references/completion.md).
- Cleanup, including merged branches and worktrees after a verified merge: [cleanup handoff](references/cleanup.md).

Report identity, observed/unrun checks, findings, artifacts and next/pending steps separately for each phase.
