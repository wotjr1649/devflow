---
name: pr-review-workflow
description: Use when preparing a PR, resolving its review findings, checking CI, merge or cleanup readiness, or completing the Issues it closes. Excludes a standalone review of a diff or PR, standalone implementation and releases.
---

# PR workflow

Requested phase only; exclusions also bound readiness advice. Review-only ends with findings: no edits, posting, tracking completion or cleanup. Apply prerequisites only to the actions they gate.

Resolve root/changes/base/head/remote/project contracts; preserve unrelated work. Map PR/MR to platform. Use project checks/severity. Absent rules: proportionate checks, no invented gates.

Reconcile fresh state before each mutation; without authority, prepare a reviewed draft naming the missing effect. Publish no raw or private evidence. Read back state/links; reconcile uncertainty before retries, recording partial success without repeating it.

References by phase (reopen the current one after compaction or a phase change):
- Review/fixes: [review](references/review.md).
- PR drafting: [integration](references/integration.md), [completion](references/completion.md).
- Integration or its readiness: [devflow ship](../../references/ship.md) with `.devflow.json`; otherwise integration plus completion. Tracking alone: completion.
- Cleanup, merged branches/worktrees too: [cleanup](references/cleanup.md).

Report identity, findings, artifacts and next/pending steps per phase, and each check on one line, covering every supplied check state relevant to that phase (including not configured); your own work is a check only in review:
`<check>: kind <kind>; method <method>; environment <environment>; revision <rev>; result <outcome> (observed by me|supplied|unknown)`
Keep each fact with its provenance throughout the report, including the opening and tracker state: observed by me (method), supplied (source file/field), or unknown.
Preserve supplied values and use supplied check results when assessing criteria, retaining conflicts; "not run by me" does not erase a recorded result.

Report missing inputs as "not supplied" or "unknown", failed reads as "unreadable", and your unrun checks as "not run by me"; none establishes file absence or another actor's history. Report "not configured" only when supplied evidence establishes that status for the named component; an omitted field alone is not specified in the supplied configuration.

Attribute only stated requirements, quoting exact source spans including punctuation.
