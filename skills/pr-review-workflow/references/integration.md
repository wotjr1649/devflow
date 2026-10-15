When drafting a PR, apply [review](review.md) and the project template: problem/outcome, scope/exclusions, acceptance/checks/limits, Issue/completed-subset links; leave remnants open. Integration requires evidence that review is complete; a readiness assessment checks that evidence and does not perform the review.

Follow project CI policy ([devflow](../../../docs/specs/repository.md#통합과-ci)). Required CI that is missing, stale, skipped or cancelled is NOT_VERIFIED; name the state you observed. Local checks/templates replace no required CI/protection/approval/thread gate. Zero checks: NOT_VERIFIED until local checks pass with PR evidence. No CI: pass documented local gate hook or record checks in PR/integration commit.

Bind CI to repo/workflow/run/attempt/event/base/head/checkout and synthetic/head/post-merge type; reject unrelated runs. Refresh base/head/rules/CI/approvals/threads; guard expected head or hold races. Merge by project method without bypass; verify result/required post-merge checks.

Devflow informational BASE..HEAD CI: skip optional push/wait; keep Issue-branch checks. After verified merge, [cleanup](cleanup.md).
