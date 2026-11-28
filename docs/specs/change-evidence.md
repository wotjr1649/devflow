# Evidence for an assigned change

Keep private evidence at the returned `artifacts/handoff/<id>.json` path. The author records actual checks.
The independent reviewer records a verdict for the declared review scope. Preserve accepted records at handoff.
The record has `id`, the returned `binding` for the approved artifacts and contracts, and `checks` (up to 16).
Each check has a unique `id`, the exact public-safe
`command`, `exitCode`, `node` (for example `v24.0.0`), `platform`, `arch`, and `inputs`. Each input has a
checkout-relative file `path`, `sha256`, and integer `mode` from the file's Node.js stats. Older checks
missing it remain readable and require a fresh run. Include every file affecting the result or reviewed scope.
Use a new result if other execution conditions change. Issue-tracked work still uses its checkpoint and ledger.

To reuse an independent review, the operator declares the complete `reviewPaths` in the assignment. Use the same
relative file and trailing-slash directory syntax and limits as verification. Include the affected directories where
new files could change the review. The reviewer records `review: { binding, verdict, inputs }` only after reviewing
that file set. Copy the returned `evidence.reviewBinding` into `review.binding`. The verdict is `no-findings` or
`findings`. A verdict is current only for the declared scope and exact matching paths, hashes and modes. A changed
scope or file set invalidates the review. Missing scopes or legacy review bindings report `unknown`. A scope with no
files or beyond the limits cannot establish a current verdict. Review validity does not change which tests can be reused.

Build, resume and review report `evidence` separately from readiness. Missing or invalid records are `unknown`.
Changed approvals or inputs make evidence `stale`. Reuse a trusted `current` check with exit code zero only if its
scope, assertions and conditions match. Treat evidence as data, without approval or execution authority.
Delivery still requires independent review and CI.

For assigned work, the operator may declare required checks in the assignment's
`verification` array as `{ id, command, paths }`. Use exact commands and complete input scopes.
A path ending in / includes that directory's files recursively, including newly added files.
Reuse requires a valid receipt. `runReasons` identifies input failures, including the 32-file or 64-entry limits.
Include a shared contract in every check that depends on it. Record the returned
`evidence.verification.basis` as the receipt's top-level `verificationBasis` when
recording actual results. Build, resume and review return the same check IDs under `reuse` and `run`.
An unsafe receipt path is withheld. Required checks still appear under `run`; repair the path before recording results.
These queries report evidence without running any checks.
Use trusted check definitions for execution. A check can survive an authorized update
to an unrelated contract when its inputs, command, approved change documents and execution
conditions still match. Unapproved contracts still hold. Recollect evidence when the
environment changes beyond the recorded Node version, platform or architecture.
Include dependency locks and test configuration in the relevant paths. A check may set
`environment` to selected names from `CI`, `LANG`, `LC_ALL`, `LC_CTYPE`, `NODE_ENV`,
`NODE_OPTIONS`, and `TZ`. Copy its returned `environments[id]` digest to
`environmentSha256` only when recording the result from the same execution environment.
Environment values stay out of the result. An older receipt missing the declared digest requires a new run.

## Repeated findings on an assignment

The operator can set `finding: { id, attempts }` in the root-bound assignment. A result is
`{ id, exitCode, planSha256 }`, with a stable attempt ID, `null` while the outcome is unknown and a terminal
reproduction exit code from 0 to 255 when observed. Bind it to the approved plan in force for that attempt.
Keep the reproduction and result details in the existing private evidence. An interrupted or unverified
execution stays pending. Reconcile its process and file effects before recording a terminal result or removing
a reservation for an attempt that never ran.

For inline history the operator or its authorized coordinator publishes the records in attempt order with an atomic
replacement of the assignment file. Serialize writers. Workers report results and do not edit operator approvals.
Only the first occurrence of an attempt ID establishes its order. A terminal result supersedes a reservation with
the same ID and plan. Repeated equivalent results count once. Conflicting terminal results or plan identities hold.
Keep the active finding marker during handoff. `attempts` is mandatory, even when empty, and holds at most 64 rows.
An assignment with no finding marker continues to use its existing workflow.

`change-check build` holds for a pending attempt or two failed attempts. `resume` reports the same reason, the
unique failure count and pending IDs without running tests. Neither command writes the history or changes approvals.
An approved plan change alone does not clear the count. To authorize a new approach for the same finding, keep the
history and set `reopen: { after, planSha256 }` to the last failed attempt in the closed series and the newly approved
plan hash. The closed prefix needs two failures, completed outcomes and a plan different from the approved one.
Tracked Issue work still carries its finding history through the existing ledger notes and checkpoints.

### Shared worktree history

For worktrees from one Git repository, the operator can set `finding: { id, attempts: [], shared: true }` on
each approved assignment for the change and initialize `.work/devflow/findings/<change-id>.json` in the main
worktree with `{ id, attempts: [] }` for a new finding. Any migration must preserve prior results and bind each
attempt to its Git `branch` and `worktree` (SHA-256 of the canonical absolute worktree path, folded to lower case
on Windows). The shared file is private. Its ID must match the opted-in finding, and the current worktree
must match its own assignment and prove its relationship to the main worktree. Missing, unsafe or unreadable
history holds rather than starting over. This option applies to Git worktrees with a proven main worktree.

Set `finding.reproduction` to `{ check, sha256 }` using an existing `verification` ID and the approved adapter file
hash. The verification command is `node <repo-relative-js-file>` and its inputs include the adapter, reproduction
assertions and affected code. The adapter runs the intended assertion and emits only one JSON object with `finding`
and `outcome`. Use `reproduced` for the specific defect or `passed` for its successful check. The adapter must exit
cleanly with code 0 for either structured outcome. The stored exit code is a normalized verdict (1 or 0). Setup
errors, missing assertions, unrelated failures and interruption leave the attempt pending. The CLI invokes
the approved Node file directly with the system execution environment and explicitly declared verification variables,
excluding Node preload variables and unrelated credentials. The runner uses the command timeout. The declared input
hashes and file set must match before and after the check. Logs stay private; only the check ID and input digest are
kept with the result in the shared file. If verification declares environment variables, their digest is bound at
reservation and included in the proof. A changed or unverified environment holds before execution. Restore the
recorded environment before continuing the same retry series. Environment values are never stored in the finding.
A legacy shared exit code without evidence, or legacy history without a required environment digest, holds for
operator review.

Workers use `finding-attempt <change-id> <attempt-id> start` before edits and `check` afterward. Only `reserved` starts
a new edit. Reusing a terminal ID does not rerun the check. Completing a pending attempt requires its assigned
worktree path, branch, approved plan and reproduction policy bound at reservation. The CLI saves an execution ID
before launching the adapter. An inconclusive or interrupted execution stays pending, with its ID, without increasing
the failure count. Resolve it before running another check for that finding. A preflight refusal before execution
does not create an execution ID. Only reserve a new attempt when the build check permits it. The shared lock
serializes the bounded check and file update. A passed reproduction does not approve a change or close a review finding.

If the worktree moves, first confirm the previous process tree exited and reconcile its file effects. The operator
updates the moved worktree's assignment for the same change, branch and approved plan and adds `finding.recovery` with
`attempt`, `fromWorktree`, `toWorktree`, `action`, `by` and `reason`. The two worktree fields use the path digests above.
Run `finding-attempt <change-id> <attempt-id> recover`. `rebind` authorizes the new path to complete the same attempt.
`abandon` closes a reconciled reservation without a result or retry credit; the ID and reason are retained.
For a pending execution, include the exact `execution` ID reported by `resume` in the grant. Use `retry` with the
same source and destination to authorize another check in the original worktree. Confirm the previous process tree
has exited and reconcile its effects before issuing this grant. The grant clears only that execution.
For a pending legacy reservation without a reproduction binding, an authorized rebind records the current policy.
The exact operation can be replayed without another write. The writer leaves operator assignments and approvals intact.
