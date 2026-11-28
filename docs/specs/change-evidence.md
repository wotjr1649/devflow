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
