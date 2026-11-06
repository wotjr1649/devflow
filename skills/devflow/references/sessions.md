# Sessions and progress

## Resume exit

Match repository/Issue/delivery/workspace, adopted scope revision, coordinator, phase/task/attempt, three baselines and pending effects before selecting the next action. Resume does not reset task budgets.

Read the trusted card, validated ledger, adopted intent and relevant checkpoint/plan/evidence. Recover missing/truncated detail through the helper; do not load all comments, old prompts or full conversation by default. Match identity, never newest timestamp, and do not repair warnings by guessing.

A valid ledger verify task with public stage build resumes verify. Stage lag alone does not block. Reconcile actual intent/criteria edits, closure/freeze, reassociation, Git subject and pending requests before dependent work. Closed proves neither completion nor cancellation. Preserve unbound evidence as history; recover a lost delivery base rather than relabeling the last task base. Unsupported state holds dependent writes/acceptance, while analysis and brief drafting continue.

## Supported operations

Prefix arguments with the exact trusted `Tool:` invocation. `help workflow` gives JSON shapes; placeholders are never guessed IDs/paths. `workflow read <issue>` returns compact control state and the active evidence subject; use `--full` for missing history. `criteria <issue>` returns actual intent and criterion definition revisions.

| Need | Arguments |
|---|---|
| Change control / add receipt | `workflow transition <issue> < request.json` / `workflow evidence <issue> < receipt.json` |
| Prepare / reconcile effect | `workflow effect <issue> prepare < effect.json` / `workflow effect <issue> resolve < result.json` |
| Select mode | `mode <issue> autonomous --expect <revision> < reason.txt` / `mode <issue> interactive --expect <revision> < reason.txt` |
| Track worker | `running <issue> add <label> --expect <revision>`; after result recovery and confirmed exit, `running <issue> done <label> --expect <revision>` |
| Append private context | `note <issue> < note.txt` |

Mutation JSON uses current `expectedRevision`. A conflict requires read/reconciliation, not blindly incrementing it. Control changes use workflow actions, not arbitrary `ledger-update` fields. A backward move uses `action:"return"` with `stage` and a `reason` naming affected evidence; it advances `evidenceEpoch`, retaining old receipts as history until revalidated. M3 `launch-task` records parallel starts; `start-task`/`finish-task` serialize acceptance. `reconcile-target` preserves old head and records the new delivery base/target/reason after substantive reconciliation. `next-delivery` retains unfinished Issue scope. After confirmed integration, repairs start a new delivery instead of rewriting the integrated one. An already tracked spike can use `finish-spike` with `reportRef` and verdict after workers exit; it records experiment reporting, not delivery integration. Pre-Issue spikes need no ledger.

Initialize/migrate with `workflow migrate <issue> --quiescent < migration.json` only after actual old/new writer quiescence, no running workers/pending legacy posts and a verified delivery base. The flag proves none of these and grants no termination authority. The helper owns `workflow.json`, preserves `ledger.v1.json`, and atomically replaces legacy `ledger.json` with a non-JSON tombstone; never hand-edit/delete them. Resume an interrupted migration with the same initialization JSON. Inspect with `ledger-lock inspect <issue>`; supported recovery is `ledger-lock recover <issue> --quiescent < owner.json` for the exact confirmed-exited owner, never an mtime takeover.

Path or execution-mode changes use `action:"configure"` with changed `path`/`runMode` and a reason after workers settle. Preserve budgets and reopen the required exits; changing strategy cannot waive scope or acceptance.

## Progress

Report outcomes at stage/task changes, returns, blockers and resume, without repeating the whole plan every command. Milestones—direction, preparation, implementation increments, acceptance, delivery—project existing evidence, not a second stored state machine. Use in progress, met, blocked or unconfirmed; task counts are not percentages.

Name the goal, changed outcome, milestone evidence, remaining exits, next action and blocker. Every return includes destination, reason, affected/retained evidence and reopened exits. Task, delivery, Issue and cleanup completion stay distinct.

Public state is at most 15 Korean lines using `단계`, `브랜치/PR`, `완료`, `남음`, `다음 행동`, `막힘`, `최신 체크포인트`. A checkpoint has its header plus at most nine field lines, including `변경`, `검증`, `결정`, `다음`. Publish sanitized summaries/safe evidence references, never local absolute paths or raw logs. State replaces its block; checkpoints append; approved intent changes use the intent operation and preserve affected history.

Use per-key notes/running/mode operations, never replacing a running list to enable continuation. Retain unknown/interrupted workers until results, worker/descendant exits and partial effects are reconciled. A late report cannot accept the current task; do not duplicate conflicting work or infer permission to terminate.

## Handoff

Finish authorized checks/commits and preserve receipts/decisions/effects. Record the delta: completed work, current head/scope/baselines, remaining exits, failures/remaining budget and next action. Use Issue/plan pointers instead of repeated history; the resume prompt targets under 500 tokens without cutting essential evidence. One-off prompts may use private `docs/prompts/YYYY-MM-DD-i<issue>-<task>.prompt.md`; private trusted paths are not public text.

For a planned transfer, use `handoff` while the current owner can act. Otherwise settle workers/effects, then make `release <issue> --expect <revision>` the session's last control action. The new session uses `workflow transition <issue>` with `action:"claim"`, current `expectedRevision`, exact `identity`, `expectedOwner` and a reason from the observed record. Claim preserves bases, evidence and budgets. Use the host's identity mapping so a child never releases its parent. Context clearing is a user action, not a completion requirement.

If the owner vanished without release, establish actual coordinator/descendant quiescence and inspect partial effects. Use `workflow recover <issue> --quiescent` with the same identity/owner/revision fields, reason and private evidence `ref`. This grants reconciliation under a hold, preserving unknown effects and worker labels. Read back effects and recover worker results/exits before resolving effects or recording `running ... done`; then use `action:"resume-owner"` with current identity/owner/revision and reason. No age, short-lived CLI PID or flag proves quiescence. Recovery authorizes no replay or new external effect.

## Unattended work

Explicit away/unattended intent alone selects autonomous mode. Record the switch and reason through the helper. Continue authorized local work only with a validated owner, open task and no blocking decision, conflicting running work or exhausted budget. Hook continuation limits differ from task repairs and total-cost budgets.

Autonomous mode forbids Issue writes, push and integration. Keep public candidates/blockers private. On interactive return, show pending effects, reuse grants covering their exact targets, and ask only for missing authority; do not batch-post old notes automatically. A new coordinator reconciles outstanding requests/workers before competing effects. Lease expiry does not prove the prior writer stopped.
