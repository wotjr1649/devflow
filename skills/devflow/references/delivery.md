# Delivery

Done when destination proof/gap is logged.

## Readiness
Require review/preserved assertions/declared passes. Trusted CI: repo/workflow/run/attempt/event/checkout. Reject missing/foreign/cancelled/skipped/stale/weakened proof.
## Ship
Review versions/hashes/checks; independent M0 review. Mark proven criteria only. Publish reviewed secret-free summaries only; omit raw prompts/logs/private paths.

`local-merge`/`push-on-request`: local proof. `pr-ci`: refresh base/head/rules/CI/approvals/threads; verify hosted head/merge, guard head. Approved method only. Partial Issue open; reopen failures.

Prefer conditional writes; read back/log partial effects. Retry: prove exit and no effect/idempotency. Deploy: check artifact/env/health/rollback.
## Cleanup
Prove integration/identity/tip/owner/use/locks/submodules/staged+unstaged+untracked+ignored data. Keep protected/primary/active/uncertain targets and unique history/data; prove recovery. Readiness: list only. Recheck approved removal: normal worktree, branch `-d`, remote reviewed SHA only. No force/reset/clean/prune. Read back.
