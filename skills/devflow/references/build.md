# Build

Done when the task's authorized candidate is committed, its meaningful local checks have run, and its original subject
and attempt history are recorded for verify. An M3 task is the integrated batch, not an individual worker's return.
On an Issue-free spike, done is the throwaway experiment and evidence in chat; tracked steps below do not apply.

Contents: Before the first change of a task · The change · Delegating (M2, M3) · M3 integration batch · Failures · After the task

Task verification can attest an unchanged dirty candidate through the supported Tool. Committing or integrating changes
the subject; acquire applicable proof for the final task candidate before completing it. Work-unit, delivery and
whole-Issue acceptance require a clean committed candidate. Preserve unrelated dirty/staged/untracked/ignored user material;
never clean, stash or commit it merely to satisfy attestation. Package preparation is not a verification pass.

## Before the first change of a task

Use the validated ledger's runMode, delivery and ownership. Changing mode returns to plan, or design on the bounded
path. Re-read current control identity before a mutation; stale ownership or sequence requires reconciliation, not
retrying with invented tokens. A lock's age is not permission to take over a paused writer.

Open task 1/N through the supported guarded transition, N from the plan (one on the bounded path), with a stable task
ID, task-local check IDs/definitions and their contribution to stable Issue AC IDs/definitions. A component task is
not required to achieve an end-to-end AC that depends on later tasks. Before editing or delegating record the full
original current HEAD as that task's base. Keep the delivery's original/review base fixed across all tasks. With
C0 → task A → C1 → task B → C2, task B checks may use C1..C2; final review still covers C0..C2. Neither HEAD~1 nor the newest task base substitutes for
that delivery range. Missing delivery identity/baseline holds implementation until reconstructed and validated.

Use the Tool's `control <issue>` operation `task-start` with `id`, `current`, `total`, explicit
`checks: [{id, definitionRevision, text}]` and `contributesTo: [{id, definitionRevision}]`. The latter names Issue ACs;
the former defines this task's actual expectations. A genuinely whole-AC task may use that full AC as its local
contract, but never omit local definitions for an intermediate component and assume it has achieved the full AC.

## The change

- New behaviour needs a test observed failing before the change or with it reverted. A bug fix starts with a failing
  reproduction and leaves it intact. A test never seen fail proves no fix.
- Fix code against the requirement. Change a test only for a changed requirement or wrong expectation; explain which
  in the commit/checkpoint. Do not weaken checks to finish a task.
- Execute checks for touched paths and affected callers. When shared code, configuration or test tooling prevents a
  justified narrow set, run the full project verify locally. The integration-profile full gate still belongs to ship.
- Syntax-only checks and commands that never started are not verification. Record failed/unrun checks and reasons.
  Use the project's package manager and lockfile for already-declared dependencies, not sudo/system installation.
- Bind each result to the actual original subject, dirty inputs used, cwd, relevant environment/configuration and
  local check definition and scope. The AC contribution mapping is not acceptance evidence. A source rendering through
  Git replacement refs is not the object that will be published.

## Delegating (M2, M3)

Main keeps user decisions, Issue/ledger control and integration. Read delegation and only the implementer role via the
router, then send its verbatim body and one English assignment. Include stable task k/N, delivery version/baseline epoch,
original task base, task-local check definitions, AC contribution mapping, editable files/interfaces, constraints,
exact ignored inputs, actual Check/healthy output, failure history and remaining budget. An M3 brief additionally names
its batch task and bound work unit. Do not give unsettled design choices to a writer.

Push, Issue writes, integration, extra agents, new dependencies and unapproved test/interface changes are out of scope.
An unsettled choice returns `NEEDS_DECISION`; known local details remain the implementer's decision. Use supported
actual host models/settings: bounded mechanical work may use a smaller model, cross-file judgment a stronger one.
Record actual/inherited/unconfirmed settings, never a claimed override without run evidence.

In interactive M2, main may make a one- or two-line edit explainable in one sentence and record it; unattended work
retains a fresh context per task. An M2 task gets narrow Correctness review before the next task starts, except a
mechanical single-file task without a trust boundary; final review still covers it. M3 reviews units before integration
and separately reviews the actual combined candidate after serial integration, before the next batch. Independent
units in the admitted batch may start together. Trust changes get a separate Security review. Readers follow
delegation's guard and immutable packet procedure.

Resume `NEEDS_DECISION` on the same supported agent after main resolves a choice within existing authority or gets
the needed user decision. Messages during a run are notifications, not guessed decisions. Once its Check passes, the
implementer stops and reports rather than adding unrelated rounds.

## M3 integration batch

Use M3 only with Claude Code's actual isolated worktree/background support and the Tool's supported work-unit binding.
The host must run a unit in its already identified worktree without writing before that binding is admitted.
Otherwise record the capability limit and use M2 through the guarded mode transition. Main maintains one active
integration-batch task and its local checks, opened with `kind: "integration-batch"`. Two or three independent work
units can run concurrently inside it; they are not competing active tasks or unbound labels in notes.

1. Before launch, use `running-add` with `id`, `label`, `worktreeRoot`, `baseOid`, `assignedPaths` and `checks` under
   that batch. Use the batch's full original base, a verified isolated same-repository worktree, disjoint literal
   file/directory scopes and local check definitions. The task's `contributesTo` preserves the AC relationship;
   describe each unit's actual contribution in its brief. Read back the binding. Confirm each worktree starts at the
   recorded base; fast-forward only when valid, otherwise reconcile. Unknown/shared interfaces or overlapping scopes
   require serial work. Read-only explorers/reviewers register `kind: "inspection"`, not a writing unit.
2. Launch the admitted units independently without waiting for a sibling to finish. Each carries its own binding and
   remaining same-goal budget, writes no Issue/ledger and returns a clean authorized commit plus actual check evidence.
   Returned output names the batch/unit IDs, original base/result commit, worktree, changed files and check results; another unit's receipt
   cannot satisfy it. Track actual agent/process identity and children against the unit's live-work entry.
3. Recover the result, actual exit, children and partial effects. Keep the unit entry while main obtains
   `verify-run <issue>` receipts with `scope: "work-unit"`, `unitId` and its local check refs in `criteria`; the Tool
   executes the actual check in that bound worktree. Do not import child prose as proof. Then use `running-done` with
   that unit's `evidenceIds`, `outcome: "passed"`, recovered `result` and `exitConfirmed: true`. Returned/verified is not integrated or accepted.
   A timeout, lost result or interruption leaves it open, without relaunch, assumed termination or fabricated proof.
   Continue only independent work. Failed/abandoned units keep the batch incomplete; use explicit supported recovery
   or task abandonment with a reason before replanning, preserving all receipts and the same-goal budget.
4. After the admitted writers and their children are quiescent, capture `review-package <issue>` with
   `scope: "work-unit"` and `unitId`. Review its immutable base-to-result packet, confirm file ownership and local
   evidence, then integrate one result at a time into the Issue branch. A package is input, never a PASS receipt. Keep
   other writes outside each reader's integrity-check window. Fast-forward when possible; otherwise use an authorized
   merge retaining the actual unit commit as an ancestor. The bounded adapter does not accept a cherry-picked or
   squashed replacement as that commit's integration proof. Record the source/result relationship and run current
   affected checks. A failed or ambiguous integration stays unresolved, never attributed to an accepted sibling.
5. Once every admitted unit is accounted for and its intended changes are integrated, confirm that the authorized
   combined candidate is committed, then run the batch's local checks against that actual subject. A worker's successful check does not prove
   the combined candidate or its full Issue ACs.
6. Capture `review-package <issue>` with `scope: "task"` for the batch base through the combined HEAD. Run a separate
   narrow Correctness review of that actual combined candidate, including cross-unit interactions, using a fresh
   reviewer and the read-only integrity procedure. The earlier unit reviews do not replace this postintegration
   review, and passing aggregate tests do not imply it occurred. Resolve findings; if a fix, commit or integration
   changes the candidate, obtain applicable execution proof and confirm required review of that changed candidate.
7. Verify accepts the batch only after its authorized final commit, current aggregate checks, combined-candidate
   review, unit dispositions and all children/effects are accounted for. Only then complete the parent task and start
   the next batch/dependent task. Keep unit worktrees/branches for later proven cleanup and retain all attempt history.
   Final full-delivery review still follows the last task.

## Failures

Separate diagnosis from repair so repeated fixes do not hide the cause.

1. An unclear check/CI failure goes to explorer / Root cause, report-only. If no cause is found, permit one supported
   stronger retry with the failed evidence, not an unchanged series of guesses.
2. The implementer gets at most two fixes after its first implementation attempt; a returned BLOCKED report that used
   both consumes both. Carry the same-goal history and remaining budget across reopenings and new agents.
3. Permit one promotion, one step to a stronger supported setting, tried once. Then main takes over or reports blocked.

Record each attempt, cause, fix, result and promotion in append-only notes. After three failures toward the same goal,
change the approach or stop and report. Ownership transfer or task/delivery version changes do not reset that budget.
A broken plan returns to plan; a departure updates the private plan before task end and its public summary at the next
checkpoint. A broken design assumption returns to design.

## After the task

Commit the authorized task and record its full original commit through the supported guarded operation; do not replace
ledger keys wholesale. Keep the task open and move execution to verify. Before completing it, confirm its required
review and applicable local execution proof for the final committed candidate. A commit or review fix that changes
the subject requires reassessing that proof/review before the next task. This barrier is between M3 batches, not
sibling work-unit launches. Task completion leaves its contributed Issue ACs unverified. After the last task, verify the full selected
delivery ACs and affected regressions; remaining whole-Issue criteria stay explicitly open for later deliveries.
