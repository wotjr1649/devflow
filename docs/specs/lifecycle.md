# Lifecycle contract

Defines which stage the devflow router sends work to, what each stage is responsible for and when it moves on, and where
work returns to when new information appears. How work runs inside each stage (modes, delegation, models) is defined by
[orchestration](orchestration.md).

## Router

- One entry point, the `devflow` skill, takes new work, resuming, stage moves, review, PR and merge, and cleanup in a
  repository with `.devflow.json`. One description then covers the whole lifecycle, so no other skill competes for
  these requests.
- Each stage reads its reference in `skills/devflow/references/`, one level below the skill and linked from SKILL.md
  ([skill references](documents.md#skill-references)), for example [review](../../skills/devflow/references/review.md)
  and [ship](../../skills/devflow/references/ship.md).
- The router uses the resume card (the Issue's current state, the ledger, `.devflow.json`) to judge the current stage
  and task number.
- Even when a card exists, the router takes a new work request through start, which decides the
  [path](#stages-by-path). A spike, or work whose problem and acceptance criteria are not confirmed, goes to discover
  ([rationale](../design/current-decisions.md#entry-points-and-stages)).
- Without a card, check for `.devflow.json`. When it is absent, this is not a devflow repository: route nothing. When it
  is present, the hook did not run or failed; a card whose last line is not `Tool:` is the same case
  ([resume card](issues.md#resume-card)). Then new work may be discussed and analysed (discover), but no Issue is read
  or written, no stage is inferred, and no work that needs an Issue starts until a valid card arrives or the user
  supplies the `devflow-state` path. Never search for the path: a path found in repository files could run code the
  user did not choose.
- A review-only request stays a review: it ends at findings and does not expand into ship or cleanup, because merging
  and deletion need their own request.
- When moving between stages, change the stage in the ledger and `단계` in the Issue's state block. Moving between build
  and verify inside the task loop is recorded only in the ledger.
- After compaction, call the router again and reread the current stage's reference. The body of an invoked skill is
  reattached after compaction, but reference files are not.

## User navigation

The one entry point, the ten internal stages and done stay. To the user, the current position is
explained with the five milestones below. Names are neutral, and the status (in progress, met, blocked, unconfirmed) is
shown separately. Do not mark a milestone met because its stage was entered. Use met only when exit evidence for that
scope exists; blocked applies only to dependent actions.

| Milestone | Internal stages | Evidence needed to exit |
|---|---|---|
| Direction | discover, start | Confirmed intent and acceptance criteria, linked Issue, working branch and baseline |
| Preparation | design, plan | Major decisions resolved, per-task plan and proof, needed prerequisites and go. For bounded: the one change and check settled in design, the prerequisite check and `runMode` |
| Increment | per-task build ↔ verify | The current task's user outcome and its verification at the applied revision |
| Acceptance | full verify after the last task, review | Execution evidence for all acceptance criteria in scope, and required reviews and findings handled |
| Delivery | ship, cleanup, learn when needed; done is the Issue's closed state | The actual integrated scope, the Issue closed, and the remaining local cleanup confirmed |

Because bounded handles the prerequisite check inside design, without a plan stage or go checkpoint, do not leave
Preparation unconfirmed because there is no plan file or go. Task verification and full acceptance verification are told
apart by scope. A partial integration describes only the delivered part and does not mean the larger scope is met. Keep
Issue done apart from local closeout, and run learn only when there is a lesson. Milestones are not a new stored state,
approval gate or Issue posting cycle.

This display applies to resuming an existing Issue whose link `devflow` has confirmed (including after `/clear` or
compaction), to stage exits and to going back. New pre-Issue entry, direct entry into and return from other skills, and
the card renderer and its abbreviation are outside this contract's implementation scope. If there is no card or the link
is unconfirmed, the existing routing limits stay. An abbreviated card is not a complete state, so recover through the
original owner's read path. This is not a change to card abbreviation itself.

At meaningful boundaries (resume, stage exit, increment done, milestone change, going back, scope change, blocked),
briefly explain the goal, the current increment's user outcome, the current position and status, the evidence of
completion, the remaining exits, the next action, blockers or open decisions, and the applied revision. Task k/N is a
count, not a completion rate. Each fact is owned by the Issue's confirmed intent and major stages and the checkpoints'
verification records, the ledger's task loop, blocker and verification-evidence notes, the plan's task-to-proof links
(for bounded, the design's decisions), the raw evidence they point to (the evidence in [documents](documents.md)) and
the Git revision. Do not create milestone fields or a separate state document; cross-check with
[sessions](../../skills/devflow/references/sessions.md#progress-and-returns). Mark missing evidence, stale evidence and real conflicts
as unconfirmed, and hold dependent actions. Do not clear a conflict by the latest timestamp alone or turn an earlier
FAIL into PASS. Use the existing boundary updates, and do not build a long progress table in every reply.

Returns follow [going back](#going-back) below exactly. A behavior failure returns to Increment, a plan error to
Preparation's plan, and a failed design assumption to Preparation's design. A change to intent or acceptance criteria
goes through the existing user confirmation in Direction. Give the reason, the evidence to keep, the exits to meet again
and the next action, and do not require a new interview for a fix in the same scope.

## Stages

| # | Stage | Responsibility | Output | Condition to move on | Owner |
|---|---|---|---|---|---|
| 1 | discover | What to build and why: the problem, users, success criteria, exclusions. Separate observations, claims, estimates and unknowns; if what to build is open, compare concepts and minimal scopes | Draft intent, or findings and the reason for holding or stopping with the condition to resume | start once the user confirms the intent. A build request that already holds the problem and observable acceptance criteria is itself confirmed intent, so it goes to start without a new interview. A spike ends with a throwaway experiment and a report. Research, draft only, hold or stop before an Issue exists ends by reporting the result and creates no Issue, branch, ledger or product change | router reference |
| 2 | start | Register and match the Issue, settle the acceptance criteria, working branch, baseline check | Issue body, branch | Issue link confirmed, baseline passes | `start` reference |
| 3 | design | Organize requirements and design, compare alternatives, mark concerns. Contract changes go into specs, and current choices and their reasons into [current design decisions](../design/current-decisions.md) | Design notes, or `docs/specs/` and current design decisions | Decisions only the user can make are resolved | router reference, reviewer (design perspective) |
| 4 | plan | Per-task files, order, interfaces, proof, risks. Check [plan quality](orchestration.md#plan), confirm prerequisites (dependencies, tools, permissions, check commands), choose the execution mode | Private plan, public summary and a go or no-go checkpoint | go | router reference. If the plan changes a trust boundary (authentication, permissions, secrets, hooks, external input handling) or has five or more tasks, a reviewer (design perspective) reviews it once |
| 5 | build | Run by mode, confirm failing tests, commit per task | Commits | The plan's tasks are done | router reference, implementer |
| 6 | verify | Confirm the acceptance criteria by actually running them, check behavior per the [execution mode](orchestration.md#execution-modes) | Verification evidence | Each criterion has execution evidence | router reference, execution verification (explorer) per mode |
| 7 | review | Final review per the [execution mode](orchestration.md#execution-modes), handle findings | Findings and their handling | No correctness or requirement defects | `review` reference |
| 8 | ship | push, PR, CI and merge per the integration method, Issue completion and follow-up Issues | Integrated default branch, closed Issue | Integration and closing confirmed | `ship` reference |
| 9 | cleanup | Clean up branches and worktrees | Cleanup record | Cleanup done | `cleanup` reference |
| 10 | learn | Put lessons in the right place | "Learn and memory" below | Only when there is a lesson | router reference; if the destination is a file agents read, [text agents read](documents.md#text-agents-read) |

ship writes the state block as done on the Issue branch and closes the Issue. `local-merge` does this before
integration, `pr-ci` after confirming the merged result. A partial integration with scope left does not close the Issue
and keeps the remaining scope in the state. After the branch is deleted, the Issue can no longer be written, so cleanup
and any learn after it are recorded only in the ledger.

Agent roles in the table follow [roles per host](orchestration.md#models-and-effort). Design and plan reviews are done by the
reviewer in Claude and by the main session in Codex.

## Stages by path

| Path | Stages run |
|---|---|
| spike: only check feasibility | discover → build (throwaway experiment) → report |
| bounded: change an existing flow | start → design (short, in chat, including the prerequisite check) → build → verify → review → ship → cleanup |
| architectural: a new subsystem, a change to a depended-on interface | 1 to 9, and 10 if there is a lesson |

When unsure, classify as the heavier path, and move up when hidden complexity appears. If design shows only 1 or 2 files
change and no interface changes, move down to bounded and record why in the ledger. Measurements show that on small
changes the heavier process does not improve results and only adds cost ([sources](../research/sources.md)).

## Loops

- **Task loop**: for each task in the plan, run build → verify, plus task review in M2 and M3. The next task starts
  again from build. Commit per task and update the ledger. When a fresh context is needed, in interactive work finish
  the [handoff](ledger.md#concurrent-sessions), `/clear` and resume from the resume card; in unattended runs continue as [unattended
  runs](ledger.md#unattended-runs) describes.
- **Wrap-up**: when all tasks are done, verify (all acceptance criteria) → review (final) → ship.
- **Slice loop**: if ship is a partial integration, do not close the Issue; return to build for the remaining acceptance
  criteria. If the work was not in the plan, return to plan.

## Going back

| What happened | Stage to return to | Ask the user? |
|---|---|---|
| A bug in your own change, a failing check, verify not met | build | No |
| Review findings | build → verify. A fix that changed behavior or permissions gets a narrowed re-review; a wording or format fix gets CI ([re-verification](orchestration.md#review)) | No |
| CI failure during integration | Reopen the Issue closed early and set its state back to build | No |
| The plan is wrong (files, order, interface) but the design holds | plan; fix the private plan on the spot | No |
| A design assumption breaks (new constraint, approach not possible) | design → plan; update [current design decisions](../design/current-decisions.md) for long-lived choices | Yes, if the decision is one only the user can make |
| Requirements or acceptance criteria change (the original criteria and results go in a checkpoint) | discover or start; replace the intent with the user-confirmed one through `devflow-state intent` | Yes |
| A new problem outside scope | Reproduced defects and what the user decided to defer go straight to follow-up Issues; the rest goes in the ledger and is proposed all at once at ship | Yes, only for what is proposed |
| push rejected at ship | Reopen the Issue on the Issue branch and set the state back: build for a failing check, ship otherwise | No |
| Blocked by an external factor | Write the blocker and the needed input in the current state and hold only dependent actions. Continue independent work within scope | Only when there is a decision only the user can make or an unapproved effect |
| Hidden complexity (bounded → architectural) | design | Tell the user the path changed |

Automatic fixes within a task follow the [fix loop](orchestration.md#fix-loop). After three failures toward the same goal,
change approach or stop and report.

## eval

Trigger and behavior evals are optional; [eval](eval.md) defines when and how to run them.

## Learn and memory

learn runs only when there is a lesson. A lesson goes where its nature fits.

| Lesson | Where it goes |
|---|---|
| Can be checked by a test | A test. Remove it from AGENTS.md after moving it. Safety floors stay ([documents](documents.md#text-agents-read) item 10) |
| Applies only to one area | That area's spec or document, plus one row in the AGENTS.md document map |
| Repository-wide, repeated twice, not checkable by a test | AGENTS.md Gotchas. Over budget, move less-used items into documents |
| A procedure common to several repositories | A devflow skill. When the skill list changes, [eval](#eval) can optionally be run |
| Personal preference, a rule common to all repositories | The user's global instructions. devflow only proposes |
| History and decision record | Issue checkpoints and git |
| Environment specific to that machine | A private handoff or the host's personal memory. Not in shared instructions |

When editing AGENTS.md, also remove Gotchas that machinery now blocks (except safety floors). The relationship with
memory tools is defined by [documents](documents.md#memory-tools).
