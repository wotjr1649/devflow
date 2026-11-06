# Verification scope and evidence

This contract owns verification subjects, criterion scope and receipt applicability. The [ledger](ledger.md) owns
state, ownership, reservations and completion transitions; the [execution adapter](execution.md) owns process completion.

`verify-run <n> < JSON` requires `expected`, a scope, definition references in `criteria` and `command: {file, args}`.
The scope determines what those references mean:

| Scope | Checked subject and definition set |
|---|---|
| `task` | Current task candidate and explicit task-local `checks`; `contributesTo` is a relationship, not an Issue AC pass |
| `work-unit` | `unitId` selects a registered isolated writer and its own local checks |
| `delivery` | Current delivery candidate and its selected full Issue AC definitions; regressions retain a separate role |
| `issue` | Current source candidate and all relevant Issue definitions; this is not evidence that integration happened |
| `integration` | `targetWorktreeRoot` selects the actual same-repository clean main checkout containing the completed source commit; checks run there |

Delivery `criteria` must be a subset of the selected delivery. Optional `regressionCriteria` names wider executed
checks separately: those receipts can establish affected regression coverage but cannot check an unselected AC through
delivery scope. Task `contributesTo` must also stay within the delivery selection. Recovered tasks require explicit local
check definitions; inherited ACs or checkbox marks never generate them automatically.

`configFiles` names repository-relative configuration inputs in the actual execution checkout that affect the result. The helper
reserves the run, executes the exact argument array outside the control lock and records the observed exit status,
subject, command, working directory, runtime, environment digest and configuration hashes. It then records an artifact
hash under the control contract. It cannot infer that an arbitrary successful command is a meaningful acceptance test;
the caller and independent review must justify that mapping.

A receipt applies only when its scope and criterion definitions match and its repository, Issue, semantic intent evidence revision,
delivery ID/version, original current commit, review base and baseline epoch still apply. Task proof also binds task ID, task base and local-check definitions. Work-unit proof binds the selected unit, worktree,
original base and assigned scope. Integration proof records the completed source HEAD and actual target HEAD separately. Runtime, environment, configuration and artifact hashes must remain valid. A changed subject, failed run, unknown exit, missing artifact or another scope is not a pass. Preparing review material is not verification evidence.

The ordered observed-intent revision and semantic `intent.evidenceRevision` have different roles. A receipt retains
`subject.intentRevision` as its original observed provenance and uses `subject.intentEvidenceRevision` for applicability. Mutations still
require the current observed revision; it is not a server-side body lock. A supported pure AC display reorder is
reconciled against unique IDs, unchanged definitions and the unchanged selected ID/revision set. Only then may the
delivery version/status, task and applicable receipts remain intact. The receipt keeps its original execution and
observation provenance; reconciliation does not fabricate a new run. Changes to meaning, criterion definitions,
selection or unsupported/ambiguous list structure retain conservative invalidation. Reuse supports only a contiguous
single-line AC list with unchanged surrounding approved context, through `intent-reconcile`; explicit `delivery-revise`
continues to revise scope and invalidate aggregate completion.

Task verification captures original HEAD plus index/worktree inputs and can attest an unchanged dirty task candidate.
Delivery and whole-Issue acceptance require a **clean committed candidate**, excluding private `.work` data. Preserve
pre-existing user changes; run task checks, isolate and commit only the authorized candidate, then execute delivery
acceptance at that subject. Do not commit unrelated work or clean the worktree to satisfy the adapter. If a clean
candidate cannot be formed within permission, keep delivery acceptance unverified and continue independent work.
The captured review manifest and package hash bind dirty inputs; unsupported, changing or oversized captures fail closed.
Operational metadata guards detect changes during capture. Long-lived applicability compares semantic inputs, trees,
original HEAD, relevant repository configuration and physical worktree identity, so an unrelated ref or index stat
refresh does not manufacture a changed code subject.

Task completion, delivery acceptance, whole-Issue closure and cleanup are separate predicates. A partial delivery may
pass while other Issue criteria remain open. A later delivery cannot assume earlier proof still applies: assess changed
areas and rerun affected checks; whole-Issue closure needs integration evidence applicable to all current criteria at the actual current main target.
A source-only receipt cannot substitute for proof of the merge result. The bounded integration adapter requires the
source commit to remain an ancestor; it does not infer squash/cherry-pick or non-main target equivalence. Command timeout or uncertain descendant exit leaves running state unresolved. Neither a timeout nor a parent's
exit is permission to kill a process or relaunch overlapping work.

For M3, `kind: integration-batch` defines one parent task with two or three separately registered writer units. Register
each unit before launching it; independent units may run concurrently. Confirm all writers and descendants are quiet
before protected review windows. Main reviews and integrates their actual commits serially, preserving ancestry, then
obtains a separate Correctness review of the combined candidate and executes its checks. Fixes must be reviewed and
verified at the resulting subject before the next batch. Starting a new independent reader uses `kind: inspection`, not a fabricated writer
unit. Unsupported host bookkeeping falls back to sequential M2.

`review-package` supports task, work-unit, delivery, Issue and integration scope and returns private material paths plus
a compact identity summary, always without a PASS receipt. Review material uses `lib/devflow-review.js` through the trusted helper. Its committed range is the complete delivery
review base through original HEAD, with selected index/worktree bytes when needed. It disables replacement objects and
repository execution paths, preserves the user's repository, and reports unsupported or changed inputs as not verified.
The reader canonicalizes executable exclusion boundaries and checks original Git object integrity with full strict
fsck; configured replacement objects cannot substitute reviewed content. Sparse/skip-worktree indexes, unsupported
encodings, object alternates, reftable and inspection timeouts remain not verified rather than falling back to unsafe
reads. It is a read guard, not an OS sandbox or atomic filesystem snapshot. Ordinary runtime source-repository reads
have a narrower protection profile than the isolated static review reader.
