# Ledger contract

The [repository contract](repository.md#issue-folder) sets the Issue folder;
[lifecycle](lifecycle.md) and [orchestration](orchestration.md) define its stages, paths and modes.

## Protected workflow

New mutation workflows explicitly migrate to canonical `workflow.json`, with `schemaVersion: 2`. Execution stage
comes from this validated record. Public Issue state is a projection. An unreadable, invalid, interrupted or
mismatched record is unknown state; Issue prose cannot restore or advance it.

`workflow read <n>` returns a compact control summary, current evidence subjects, evidence IDs/statuses and unresolved
blockers/effects from one bounded JSON record. `--full` requests detail. There is no daemon or automatic effect runner.

Every protected control mutation checks repository, Issue, workspace and coordinator session identity, an exact
`expectedRevision`, the pending effect, and the applicable transition/evidence rules under the ledger lock. A
successful mutation increments the state revision. Revision conflicts require a fresh read and a new decision about
what remains to change; they are never a reason to replay already-applied operations.

The session hash and revision implement cooperative ownership and serialization. They do not authenticate an
independent actor: child processes can inherit a coordinator's environment, JSON can be forged by a process with
filesystem access, and raw Git/API/filesystem access bypasses these CLI gates. The documented native-host gate and
nested-session attribution limits in [hooks](hooks.md#common-contract-of-both-hosts) still apply. No record or receipt
grants external authority, host permissions, or permission to terminate another process.

## Ledger keys

A protected record retains ordinary metadata at the top level and keeps its control fields in `workflow`:

| Key | Holds |
|---|---|
| `workflow.identity` | Exact repository, Issue, delivery ID and workspace digest. A subsequent delivery has a new ID. |
| `workflow.owner`, `revision`, `evidenceEpoch` | Coordinator session hash, optimistic state revision, and explicit evidence invalidation epoch. |
| `workflow.phase`, `stage`, `path`, `runMode` | Task or delivery phase, validated stage, spike/bounded/architectural path, and exact M0/M1/M2/M3 execution mode. |
| `workflow.deliveryBase` | Comparison base for the entire delivery. Starting or retrying a task never replaces it. |
| `workflow.taskAttemptBase` | Exact commit before the current serial task attempt, or the M3 launch base when accepting that launch. |
| `workflow.integrationTarget` | Explicit target ref and observed target commit, distinct from both comparison bases. |
| `workflow.scope` | Scope reference and revision, criteria revision, intent revision, raw criterion definition references, Issue criteria, this delivery's criteria, required checks, and review perspectives. Partial delivery is an explicit subset. |
| `workflow.inputsDigest` | Revision of relevant non-commit inputs. Changing it invalidates earlier evidence even when HEAD is unchanged. |
| `workflow.task`, `taskAttempts` | Task ID, ordinal/total, criterion coverage, and attempt. Per-task attempt counters survive return, scope change, and handoff; a new attempt cannot reuse an old task receipt. |
| `workflow.launches` | M3 task launches with their exact bases and scope/criteria revisions. Launches may run in parallel; acceptance into the coordinator tree is serial. |
| `workflow.evidence` | Report references with subjects, coverage, lifecycle and verdict, plus confirmed integration result when available. |
| `workflow.pendingEffect` | At most one prepared, inflight, or unknown effect, bound to kind, target, payload digest and execution subject. |
| `workflow.relinquished`, `recovery`, `ownershipHistory` | Released ownership, reconciliation hold after quiescent recovery, and coordinator transfer history. |
| `mode` | `interactive` or `autonomous`, switched with `devflow-state mode <n> autonomous\|interactive --expect <revision> < reason`; this is the unattended-work decision, separate from M0–M3. |
| `modeChanged` | `{to, at, session}` for the last mode switch. Explicit claim/recovery transfers session attribution; the card shows mode and time. |
| `counts` | Bounded continuation consumption, keyed by delivery and task ordinal. A retry, scope return, or session handoff does not reset an existing task's count. |
| `notes` | Appended reasons, check evidence, observations, and content held during unattended work. |
| `decisions`, `blocked` | Open decisions and unresolved blockers, including uncertain remote results. Nonempty values block unattended continuation and shipping. |
| `running` | Names of outstanding background work. Add with `running <n> add <name> --expect <revision>` and remove with `done` only after recovering the result and confirming exit, child processes, and partial effects. |
| `followups` | Follow-up candidates to propose at ship. |

Protected `ledger-update` is metadata-only and takes `expectedRevision` with its patch. It rejects control-field
replacement, including nested workflow state, stage, task, bases, scope, receipts, mode, running, and continuation
counts. Use explicit workflow, mode and running commands. Metadata and appended notes remain writable while an effect
is pending, so independent work can continue; they do not invalidate evidence. `note` appends under the lock rather
than replacing the note list. Relevant conflicting transitions and additional effects remain held.

Files are regular, bounded JSON files of at most 1 MiB, through safe Issue-directory paths. An oversized result is
refused without replacing the existing record. Sessions are recorded separately in `sessions.json`; exclusion uses
`ledger.lock`. `testsLocked`, `testsFailing`, `pendingPosts`, metrics and other legacy data do not grant workflow
approval. Legacy pending posts must be reconciled before migration and are never automatically sent. Only candidates
the user has read and approved may be posted. A missing or unreadable mode can hide an autonomous run, so it blocks
Issue writes. Review-only calls create no state, session records, packages through workflow mutation, or hook env files.

## Transitions and evidence

`help workflow` supplies the JSON shapes. `workflow transition <n>` accepts an expected revision and one explicit
action. Forward `stage` requests follow the stage graph. Backward or repeated repair movement requires `return`, a
destination and a reason; it records invalidated evidence, increments the evidence epoch, and preserves completed
task history. Returning to discover/start/design/plan clears the active attempt, not its retained attempt counter or
continuation budget. A confirmed integration requires a new delivery before further repair.

`start-task` establishes an attempt base without losing the delivery base. Bounded work may start from design;
a minimal bounded M0 skip from start requires `minimal: true`. Architectural work requires plan. `finish-task`
requires applicable task verification and its effective review policy. Optional task `requiredChecks` and
`review: {mode: "required", perspectives: [...]}` describe task-specific exits. Omitted checks use delivery checks;
omitted review policy follows the current mode (required in M2/M3). Explicit
`review: {mode: "final", mechanical: true, reason: "..."}` may defer mechanical-task review to final delivery review.
Scope `taskRequiredChecks`, `taskReviewRequired` and `taskReviewPerspectives` are mandatory project-wide task gates:
checks/perspectives are unioned with task gates, and required project review forbids deferral. Final delivery always
retains its full `requiredChecks` and `reviewPerspectives`.

M3 uses `launch-task` before delegation, `start-task` to accept the launch, then serial checks and `finish-task`.
Acceptance binds the launch's ordinal, effective task gates, exact base and scope. Cancel inactive launches with a
reason; outstanding launches block final delivery verification.

`delivery` enters whole-delivery verification after the active task and parallel launches are settled. Entry into
review requires verification for the current phase. Entry into ship requires delivery-wide verification and review,
with no blockers, open decisions, running work, or unfinished launches. Task-only checks cannot authorize ship.
`finish-spike` records an explicit experiment report and verdict and ends throwaway spike work without pretending it
was integrated. Baseline failures remain reportable; FAIL and NOT_VERIFIED do not become PASS merely because the report
finished. A reproducible failing baseline and repairs remain in evidence/history rather than being erased to pass a gate.

`configure` changes path and/or M0–M3 with a reason before shipping, after workers and parallel launches have settled.
It preserves scope, task history, attempt counters and budgets and invalidates evidence. A changed path reopens design
(spike: discover), except already-early discover/start remain early. Architectural work must then pass plan. A mode-only
change from review returns to verify so newly required exits can be satisfied. `scope` increments scope revision and
never reduces criteria revision. `reconcile-target` explicitly records the old base/target and previous exact HEAD,
with a reason and new delivery base/target; before execution it preserves design/plan, and later it reopens verify.
`next-delivery` requires a new ID, explicit base and scope. It archives the integrated delivery's scope, bases,
inputs, final source HEAD, task/history records and verification/review references before clearing current receipts.
Archived evidence cannot authorize acceptance in the new delivery.

An evidence subject binds repository/Issue/delivery/workspace, exact HEAD, delivery base, integration target,
scope/criteria/intent revisions, criterion-definition digest, relevant inputs and evidence epoch. Task subjects also
bind task ID, attempt and attempt base. JSON object key order is immaterial; array order is retained. Ordinary
metadata revisions do not enter this subject. Raw criterion
identity uses explicit IDs and exact definition revisions; meaningful literal whitespace changes invalidate an old
receipt. Reordering can retain checks only when the same stable ID and raw definition remain verified.

Reports keep lifecycle (`created`, `running`, `completed`, `terminated`) separate from verdict
(`PASS`, `FAIL`, `NOT_VERIFIED`, `NEEDS_DECISION`). PASS requires completed lifecycle; verification and baseline PASS
also require exit code 0. Completed evidence is immutable. Multiple applicable independent PASS reports may supply the
union of required criteria, checks, and perspectives. For each requirement, the latest applicable completed report
wins; a later failure cannot be hidden by an older PASS. Pending or terminated work supplies no positive coverage.
Reports are references and structured claims, not proof of independent execution by a hostile same-user process.

## External effects and artifacts

Preparation records exact kind, target, payload digest and subject before the effect. Execution marks it inflight
under the lock, performs provider I/O outside the lock, then records an observed outcome. `unknown` preserves the
pending effect and requires explicit readback reconciliation before any retry. An interrupted inflight operation is
also unresolved until inspected. A success receipt for integration binds the reviewed source subject and the observed
target ref/result SHA. Cleanup may run after checking out that merged target; it does not require the old source HEAD
to remain checked out. Failed checks, advanced targets and failed integrations can return to the needed earlier gate
with a recorded reason after any pending effect is reconciled.

Protected check/intent/close operations use the real criteria helper against fresh Issue text and exact intent and
criterion definition revisions. A check requires applicable verification references. Closing requires every current
Issue criterion to be checked; evidence for only the current partial delivery cannot close remaining Issue scope.
Existing Issue schema, trust, leak filtering and uncertain-write handling continue to apply.

`review-package <base> <head> --owned-clean-snapshot` writes a private bounded artifact and prints summary/path/digest.
`delete-destination <remote>` resolves the destination before a branch-delete intent binds exactly
`{remote, ref, expectedOid, expectedDestination}`. Execution consumes that same payload. Read the
[artifact and deletion prerequisites](ledger-storage.md#review-artifacts-and-conditional-deletion): the caller must
provide an exclusively owned raw-byte snapshot and exclude all effective Git-config changes during deletion.
Destination comparison alone is not a race fence.

## Migration and compatibility

Version 1 `ledger.json` remains compatible until explicit `workflow migrate <n> --quiescent`; new skill mutation
routes require protected mode. Migration preserves exact legacy bytes, journals cutover, moves canonical state to
`workflow.json`, and atomically replaces `ledger.json` with a non-JSON regular-file tombstone. Actual pinned old CLI
and hook tests verify their normal mutation paths refuse it. Merely changing schemaVersion would not stop them.

Migration requires known quiescence of old/new writers, explicit delivery identity/base/target/scope, and recovery of
known active task/continuation consumption. It cannot guess a delivery base from the last task's base or reset used
budgets. Every unfinished journal blocks reads and writes until exact recovery. Follow the complete
[migration protocol](ledger-storage.md#protected-migration) for prerequisites, interruption recovery and boundaries.

## Unattended runs

An unattended stretch exists only when `mode` is `autonomous`, a user decision. Use
`devflow-state mode <n> autonomous --expect <revision> < reason` when the user steps away or orders unattended work.
When the person returns, use `devflow-state mode <n> interactive --expect <revision> < reason`, then show the held post
candidates. The reason is required as the first line of stdin. The command changes mode under the lock, appends
`mode <value>: <reason>` to notes and records its time/session in `modeChanged`. Legacy mode commands omit `--expect`.

Protected mode commands refuse the same value; claim/recovery transfers coordinator attribution explicitly.
Legacy autonomous commands may reattribute the same value with a reason until migration. Approval settings such as
bypass or yolo do not indicate a person's presence. Release makes a record claimable; the receiver must claim it.

- Protected continuation requires the current canonical coordinator, an open task in build/verify/review,
  and no blockers, open decisions, running work or pending effect. Review-only does not continue.
- The Stop hook consumes at most two continuations for the same delivery/task ordinal under the nonexpiring ledger
  lock. A retry, session restart, path/mode change or return preserves used consumption. A genuinely new delivery has
  a new key; arbitrary ledger patches cannot reset counts.
- Legacy records keep the old at-most-two per-task continuation compatibility until migration. Only the identified
  session that switched or reattributed an autonomous run continues; an unknown ID does not. A nested host's own event
  ID may differ from the outer ID recorded by its CLI, so it receives no continuation by assumption.
- On a task's completion, check, commit and record it. Only the user can run `/clear`; use fresh delegated task context
  with explicit handoff when needed, and keep the coordinator's progress in state and commits.
- Autonomous runs perform no external effects through protected gates, including Issue writes, push, integration and
  destructive cleanup. Keep intended post content in notes for the next interactive turn. No queue or automatic posting
  is created. Raw external commands remain the caller's responsibility and are not intercepted by this local runtime.

The [sessions reference](../../skills/devflow/references/sessions.md#unattended-work) owns the session procedure. The
[ship reference](../../skills/devflow/references/ship.md) owns integration procedure. Interactive Stop continuation is off.

## task worktree

A worktree writes only its own branch's Issue; Claude-isolated workers delegate state writes to the coordinator.
The [worktree contract](ledger-storage.md#task-worktrees) specifies safe paths, attribution, create restrictions,
detached HEAD, reftable and Windows aliases for both protected and legacy commands.

## Concurrent sessions

All cooperating mutations hold a nonexpiring `ledger.lock` directory through validation and commit. No age or mtime
permits takeover. See [exclusion and recovery](ledger-storage.md#nonexpiring-exclusion-and-recovery) for exact owner
checks, bounded contention, durable replacement and explicit `ledger-lock recover` prerequisites. Lock ownership
belongs to a short-lived CLI process; it is separate from canonical coordinator ownership. Neither that PID nor
`sessions.json` activity proves the coordinator and its descendants have exited.

### Normal handoff

`release <n> --expect <revision>` relinquishes protected coordinator ownership under the lock before removing this
session's advisory activity entry. It requires the current owner, exact revision, settled workers and no pending
effect. An absent activity file is harmless; a later cleanup failure does not undo a saved relinquishment. Open task
identity, attempts, evidence, bases, history, mode and consumed budgets remain intact. The former owner cannot resume
control mutations merely by writing again.

The receiving session uses `workflow transition <n>` with `action: "claim"`, `expectedRevision`, `expectedOwner`,
the exact current `identity`, and a reason. A claim requires a released record and settled workers/effects. It records
the transfer, updates autonomous mode attribution when present, and retains prior work and budgets. `note` may append
independently; other protected controls require the current owner. Legacy `release <n>` only removes its own activity
entry and creates no files when none exists.

### Vanished coordinator

`workflow recover <n> --quiescent` accepts the exact revision, previous owner, current identity, a reason and a
readback `ref`. The operator must establish that the former coordinator and its descendants cannot write again;
expired activity or the end of one CLI process is insufficient. This is a cooperative, operator-confirmed boundary,
not a liveness oracle or authority to kill another process.

Recovery transfers coordinator control with a reconciliation hold. It preserves pending effects and running-work
uncertainty so the receiver can inspect them. Notes, metadata, a switch to interactive mode and confirmed worker
completion remain possible. Every recovered effect outcome requires `reconciled: true` and a readback reference,
even when its saved status was prepared. Effect execution, new workers, autonomous continuation and ordinary stage
changes remain held. After worker and effect uncertainty is settled, `action: "resume-owner"` with the exact current
revision, owner, identity and a reason records the reconciliation and releases the hold. Ownership history is retained.

SessionEnd only cleans advisory activity; it never relinquishes canonical control. Review-only calls do not write.
The [session attribution contract](ledger-storage.md#session-attribution) retains the host-ID precedence, nested
session limitations, 30-minute warnings and cross-machine uncertainty. Provider writes are not globally locked;
pending-result reconciliation and native-host authority checks remain necessary.
