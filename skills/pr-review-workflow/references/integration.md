# Integration

Apply [rules](../SKILL.md) and [review](review.md). Project template: problem/outcome, scope/exclusions, acceptance/checks/limits; link Issues/completed subsets, leaving remnants open.

CI/protection/approval/thread gates cannot be replaced by local tests/templates; a missing/stale/skipped/cancelled run is NOT_VERIFIED. A repository with no CI configured records its checks by passing a documented local gate hook (such as a tracked pre-push that runs them); without such a hook, record the local checks in the PR or the integration commit. Bind CI to repo/workflow/run/attempt/event/base/head/checkout and synthetic/head/post-merge type; refresh changed candidates, reject unrelated runs.

Pre-merge refresh base/head/rules/CI/approvals/threads; guard expected head or hold races. Use project merge method without bypass; verify resulting commit and required post-merge checks.

After a verified merge, follow the [cleanup handoff](cleanup.md); merged task branches and worktrees are removed, not only assessed. Review-only never enters cleanup.
