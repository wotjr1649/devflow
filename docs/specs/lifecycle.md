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
- After compaction the router is called again and the current stage's reference reread, because the body of an invoked
  skill is reattached after compaction but reference files are not.

## User navigation

To the user, the position is explained with five milestones (Direction, Preparation, Increment, Acceptance, Delivery)
rather than ten stages, with the status shown apart from the name. A milestone is met only with exit evidence, never
because its stage was entered, so the user is not told work is further along than it is. Milestones are not a new
stored state, approval gate or Issue posting cycle: they are read from the Issue, ledger, plan and Git. The executor's
rules are in the [sessions reference](../../skills/devflow/references/sessions.md#progress-and-returns).

## Stages

The ledger's `stage` and the state block's `단계` take one of the ten stages or `done`: discover, start, design, plan,
build, verify, review, ship, cleanup, learn, then `done` after ship. Each stage's responsibility and done condition are
the opening of its reference in `skills/devflow/references/`.

ship writes the state block as done on the Issue branch and closes the Issue. `local-merge` and `push-on-request` do this
before integration, `pr-ci` after confirming the merged result. A partial integration with scope left does not close the
Issue and keeps the remaining scope in the state. After the branch is deleted, the Issue can no longer be written, so
cleanup and any learn after it are recorded only in the ledger.

## Stages by path

Three paths (spike, bounded, architectural) run different subsets of the stages; the subsets are in
[SKILL.md](../../skills/devflow/SKILL.md#stages-and-paths). When unsure, the heavier path is taken, and a design that
touches one or two files with no interface change moves down to bounded. Measurements show that on small changes the
heavier process does not improve results and only adds cost ([sources](../research/sources.md)).

## Loops

- **Task loop**: each planned task runs build → verify, plus task review in M2 and M3, and is committed with the ledger
  updated. A fresh context comes from a handoff and `/clear` in interactive work, and from an implementer per task in
  [unattended runs](ledger.md#unattended-runs).
- **Wrap-up**: after the last task, verify (all acceptance criteria) → review (final) → ship.
- **Slice loop**: a partial integration does not close the Issue; the work returns to build for the remaining criteria,
  or to plan when that work was not planned.

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
