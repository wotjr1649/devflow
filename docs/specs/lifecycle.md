# Lifecycle contract

Explains the shape of the lifecycle and why it is shaped so: one router, ten stages, three paths, loops and going back.
The rules the executor follows live in the devflow skill, which owns them: [SKILL.md](../../skills/devflow/SKILL.md)
(card handling, stages and paths, going back, where to read) and one reference per stage, each opening with its done
condition. This spec keeps the reasons and the stage values the ledger and `devflow-state` check. How work runs inside a
stage is explained by [orchestration](orchestration.md).

## Router

- One entry point, the `devflow` skill, takes new work, resuming, stage moves, review, PR and merge, and cleanup in a
  repository with `.devflow.json`. One description then covers the whole lifecycle, so no other skill competes for
  these requests.
- Each stage reads its reference in `skills/devflow/references/`, one level below the skill and linked from SKILL.md
  ([skill references](documents.md#skill-references)), because a file reached through another file is often read only
  in part.
- A new work request goes through start even when a card shows another Issue, because start decides the path; a spike,
  or work whose problem and acceptance criteria are not confirmed, goes to discover
  ([rationale](../design/current-decisions.md#entry-points-and-stages)).
- Without a valid card no Issue is read or written and the `devflow-state` path is never searched for, because a path
  found in repository files could run code the user did not choose ([resume card](issues.md#resume-card)).
- A review-only request stays a review, because merging and deletion need their own request.
- After compaction or an uncertain context boundary, reload the router's minimal contract and the current reference.
  Host retention differs; a known file version does not prove its contents survived in context.

## User navigation

To the user, the position is explained with five milestones (Direction, Preparation, Increment, Acceptance, Delivery)
rather than ten stages, with the status shown apart from the name. A milestone is met only with exit evidence, never
because its stage was entered, so the user is not told work is further along than it is. Milestones are not a new
stored state, approval gate or Issue posting cycle: they are read from the Issue, ledger, plan and Git. The executor's
rules are in the [sessions reference](../../skills/devflow/references/sessions.md#progress-and-returns).

## Stages

The ten stages remain discover, start, design, plan, build, verify, review, ship, cleanup and learn, with `done` as a
completion state. The bound ledger owns the execution stage. The Issue's `단계` projects public progress and may lag a
task loop; a newer human change to intent still requires reconciliation. Versioned control operations validate named
stages and permitted returns; a legacy lowercase string is not evidence that a transition is valid.
Each stage's responsibility and done condition opens its reference in `skills/devflow/references/`.

ship distinguishes task completion, delivery completion and whole-Issue completion. Close only after the applicable
integration, release or explicitly agreed local-artifact gate has been observed, and before deleting the Issue branch.
For `push-on-request`, record exactly whether the agreed gate is local integration or an authorized remote push; never
label unpushed work as remotely delivered. Required successors and all remaining criteria must be accounted for before
whole-Issue closure. A partial integration leaves the Issue and its remaining required scope open. The runtime currently attests merge/fast-forward integration into actual main. Other explicitly agreed artifact gates
need a supported evidence adapter before automated closure; the helper does not infer equivalence or silently change
the agreed gate. Cleanup and any learn after branch deletion remain ledger-only; do not close early merely to fit the branch-bound write command.

## Stages by path

Three paths (spike, bounded, architectural) run different subsets of the stages; the subsets are in
[SKILL.md](../../skills/devflow/SKILL.md#stages-and-paths). When unsure, the heavier path is taken, and a design that
touches one or two files with no interface change moves down to bounded. Choose proportionate checks from the actual
contract and risk; additional planning or delegation needs a concrete purpose rather than a file-count ritual.

## Loops

- **Task loop**: each planned task defines local checks and the stable Issue criteria it contributes to. Build → verify
  proves those local checks, plus task review in M2 and M3, then commit and update the ledger. An intermediate storage
  task need not prove an end-to-end form that the next task will build; its local pass does not check that Issue AC.
  A fresh context comes from a handoff and `/clear` in interactive work, and from an implementer per task in
  [unattended runs](ledger.md#unattended-runs).
- **M3 batch**: one active integration task contains separately registered, isolated work units with fixed file
  ownership, original bases, local checks and result/proof contracts. Independent units may run concurrently. The parent
  collects results and confirmed exits, integrates serially and verifies the combined task candidate before advancing.
  Dependent tasks and units wait for the prerequisite result; concurrency does not remove their evidence barrier.
- **Wrap-up**: after the last task, verify this delivery's criteria and affected regressions → final delivery review →
  ship. Final review uses the delivery baseline, not the last task's base.
- **Slice loop**: a partial integration does not close the Issue; the work returns to build for the remaining criteria,
  or to plan when that work was not planned.

## Delivery scope and evidence

A delivery identifies its approved criterion IDs and definition revisions, task IDs and original/review baselines.
Starting a task changes only its task base. A new partial delivery has its own identity; creating one is not a recovery
method for an unknown earlier delivery. Rebaselining records an explicit change after recovering the complete scope and
invalidates affected review evidence. Never guess a delivery baseline from a v1 task base or `HEAD~1`.

Task-local checks, delivery acceptance criteria, whole-Issue closure and cleanup predicates are independent. Earlier delivery evidence must still apply after
later code or criterion changes before the whole Issue can close. Checkboxes are a public projection of evidence, not
the evidence itself. Stable criterion IDs reach the actual check/intent/close operations; list positions are display.

Execution evidence binds scope, code or dirty snapshot, actual command and environment, outcome and source. Static
review is not execution, supplied claims do not become observed runs when copied, and hashes identify bytes rather
than prove a run. Missing required evidence stays unverified while independent authorized work may continue.

## Going back

New information sends work back to the stage that can absorb it, and the user is asked only for decisions only they can
make, changed intent or acceptance, and out-of-scope items proposed to them, because each question costs the user a turn
while a return for a self-made defect needs no permission. The destinations are in
[SKILL.md](../../skills/devflow/SKILL.md#stages-and-paths).

## eval

Trigger and behavior evals are optional; [eval](eval.md) defines when and how to run them.

## Learn and memory

learn runs only when there is a lesson, and a lesson goes where its nature fits: a test when a test can check it, the
document of the area it applies to, AGENTS.md Gotchas for a repeated repository-wide lesson, a skill for a procedure
shared across repositories, the user's global instructions (proposed only) for a personal preference, Issue checkpoints
and git for history, private notes for one machine. Safety floors stay as prose
([documents](documents.md#text-agents-read) item 10). The executor's rules are in the
[learn reference](../../skills/devflow/references/learn.md). The relationship with memory tools is defined by
[documents](documents.md#memory-tools).
