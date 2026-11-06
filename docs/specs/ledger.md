# Ledger contract

The ledger owns execution state for one repository, Issue and worktree binding. The Issue owns approved intent; its
state block is a projection, not a competing execution clock. A missing, malformed, mismatched or partly migrated ledger
means unresolved state, never a reason to infer a stage from a stale projection.

## Contents

- [Storage and identity](#storage-and-identity)
- [Ledger keys](#ledger-keys)
- [Control operations](#control-operations)
- [Scope and evidence](#scope-and-evidence)
- [Execution profile](#execution-profile)
- [External effects](#external-effects)
- [Unattended runs](#unattended-runs)
- [task worktree](#task-worktree)
- [Concurrent sessions](#concurrent-sessions)
- [Migration and recovery](#migration-and-recovery)
- [Legacy compatibility](#legacy-compatibility)

## Storage and identity

New tracked execution uses schema 2. Its private store is `.work/devflow-v2/i<n>/` under the verified main worktree:

| File | Purpose |
|---|---|
| `ledger.json` | Execution identity, current control version, task, delivery and evidence receipts |
| `control.lock` | Exclusive short control section; no network or verification command runs under it |
| `evidence/<id>.input.json` | Full input manifest, review diff and executable argument array, retained by hash |
| `evidence/<id>.json` | Observed scope, subject, configuration, outcome and raw output; its hash is in the ledger |
| `migration.json` | Prepared or active cutover and original backup hash |
| `legacy-ledger.json` | Exact original v1 ledger backup when one existed |

The old `.work/devflow/i<n>/ledger.json` becomes a **directory** containing `DEVFLOW_V2.json`, with the same migration ID
as the new store. This is a compatibility fence: an old binary must encounter an unreadable ledger rather than silently
write around `controlSeq` or `ownerEpoch`. New readers require both the v2 ledger and matching fence. The store is private;
local paths, full logs and environment data do not belong in public Issue summaries.

Readers require plain bounded files and directories. The ledger is capped at 1 MiB. Input and result evidence artifacts
are separately capped at 64 MiB; oversized inputs prevent launch, while oversized results leave an unresolved reservation
instead of inventing success. Ordinary state and command responses contain compact receipts and artifact hashes, not
a fresh copy of every repository file or the full command output. The local controls protect cooperating processes,
not an attacker with the same OS write permission. A hash detects a changed artifact relative to a receipt; it is not a
signature or permission boundary.

## Ledger keys

| Key | Contract |
|---|---|
| `schemaVersion`, `migrationId` | Supported schema and completed physical cutover identity |
| `binding` | Repository, Issue, branch, canonical worktree and verified store root; all must match before execution is authoritative |
| `controlSeq`, `ownerEpoch`, `owner.session` | Current control revision and explicitly claimed session ownership |
| `stage`, `path`, `runMode`, `mode` | Named lifecycle stage; tracked path `bounded` or `architectural`; `M0`–`M3`; `interactive` or `autonomous` |
| `intent` | Current observed intent revision, semantic `evidenceRevision`, stable criterion IDs, definition revisions and text |
| `delivery` | Selected criterion references, unique ID/version, original and current review bases, baseline epoch, tasks and completion receipt |
| `deliveries` | Earlier delivery records; their presence does not make their evidence applicable to a new subject |
| `task`, `tasks` | Unique task IDs, current/total, task base, explicit local check definitions, contributing Issue criteria and completion status |
| `workUnits` | Separately bound M3 writer units: worktree, base, literal assigned paths, local checks, result and proof |
| `evidence`, `verification` | Completed execution receipts and any currently running or unresolved verification reservation |
| `effects` | External operations with validated target/operation ID and `pending`, `unknown`, `succeeded` or proven-not-sent `failed` outcome |
| `blocked`, `decisions`, `running` | Unresolved blockers, decisions and work whose result and process exit are not yet confirmed |
| `notes`, `followups` | Private append-only notes and deferred candidates; neither grants permission to publish |
| `counts`, `budget` | Per-task automatic continuation count and cumulative goal work budget |

`task.baseOid` may advance at the next task; `delivery.reviewBaseOid` does not. The original delivery base is retained
across an explicit rebaseline. A context reset, owner transfer, new task or new delivery does not reset the goal budget.
The initial default limit is 20 counted starts/continuations; extending it is a distinct recorded decision, not a claim
about tokens, elapsed time or model billing.

## Control operations

Read `ledger <n>` before constructing a mutation. Structured mutations include
`"expected":{"controlSeq":<observed>,"ownerEpoch":<observed>}`. The helper compares both and the session owner while
holding the lock; a stale request is refused before replacement. Rebuild a refused operation from the new state instead
of substituting fresh numbers into an old decision.

`control <n> < JSON` accepts semantic operations:

| Operation | Preconditions and result |
|---|---|
| `claim` | Confirmed quiescent handoff plus reason; advances owner epoch and returns to interactive mode |
| `update` | Only stage, tracked path, run mode, interaction mode, blockers and decisions; it cannot overwrite identities, receipts, scopes or counters |
| `task-start` | Previous task finished, open delivery, unique task ID/current/total, explicit `checks` and selected-delivery `contributesTo`; no AC-to-check fallback; captures original current commit as task base |
| `task-complete` | Applicable passing task evidence covers its local checks; a batch also requires all registered units stopped, verified and integrated |
| `task-abandon` | Explicit reason for ending an obsolete open task; retains its history, does not assert completion or remove Issue requirements |
| `delivery-start` | Previous delivery finished; unique delivery ID, current intent and explicit selection; opens a separate delivery without resetting cumulative budget |
| `delivery-revise` | Explicit scope revision with current observed intent; revises the delivery and invalidates aggregate completion |
| `intent-reconcile` | Adopts current observed intent; meaningful changes require no open task and invalidate aggregate completion. A supported pure AC reorder with identical semantic identity and selection preserves the open task, delivery and original proof |
| `delivery-complete` | Applicable delivery evidence, selected criteria plus affected regressions, impact analysis, no unresolved task, blocker, decision or running work |
| `rebaseline` | Full original commit OID and reason; retains original base, advances baseline epoch/version and reopens delivery acceptance |
| `running-add`, `running-done` | Record unique work before launch; M3 writers bind worktree/base/paths/checks, readers use `kind: inspection`; completion needs recovered result, confirmed command/child exit and applicable unit proof |
| `budget-extend` | Explicit higher limit and reason; records the old and new limits |
| `verification-abandon` | Explicitly confirmed quiescence and reason; recovers an interrupted reservation without converting it to a pass |

Named stage transitions follow [lifecycle](lifecycle.md#stages), including justified returns for new evidence or scope.
A transition needs a reason and current intent. Review and ship require accepted delivery evidence at the current subject;
cleanup and done cannot hide unfinished work. Architectural planning remains a separate stage; a bounded task does not
acquire a plan stage merely by changing a number.

`ledger-update`, `mode` and `running` on a v2 Issue are compatibility spellings for these structured operations, not the
old unrestricted patch interface. `note <n> < text` appends under the same lock without replacing execution tokens or
advancing `controlSeq`; independent observations may be retained while a verification or external effect is unresolved.
Appending a note does not authorize control, publication or another writer's release.

## Scope and evidence

The [evidence contract](evidence.md) defines task, work-unit, delivery, Issue and integration subjects and their
applicability rules. A task proves explicit local checks; a delivery proves only its selected acceptance criteria,
with wider regression coverage recorded separately. Whole-Issue closure needs current target integration proof.
A review package, task count or copied report never substitutes for executed proof. Scope, definitions, subject,
configuration and provenance remain bound through the completion transition.

## Execution profile

The [execution adapter contract](execution.md) owns process-tree supervision, exact output and platform limits.
Verification and v2 GitHub mutations require Linux, system Python 3 and a working child subreaper. Only a settled verification job with complete
output, root exit 0, no observed failure and unchanged post-run inputs can pass. `not_started` is terminal unverified;
`unknown` retains the reservation. Windows/macOS are unsupported and do not launch the target. A parent exit alone,
missing job metadata or a remote job outside this process tree cannot establish completion.

## External effects

Stable criterion operations (`check`, `intent`, `close`) include expected control and observed intent revisions.
Supported state projections, checkpoints, remarks, reopening, Issue creation and sub-Issue relations use the same local
reservation/readback model through their compatibility entry points; a projection must match the ledger stage. Before
the remote call the helper persists a pending operation and exact request digest. Its private transport artifact binds
the operation, target, command, input, raw output and full job report. All mutation commands use the supported process
supervisor; success requires both validated local termination and operation-specific remote readback.

A local operation ID supports reconciliation but is not a server-side idempotency key. Comments and Issue creation
capture the authenticated actor and complete bounded pre-send remote ID set. They require the **exact object URL
returned by this operation's complete settled transport**, absent from that baseline, plus matching target, author and
content. Another new object with the same actor/body/time cannot identify the request. An incomplete baseline prevents
sending. Idempotent target updates instead require their exact target state. Preserve raw transport evidence.

An unresolved local job, missing object correlator or mismatched remote observation remains `unknown`; a visible remote
object never proves local termination. Only validated non-dispatch is terminal `failed`: a strict `not_started` report
(including unsupported platform or executable launch failure), or settled GitHub authentication exit 4, bound to the
retained request and transport. A missing remote result after timeout does not prove failure. `effect <n>` with
`op: reconcile` revalidates that evidence and reads the target without redispatch. Settled known-URL operations can
recover from delayed remote visibility. Unknown local execution or a missing object URL has no force-complete path;
elapsed time, ownership claim and similar new remote content cannot release it. Unknown effects block dependent work
and replay; confirmed non-dispatch permits subsequent control. Preserve independent notes.

The helper does not provide a cross-machine GitHub transaction or compare-and-swap for Issue bodies. A local intent
revision check narrows stale-write risk but cannot lock out a remote edit after the read. Remote deletion likewise
requires an approved server-atomic expected-OID operation; the current no-lease policy leaves it held. A fresh lookup
followed by unconditional deletion does not meet that condition.

## Unattended runs

Only the ledger's `mode: autonomous`, chosen by the user, starts an unattended stretch. Approval bypass settings do not
mean the user is absent. Change mode with the structured control operation and a reason; return to interactive when the
user resumes. The run belongs to the recorded session, not whichever process wrote most recently.

Stop may continue only the bound owner's open task when no blocker, decision, running work, verification or unresolved
external effect remains. It allows at most two automatic continuations for that task and also spends the cumulative goal
budget. It never steals ownership, resets a budget, starts publication or turns an unsupported hook into an assumed event.

During autonomous work, Issue writes, pushes and integration stay deferred. The CLI enforces its own Issue-write path;
the hook is not a global shell, Git, HTTP or MCP firewall. Keep proposed content in private notes and publish only within
the user's actual authorization in an interactive turn. Context refresh does not grant permission or transfer ownership.

## task worktree

The working Issue belongs to the worktree's branch. A linked worktree without an Issue binding cannot write another
Issue's execution state. Claude isolation markers (`.claude/worktrees/agent-*` or `worktree-agent-*`) identify delegated
task worktrees: the parent owns Issue and execution writes. Renaming both markers remains an identification limit.

After confirmed integration, the bound owner may execute integration verification, supported criterion checks/closure,
and cleanup/learning/completion bookkeeping from the verified main worktree only when main contains the completed
delivery. The retained Issue worktree may also direct integration checks to that actual main target. This narrow continuation does not authorize another Issue,
worktree or session. A detached HEAD, ambiguous main-tree backlink or identity mismatch remains unresolved.

## Concurrent sessions

A control mutation holds an exclusive short file lock for its entire read/check/replace section. There is **no age-only
lock reclamation**, PID guess or rename-away takeover. A paused old holder must not become a second writer when it wakes.
Lock ownership is checked immediately before the atomic replacement, in addition to the fact that cooperating writers
never steal the lock. A bounded wait fails closed. Process crashes require explicit quiescent recovery.

There is no automatic or generic force-break command. Offline recovery first establishes that every relevant writer
and descendant stopped and cannot resume, preserves the store and lock bytes, and verifies the exact orphaned lock token
before removing only that lock. Then reread the validated store and claim using current control tokens. A flag, old
mtime, expired session warning or unrecognized PID cannot establish those premises; uncertain quiescence keeps the lock
held. Removing a lock never authorizes editing ledger JSON or clearing unresolved execution/effects.

Ownership and old session warnings serve different purposes. V2 ownership changes only through an explicit claim with
current expected tokens after quiescence. A claim with interrupted work preserves those receipts and permits recovery;
it does not clear unknown effects or establish that a prior command exited. Expiry of a warning, release of a session record, `/clear`, context compaction
or another host's SessionEnd does not transfer v2 ownership. Explicit release is the last session bookkeeping action at
handoff; subsequent work must reacquire the correct ownership before mutation.

Current CLI session identity is the first nonempty `CODEX_THREAD_ID`, `DEVFLOW_SESSION_ID`, or
`CLAUDE_CODE_SESSION_ID`. Nested hosts can therefore appear as their outer session; this is an observed implementation
limit, not a proof that native host attribution is correct. Do not release an outer session from a nested delegate.
Validate hook/CLI attribution on each target host as described in [hooks](hooks.md).

## Migration and recovery

Migration is an explicit operation, not a side effect of a card or read:

1. Stop and confirm all old writers, delegated processes and in-flight effects. A flag records that confirmation; it
   cannot establish quiescence by itself.
2. Read the trusted Issue and recover stable criterion IDs, intended delivery scope and full original delivery base.
   Do not infer a delivery base from v1 `base`, the latest task or the current HEAD when earlier work exists.
3. Invoke `ledger-init <n> --quiescent` with observed intent, delivery and recovery information. A nonempty legacy ledger
   requires `recoveryReason` and explicit `delivery.reviewBaseOid`; existing task progress requires an explicit
   `recoveredTask`. Unknown completion is reopened, not inherited as a pass.
4. Back up the original bytes, reserve the new store, create the old-path fence under the legacy lock, then finish the
   new ledger. Unresolved blockers, decisions, notes and followups survive; existing running work prevents activation.
5. Verify both stores' matching migration ID, new identity, budget and intended scope before resuming. A failure between
   steps is an incomplete migration, never permission for an old writer to continue.

Recovery must preserve backups, fence, evidence and unknown effects until their status is established. Never delete a
busy lock because of its age, directly edit v2 JSON to manufacture completion, or run an old binary against an active v2
Issue. A rollback is a separate quiescent recovery operation that preserves the v2 record and restores only a validated
legacy backup; it does not replay posts, reset work budgets or assert that external effects were undone. The separate
`.work/devflow-v2-continuity/i<n>.json` binds cumulative use and the explicitly approved limit to the archived ledger's
SHA-256. Reactivation validates that record and preserves both values. `budgetLimit` cannot reset use or change an
existing limit; only an active, recorded `budget-extend` may raise it. Missing or altered required archives hold recovery.

## Legacy compatibility

Unmigrated v1 ledgers retain their existing CLI and bounded resume behavior so a read-only upgrade does not rewrite user
state. The v1 lock also no longer expires by age. Its stage and run-mode shape checks, per-task continue count and recent
session warnings are legacy behavior, not v2 scope, evidence or ownership enforcement. They must not be advertised as
passing the v2 contract.

For v1, ledger writes append notes under the lock, session records warn for recent unreleased writers, and the warned
session holds conflicting state mutations until handoff. Explicit release removes only its own existing session record;
SessionEnd is a secondary path that preserves other sessions and locked ledgers. Warning expiry after 30 minutes is not
proof that a writer ended. Issue writes remain unlocked across machines. V1 create/remark guards retain their existing
branch, detached-HEAD, linked-worktree, unreadable-store and autonomous-ledger checks; an unbound main-worktree create
cannot prove unattended mode and is a documented legacy limitation.
