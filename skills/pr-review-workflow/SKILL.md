---
name: pr-review-workflow
description: Use when preparing a PR, resolving its review findings, checking CI, merge or cleanup readiness, or completing the Issues it closes. Excludes a standalone review of a diff or PR, standalone implementation and releases.
---

# PR workflow

Requested phase only. Review-only ends with findings: no edits, posting, tracking completion or cleanup. Tags, releases and package publication are separate work.

Open supplied or linked paths directly, resolving links relative to their source. Discover unknown or failed paths,
since listings can omit ignored inputs.

Resolve root/changes/base/head/remote/project contracts; preserve unrelated work. Map PR/MR to platform. Use project checks/severity; campaign rules only when assigned. Absent rules: proportionate checks, stated uncertainty, no invented gates. Absent remote metadata: local drafts bound to available diff.

Reconcile fresh state before each mutation and preserve others' changes. Where authority is missing, prepare a reviewed draft naming the missing effect. Keep raw or private evidence out of what you publish. Read back state/links; reconcile uncertainty before retries, recording partial success without repeating it.

In a repository with `.devflow.json`, review/fixes reads [devflow review](../devflow/references/review.md) and
[common review](references/review.md) together; integration or tracking completion reads [ship](../devflow/references/ship.md)
and the common gates below for that phase. The devflow reference owns the sequence and does not call this skill back.
After compaction or a phase change, reopen the current phase's reference; an earlier read is not the current state.

The common gates below apply with and without `.devflow.json`; without it, no devflow card or ledger is required.

Common gates and procedures:
- Review/fixes: [review](references/review.md).
- PR preparation/integration: [integration](references/integration.md), [review](references/review.md) and [completion](references/completion.md), read together.
- Explicit tracking completion: [completion](references/completion.md).
- Cleanup, including merged branches and worktrees after a verified merge: [cleanup handoff](references/cleanup.md).

Report each phase once: identity, observed/unrun checks, findings, artifacts and next/pending steps; group shared evidence and limits.
