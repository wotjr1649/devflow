# Delivery

Done when destination proof/gap is logged.

## Readiness
Require review/preserved assertions/declared passes. Trusted CI: repo/workflow/run/attempt/event/checkout. Reject missing/foreign/cancelled/skipped/stale/weakened proof.
## Ship
Reviewed versions/hashes/checks; independent M0 review. Mark proven criteria only. Publish reviewed secret-free summaries only; omit raw prompts/logs/private paths.

`local-merge`/`push-on-request`: local proof. `pr-ci`: refresh base/head/rules/CI/approvals/threads; prove hosted head/merge, guard head. Approved method only. Issue policy: partial open; reopen failures.

Prefer conditional writes; read back/log partial effects. Retry after proven exit/no effect or verified same-effect idempotency. Deploy: check artifact/env/health/rollback.
## Cleanup
Prove integration/identity/tip/owner/use/locks/submodules/staged+unstaged+untracked+ignored data. Keep protected/primary/active/uncertain targets, unique history/data; verify recovery. Readiness only lists. Recheck authorized removal: normal worktree, branch `-d`, remote only at reviewed SHA. No force/reset/clean/prune. Read back.
