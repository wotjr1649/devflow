# Delivery

Done when the authorized effect is observed at its exact destination or reported as unapplied or unresolved. Readiness alone is read-only.

## Integration

Bind authority and gates to the exact revision, merge candidate or non-Git artifact and relevant inputs. While the ledger is autonomous, keep proposed Issue text in notes and do not post, push or integrate. Use `pr-ci`, `local-merge` or `push-on-request` from project rules. Use current revision CI for `pr-ci`; when its verify result is unavailable obtain local proof and still wait for required CI. Run the documented local verify for the other profiles. Check author-independent review when required, including M0; bind it to the criteria and HEAD. Missing review or open gate holds readiness. Draft public PRs with summary, review SHA, evidence and `Refs #<n>`; exclude closing keywords, private paths, raw logs and secrets.

Bind each required run to repository, workflow, run/attempt, event, relevant base and head, and the tested checkout. For push match the current head; for PR match the merge of current base and head. Missing, stale, skipped, cancelled or unrelated status is `NOT_VERIFIED`. Local success does not replace required hosted checks, protections, approvals or resolved threads. A failed check returns to build; get fresh evidence on the final revision.

Before applying refresh base, head, rules, checks, approvals and authority. Hold when any required gate fails or is unknown. Where concurrent change matters use protection, serialization or an expected target condition. For GitHub merge use the project's method with an expected-head guard (e.g. `gh pr merge <n> --merge --match-head-commit <sha>`); never bypass. Verify the result and required post-merge checks. Read back any uncertain effect. Retry only if confirmed unapplied with no attempt in flight, or if unknown and verified idempotency covers the same request and target. Hold dependent work while uncertain.

## Completion

Reconcile each authorized Issue against its own criteria and dependencies. From the Issue branch use only the trusted card tool to post reviewed summaries, mark evidenced criteria and record remaining work. Under `pr-ci` keep `ship` and leave the Issue open until observed merge and required post-merge checks. Under local profiles close whole scope only after their documented gate and retain any pending delivery in the state. Partial work stays open; if closed early, reopen and restore the appropriate stage. Create only authorized follow-ups. Cleanup after the Issue branch is gone records to the ledger.

## Cleanup

Inventory and verify exact root, refs, ownership, active sessions, locks, dirty and ignored files, and prerequisite evidence. For squash/rebase prove equivalent change. Delete only targets proven integrated and owned, with unique work safely preserved. Preserve the main worktree, protected refs, other workers and uncommitted work; keep anything whose proof or authority is missing. Treat local, remote and tracking refs as separate targets. Recheck the remote ref equals the reviewed SHA immediately before deleting it. Use non-forcing commands and hold moved or refused targets. Recheck each effect and stop on uncertainty.
