---
name: pr-review-workflow
description: Use when preparing/reviewing PRs, resolving findings or checking merge/cleanup readiness. Excludes standalone implementation and releases.
---

# PR workflow

Requested phase only. Review-only ends with findings: no edits, posting, tracking completion or cleanup. Tags, releases and package publication are separate work.

Resolve root/changes/base/head/remote/project contracts; preserve unrelated work. Map PR/MR to platform. Use project checks/severity; campaign rules only when assigned. Absent rules: proportionate checks, stated uncertainty, no invented gates. Absent remote metadata: local drafts bound to available diff.

Reconcile fresh state before each mutation and preserve others' changes. Where authority is missing, prepare a reviewed draft naming the missing effect. Keep raw or private evidence out of what you publish. Read back state/links; reconcile uncertainty before retries, recording partial success without repeating it.

Read:
- Review/fixes: [review](references/review.md).
- PR preparation/integration: [integration](references/integration.md).
- PR preparation/integration or explicit tracking completion: [completion](references/completion.md).
- Cleanup, including merged branches and worktrees after a verified merge: [workspace-cleanup](../workspace-cleanup/SKILL.md). Unavailable: retain targets; report blocker, no install or improvised removal.

Report identity, observed/unrun checks, findings, artifacts and next/pending steps separately for each phase.
