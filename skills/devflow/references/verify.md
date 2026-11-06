# Verify

Done when the selected scope has current execution evidence and no failed required check. Task completion also needs
the authorized commit and the mode/project's required task review; an M3 batch needs review of the actual combined
candidate. Delivery proves its selected full ACs and affected regressions; whole-Issue closure additionally needs all
current ACs, dependencies and the applicable ship gate.

Contents: Select scope and subject · Execute and assess · Record and advance

## Select scope and subject

Read the valid execution ledger and current approved intent. A public Issue stage of build does not roll a valid local
verify phase backward. Keep task-local check identities separate from Issue acceptance identities:

| Scope | What must be proved | What passing permits |
|---|---|---|
| Task | Local checks on the final authorized commit, plus required task review | After the completion barrier below, start the next task; linked full ACs stay unverified |
| M3 batch task | Accounted units, combined-candidate local checks and its postintegration Correctness review | After both aggregate verification and review, complete the batch and admit dependent work |
| Delivery | Full selected stable Issue AC IDs/definitions plus affected regressions | Accept this delivery for full-range review; other Issue ACs stay open |
| Whole Issue | All current full ACs/dependencies plus the observed applicable integration/release gate | Ship may close the Issue; cleanup follows |

The task's contributes-to mapping explains which Issue ACs it helps implement; it is not a claim that those ACs already
pass. Storage component tests support finishing that task after required review/commit while later form/API work is
still absent. The end-to-end
“submit, reload, see the saved result” AC stays unverified until a delivery run exercises it. Never relabel a task or
work-unit receipt as delivery/Issue proof, even when IDs, command names or an aggregate pass count look similar.

Use stable task/delivery IDs, the selected local-check or AC definition revisions, observed intent revision, fixed
delivery review base and baseline epoch. Display numbers are not identity. Changed definitions, ambiguous legacy
mapping or unreconciled intent hold dependent completion; retain earlier receipts as historical evidence.

For a display-only AC reorder, use the fresh raw `observedIntentRevision` and current control identity for supported
`intent-reconcile` before a check/write. The Tool separates raw `intent.revision` from semantic `intent.evidenceRevision`;
a receipt's `subject.intentRevision` retains its original provenance while `subject.intentEvidenceRevision` governs semantic
applicability. Only when the Tool confirms the same semantic fingerprint and selected ID/definition-revision set can
existing proof remain applicable, without changing delivery version/status, open task or budget. Its supported reorder
form is a contiguous single-line AC list with surrounding intent unchanged. Interleaved prose, multiline items or
ambiguous structure is not assumed equivalent. Definition, scope, candidate or relevant environment/configuration changes
still invalidate affected proof. Pending effects/verification still require recovery. Never rewrite an old receipt as
a new run, skip raw revision/owner checks, or rerun merely because of a reorder the Tool has confirmed preserves valid
proof. After reconciliation, take fresh returned/read control identity for the stable-ID check; do not reuse its
pre-reconciliation sequence. Missing or unsupported applicability needs reconciliation or current proof, not an
invented reuse guarantee.

The Tool's `verify-run <issue>` takes current `expected` control identity, `scope`, `criteria` references,
`command: {file, args}` and relevant `configFiles`. With `scope: "task"`, `criteria` selects the task's local `checks`;
with `scope: "work-unit"`, add `unitId` and select that unit's local checks. `delivery` and `issue` select full Issue ACs.
Keep these receipt scopes distinct. `task-complete` needs applicable task receipts and the review/commit barrier below;
a helper success does not certify that a required review occurred. Ship obtains a separate `integration` receipt on
the actual target; source `issue` receipts alone cannot close it.

Record full original HEAD or actual artifact identity, relevant dirty-input hashes, command/operands, cwd,
configuration/environment, result and provenance. Preserve replacement refs while using original-object reads.
The supported task runner can attest an unchanged dirty candidate; committing or integration creates a new subject.
Delivery and whole-Issue acceptance require a clean committed candidate. Preserve unrelated user material and isolate
or commit only the authorized candidate; never clean, stash or commit other work to satisfy the adapter. Unsupported
artifact/target subjects remain unverified. Review-package preparation is not a verification pass.

## Execute and assess

Run each selected local check or full AC against its actual candidate. Reading code is `STATIC_REVIEW`, not execution.
From M1 upward a fresh explorer / Verification context runs the specified scope without an expected verdict; main
reads delegation and only that role via the router. Record actual agent/model/effort or inherited/unconfirmed settings.
M0 main runs its checks. Issue/ledger control remains main's responsibility. Main obtains gate receipts through the
Tool's actual runner; when a child ran independently, main reruns the authorized check through that runner rather than
importing the child's prose as an executed receipt. The child never writes the ledger or supplies an expected verdict.

Only a behavior run or targeted test exercising the stated check makes that local check `VERIFIED`; only execution
exercising the complete AC makes that AC `VERIFIED`. Report `FAILED` or `NOT_RUN` with reasons and limited substitute
evidence. A build, syntax check or unrelated suite does not prove behavior it never exercises. The Tool's successful
exit proves an execution outcome; main still judges its actual semantic coverage and affected regressions.

For a bug, reproduce the symptom first and apply the same reproduction to the fix. Record the original subject before
and after execution. Changed HEAD, relevant dirty inputs, definitions or environment make earlier results stale: rerun
for the current authorized subject. Unstarted commands, unfinished children, lost results and unknown effects stay
incomplete. Reconcile the existing run before retrying; cancellation is not confirmed termination. A failure returns
to build without asking; rerun affected checks after the fix without resetting the same-goal budget.

## Record and advance

Persist executed proof through the trusted Tool with its scope, check/AC identities, subject, output artifact and
provenance. Notes cannot replace a required executed receipt. Even on a direct resume into verify, apply this task
completion barrier before `task-complete` or opening the next task:

1. Confirm the authorized task candidate is committed, preserving unrelated user work. If the commit is missing,
   finish that authorized commit first; a valid dirty-candidate receipt proves its bytes, not this prerequisite.
2. Confirm the review required by the current mode and project is complete for the actual task candidate. M2 needs
   narrow Correctness review except the documented mechanical single-file/no-boundary case. M3 requires the combined
   candidate's review below; project-required independence still applies. Read delegation and only the selected
   reviewer role via the router. Local check passes cannot establish that a review or commit occurred.
3. Recheck the final original subject and receipt applicability after every commit, review fix or integration. A
   changed HEAD or captured input requires applicable executed proof for the final candidate; do not relabel a
   precommit/earlier receipt as that run. Reassess the required review against the changed candidate too. If neither
   subject nor requirements changed and both proof and review still apply, do not repeat them merely for bookkeeping.
4. Once the authorized commit, required review and current task-local checks are established, use fresh control
   identity and applicable receipts for `task-complete`, confirm the result, then open the next task. An assessment
   names missing prerequisites instead of assuming they were done. The next task may implement remaining parts of the
   linked AC; task completion still does not check that full Issue AC off.

For M3, retain each unit's identity/base/worktree/files and pre-integration review. Integrate results serially, then
obtain aggregate task execution proof and a separate narrow Correctness review of the actual combined candidate.
Capture `review-package <issue>` with `scope: "task"` from the batch base through its combined HEAD; review cross-unit
interactions as well as each contribution. Unit reviews or passing aggregate tests alone do not satisfy this review.
If that review leads to changes, commit only the authorized fixes, obtain applicable execution proof for the new
candidate and confirm its required review before completing the batch. Only then, with all units/children/effects
accounted for, may the next batch or dependent task begin. Final delivery review remains a separate later gate.

After the last task, assess impact on earlier work and run the full selected delivery ACs plus affected regressions.
Two verified ACs out of five can complete this acceptance scope; the other three stay open. A failing selected AC or
regression prevents delivery acceptance regardless of other passes. Later deliveries reassess earlier proof instead
of retaining stale checked boxes. Delivery acceptance still precedes review and the actual ship gate; it is not proof
of integration or remote delivery.

The boundary checkpoint's `- 검증:` line says what ran and what did not, with safe evidence identifiers instead of
private paths. Proceed to full-delivery review; never close the whole Issue merely because a task or delivery passed.
