# Integration

Apply [rules](../SKILL.md) and [review](review.md). When drafting a PR description, follow the project's template and link Issues/completed subsets, leaving remnants open.

Apply the target repository's distinction between required and informational CI. In a repository with `.devflow.json`,
devflow owns it in [repository](../../../docs/specs/repository.md#통합과-ci); otherwise use that project's supplied or observed policy.
The plugin's own repository contract establishes no target gate by itself.
Required CI/protection/approval/thread gates cannot be replaced by local tests/templates. Missing/stale/skipped/cancelled required runs are NOT_VERIFIED.
Zero reported checks do not prove that no CI is required; distinguish no configured CI from configured CI with no run.
Verify local checks against the current candidate and follow only recording requirements established for the target repository.
Missing evidence for an established required check or recording gate is NOT_VERIFIED; an unspecified recording rule creates no gate.
A local hook supplies a gate only when the target policy establishes its role.
Bind CI to repo/workflow/run/attempt/event/base/head/checkout and synthetic/head/post-merge type; refresh changed candidates, reject unrelated runs.

Pre-merge refresh base/head/rules/CI/approvals/threads; guard expected head or hold races. Use project merge method without bypass; verify resulting commit and required post-merge checks.

In a repository with `.devflow.json`, only when devflow's [integration rules](../../../docs/specs/repository.md#통합과-ci)
classify BASE..HEAD CI as informational, omit an optional task-branch push or CI completion wait. Required CI paths and other required gates
take precedence; keep the Issue-branch checks.

After a verified merge, follow the [cleanup handoff](cleanup.md); merged task branches and worktrees are removed, not only assessed. Review-only never enters cleanup.
