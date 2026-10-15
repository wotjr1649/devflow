---
name: pr-review-workflow
description: Use when preparing a PR, resolving its review findings, checking CI, merge or cleanup readiness, or completing the Issues it closes. Excludes a standalone review of a diff or PR, standalone implementation and releases.
---

# PR workflow

Requested phase only. Review-only ends with findings: no edits, posting, tracking completion or cleanup.

Resolve root/changes/base/head/remote/project contracts; preserve unrelated work. Map PR/MR to platform. Use project checks/severity; campaign rules only when assigned. Absent rules: proportionate checks, stated uncertainty, no invented gates. Absent remote metadata: local drafts bound to available diff.

Reconcile fresh state before each mutation. Where authority is missing, prepare a reviewed draft naming the missing effect. Keep raw or private evidence out of what you publish. Read back state/links; reconcile uncertainty before retries, recording partial success without repeating it.

Select references for the requested work:
- Review/fixes: [review](references/review.md).
- PR drafting: [integration](references/integration.md), [completion](references/completion.md).
- Integration or explicit tracking completion: [devflow ship](../devflow/references/ship.md) with `.devflow.json`; otherwise integration and completion for integration, completion alone for tracking.
- Cleanup, including merged branches/worktrees after verified merge: [cleanup handoff](references/cleanup.md).

After compaction or phase changes, reopen the current phase's reference.

Report identity, checks, findings, artifacts and next/pending steps per phase; each check, including your own assessment, on one line:
`<check>: kind <static|local|hosted>; method <command or how you read>; environment <host program>, <tool>; revision <rev>; result <outcome> (observed by me|supplied|unknown)`
Mark tracker states the same way. Say "not run by me" for checks you did not run and "not supplied" for evidence not given, never "never ran" or "does not exist". Quote any requirement you attribute. Name the action each prerequisite gates.
