# Sessions

Done when the requested note, resume, progress report, handoff, mode switch or intent update is recorded through the
trusted Tool for the verified identity and current owner, with no guessed state or replayed uncertain effect.

Contents: Notes and closed branches · Ownership and migration · Progress and returns · Handing off · Unattended work · Changed requirements

## Notes and closed branches

Use the Tool's supported append operation for evidence and proposed public text. Never replace notes wholesale or use
an append as an execution transition. After the branch is gone, a supported closed-branch note targets the existing
Issue ledger from the surviving workspace; no new Issue or branch is needed. If that operation cannot verify the
original identity/ownership, preserve the local evidence and report the gap without a direct-file workaround.

## Ownership and migration

Before execution mutation, read validated repository/Issue/branch binding, schema version, owner/epoch and control
sequence. Use the exact expected identity returned by that read. A rejected stale writer reads again and reconciles;
it does not blindly retry, reset sequence/epoch or copy old state over newer work. A lock remains owned through its
write lifetime. Time since heartbeat, a paused process or a stale-looking file is not proof of release.

Claim another session's execution only after a verified quiescent handoff: its relevant processes, children and unknown
writes are accounted for, and authority permits transfer. A new epoch fences earlier writers; their notes or cached
cards cannot restore authority. Never terminate or release another session to clear a warning. Maintain live-work and
external-effect records until actual termination/readback; ending a wait is not ending the work.

For old schema state, use the Tool's supported quiescent migration. Stop or retire every actual legacy CLI/hook writer
through its owner's handoff, verify no in-flight mutation, retain the rollback snapshot and verify the cutover's writer
fence. A new field preserved by an old writer is not compatibility. Incomplete activation/rollback, an unaccounted old
writer or ambiguous ownership holds dependent writes; report the recovery state instead of hand-editing either ledger.
Rollback is a supported quiescent procedure, not permission to reopen legacy writes against v2 state. Recover missing
local task-check definitions and their AC contribution mapping from verified plans and actual checks; old task AC refs
or checked boxes cannot be silently converted into local-check or full-AC passes. Preserve the old receipts as history.

## Progress and returns

For verified tracked work, explain five milestones with their exit evidence:

| Milestone | Exit evidence |
|---|---|
| Direction — discover/start | confirmed intent/ACs, linked Issue, working association, baseline and delivery scope |
| Preparation — design/plan | decisions, task interfaces/checks, exercised prerequisites and go; bounded records these in design |
| Increment — task build/verify | authorized final commit, current local proof and required task/combined-batch review; full ACs may remain unverified |
| Acceptance — delivery verify/review | selected delivery ACs and affected regressions pass; required review and findings handled |
| Delivery — ship/cleanup/optional learn | delivered scope integrated, applicable tracking disposition verified, local closeout accounted for |

Show status separately: in progress, met, blocked or unconfirmed. Entering a stage is not exit evidence; blocked applies
only to dependent actions. Report goal, increment's actual contribution, milestone/status, observed evidence and applicable
subject, remaining exits, next action and blocker/decision. Task k/N is a count, not a percentage. Refresh at resume,
boundary/increment completion, rollback, scope change or new blocker, not every message. Pre-Issue discussion and
independent skills' direct returns do not create this tracking procedure.

Sources of truth are distinct:

- The approved Issue intent owns requirements. A current Tool read yields observed intent revision and stable AC
  identities/definition revisions; its public state is a coarse projection, not the private execution authority.
- The identity-valid ledger owns execution stage/task, delivery version/scope/baseline, current owner/sequence and
  blockers/live work. An M3 batch is one active task with separately bound units: identity/base/worktree/files, actual
  processes, returned proof and integration outcome. A finished worker does not complete the batch. Missing/unreadable/
  mismatched state means unknown progress, not none.
- Executed receipts, review packets/reports and referenced raw evidence establish proof. Notes/checkpoints locate and
  explain it. The private plan or bounded design locates intended tasks/checks; neither proves execution.
- Actual original Git objects and current refs, or actual artifact versions/hashes, establish applicability. Different
  current HEAD from a recorded commit requires inspecting intervening work and reassessing proof. A successful old
  log alone does not apply. Keep raw evidence/private paths local; public summaries use safe IDs or hashes.

Issue build with valid ledger verify is the normal local loop: resume verify. A closed Issue can retain its last
ship projection while the ledger proceeds through cleanup, optional learn, then done. Close does not advance that
ledger stage; do not force a public done projection before the supported close. Changed approved intent is reconciled
separately while preserving the actual phase and history.
For other discrepancies inspect identity, ownership, delivery scope, baseline and proof, not the latest timestamp.
On another machine, the Issue's public projection cannot reconstruct missing private state: recover it or explicitly
reconstruct from verified sources through the supported procedure before dependent mutation. Never start from a guessed
phase, silently rebaseline, or treat absent evidence as completed work.

Expand truncated cards to the relevant full Issue, ledger, plan and evidence. Preserve warnings/failures. Missing/stale
proof or unclear local-check versus full-AC scope leaves the affected acceptance open. A task contributes to an AC;
its completion does not check the AC off. For M3, recover each unit by its actual binding, account for children/effects,
then finish unit review, serial integration, combined-candidate checks and its separate Correctness review. Confirm
the final authorized commit and current proof before advancing; never relaunch unknown work from a count alone.
If reconciliation remains unresolved, report unconfirmed and the cheapest owner read/evidence comparison that resolves it, while continuing independent work.
Create no duplicate milestone fields, routine public posts or parallel sources of truth.

A behaviour failure reopens Increment; a bad plan/assumption reopens Preparation; changed intent/acceptance reopens
Direction through the new user decision. Name why, evidence/decisions retained, exits reopened and next step; a same-scope
fix needs no fresh interview and never resets attempt history. Review-only ends at findings. Keep delivered subset,
parent scope, Issue closure and cleanup separate. A partial delivery does not close its parent; a done label or deleted
branch proves neither integration nor cleanup. Do not reopen a closed Issue merely to match a local cleanup label.

## Handing off

Finish the work's checks, commits and updates, account for delegated work/children/effects, then use the supported
release/handoff operation as the last control action. Release only this session's identity. Claude launched from Codex
may inherit CODEX_THREAD_ID; it must not release its parent's ownership. Ask the user to clear only after the handoff;
Codex may keep the old thread alive after `/clear`, so clear alone is no ownership-transfer proof.

A resume prompt carries only missing instructions/decision deltas, under 500 tokens, pointing to the Issue and private
records instead of copying them. A new child still receives delegation's complete role boundaries and exact task
contract; do not shorten those away to meet the resume-delta budget. Another-session prompt explicitly carries its
identity/handoff responsibility and the inherited-parent release exception.

A prompt file goes to a unique `docs/prompts/YYYY-MM-DD-i<issue>-<slug>-prompt.md`, uncommitted and without overwriting an
existing path. End the reply with `Read <absolute path> and continue.` so the next workspace resolves it. Without a
file, include the complete prompt; with one, include it in chat up to about 2,000 characters, otherwise the done condition
and closing line, unless the user will paste rather than open it. Those local paths belong only in the private handoff.

## Unattended work

Set autonomous mode only for an explicit away/unattended instruction or a noninteractive prompt saying so, not from
bypass/yolo settings. Use the supported guarded mode operation with reason and current owner identity. Autonomous mode
authorizes no Issue posts, pushes or integration: keep candidates in append-only notes for interactive review.

Continuation requires this session's current autonomous ownership, an actually open task, and no unresolved decisions,
blockers, live work, verification reservation or unknown external effect. If any condition fails, record the reason
and wait for its owner; do not fabricate completion or clear blockers to continue. A new session first reconciles and
claims through a verified handoff, then records interactive presence or explicit autonomous instruction. When the user
returns, switch mode with a reason, present pending candidates and apply only already-authorized/approved public effects.

## Changed requirements

Show the changed intent above the state block to the user and reuse any explicit approval already given. The guarded
intent operation uses a fresh observed intent revision, stable AC IDs and explicit definition revisions. Display order
alone cannot transfer checks, identical/duplicate legacy wording cannot supply missing identity, and changed definitions
invalidate their proof. Preserve the state block and requirement history; never remove unresolved obligations merely
because a delivery excludes them.

Re-read the resulting intent and use supported `intent-reconcile` with the latest raw `observedIntentRevision` and
current owner/control identity. Raw `intent.revision` remains the observation/CAS identity; `intent.evidenceRevision`
identifies the evidence-relevant meaning. For a pure reorder of a supported contiguous single-line AC list, the Tool
compares that fingerprint and the selected stable ID/definition-revision set. If both are unchanged, it updates raw
intent metadata while preserving delivery version/status, the open task, budget and existing receipts/artifacts.
A receipt keeps its original `subject.intentRevision` provenance and `subject.intentEvidenceRevision` applicability;
do not edit it to claim another run. Reuse still requires the same applicable candidate, scope, inputs and environment.
Subsequent check/write operations use the returned/read current control identity and raw revision, not cached
pre-reconciliation sequence numbers.

This preservation does not bypass pending verification/effects or stale owner/sequence/raw-revision checks. Changes to
meaning, definition or scope follow normal invalidation. Multiline ACs, intervening prose or ambiguous rearrangement
are outside the bounded reorder adapter: follow the Tool's actual result rather than declaring reuse or unnecessary
reruns from display order alone. Preserve historical evidence, reconcile affected scope and obtain current proof when
required. Never manufacture semantic fingerprints or replace evidence fields yourself.

Later work reassesses evidence for subject, dependencies and environment changes. A local compare-and-swap protects
local state, not GitHub's whole read/write window. A timed-out or conflicting external write stays unknown until
supported effect reconciliation reads back the intended result; never redispatch a submitted write blindly.
