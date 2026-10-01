---
name: development-start
description: Use when starting or resuming change work to align requirements, Issue tracking, and a dedicated branch/worktree. Excludes standalone reviews and release execution.
---

# Development start

Apply at task/scope/branch transitions. Analysis/review alone creates no Issue or branch.

Read the project contracts relevant to this task. Changes require an Issue; repository changes, including docs, require a dedicated branch. Reuse matching work, not one new Issue per branch. Use project base/naming/checks. Resolve material conflicts without discarding work.

At start/resume, reconcile the current request with the Issue: goal, every requirement, scope/exclusions, observable acceptance, validation, dependencies, and this PR's subset. Update on scope changes; compare again at PR handoff. Do not silently drop requirements or close a whole Issue for partial work.

- Read [tracking](references/tracking.md) to resolve/register the Issue.
- Read [workspace](references/workspace.md) before branch/worktree preparation.

Unverified Issue linkage blocks implementation; retain a sanitized draft and continue analysis. If only an update is pending, continue authorized local work within verified Issue scope; mark unmatched requirements pending. Do not reconfirm settled authority. Refresh state before mutation.

Return goal/acceptance, repository/Issue identity and branch/worktree association, root, base/head or non-Git artifact identity and freshness, completed/pending scope, preserved state, observed/unrun checks, and next covered action. Continue requested implementation when ready. PR preparation receives this record; merge/release gates remain outside this skill.
