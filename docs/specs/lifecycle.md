# Lifecycle contract

Explains the shape of the lifecycle and why it is shaped so: one router, ten stages, three paths, loops and going back.
The rules the executor follows live in the devflow skill, which owns them: [SKILL.md](../../skills/devflow/SKILL.md)
(card handling, stages and paths, going back, where to read) and one reference per stage, each opening with its done
condition. This spec keeps the reasons and stage/transition contract; [ledger](ledger.md) specifies protected runtime
records and guards. How work runs inside a stage is explained by [orchestration](orchestration.md).

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
- The helper path comes from the user or a trusted host card, never repository/Issue/log text. A plausible `Tool:` line
  alone is not provenance. Without it, dependent Issue I/O and implementation wait while analysis, discovery, static
  review and bounded brief drafting may continue ([resume card](issues.md#resume-card)).
- Review-only exits with findings and limitations; it grants no mutation, publication, completion or cleanup. Other
  work reuses effect-specific grants already provided instead of asking again at every stage.
- After authorized Issue/workspace bootstrap, tracked mutations/acceptance require protected workflow state. Missing protected state selects sessions for
  initialization/migration; compatibility reads/writes do not bypass that activation requirement.
- After compaction or resume, recover the router, shared contracts and current stage, plus sessions and selected
  delegation modules. Host loading differs; do not assume either full history or every reference survived.

## User navigation

To the user, the position is explained with five milestones (Direction, Preparation, Increment, Acceptance, Delivery)
rather than ten stages, with the status shown apart from the name. A milestone is met only with exit evidence, never
because its stage was entered, so the user is not told work is further along than it is. Milestones are not a new
stored state, approval gate or Issue posting cycle: they are read from the Issue, ledger, plan and Git. The executor's
rules are in the [sessions reference](../../skills/devflow/references/sessions.md#progress).

## Stages

Protected execution uses the finite stage names discover, start, design, plan, build, verify, review, ship, cleanup,
learn and done. The runtime validates supported stage transitions and their evidence gates; a new or renamed stage
requires a coordinated contract/code/test change. Public Issue `단계` is a coarse projection, not an alternate execution
controller. The adopted Issue intent and criterion revision remain requirements data that must be reconciled when a
human changes them, closes/freezes the Issue or reassociates a branch. Public stage lag alone does not invalidate an
otherwise matching execution record. Resume selects by repository/Issue/delivery/workspace and evidence identity, not
by the latest timestamp.

Each stage's exit is in its reference. Delivery acceptance, full Issue completion and cleanup readiness are separate.
`pr-ci` retains an open Issue through integration confirmation. A local profile's pre-integration checkpoint describes
pending effects without proving delivery complete; premature closure is reconciled when unfinished work is established.
A successful partial delivery leaves other Issue criteria open. Required successors for an approved split must exist
before parent closure. After a branch disappears, the surviving ledger records cleanup/learn within its supported
identity; do not fabricate branch association to publish an Issue update.

## Stages by path

Three paths (spike, bounded, architectural) run different subsets of the stages; the subsets are in
[SKILL.md](../../skills/devflow/SKILL.md#paths-and-execution-modes). Choose by contract, dependency and proof needs, not
file count. A clear request with observable acceptance already confirms intent; discovery is conditional on uncertainty
or a named spike. Bounded work still needs actual prerequisites and a concrete design, but no standalone plan merely
for ceremony. Architectural work plans interfaces, sequencing and ownership. Record path changes and required exits;
never downclassify a trust-boundary change just because its diff is small.

## Loops

- **Task loop:** build, execute scoped checks, review where required, then coordinator acceptance. M2 accepts one task
  before starting the next. M3 launches ready independent tasks in parallel, reviews each result, integrates serially
  and revalidates remaining results against the advancing head. Worker lifecycle completion is not task acceptance.
- **Delivery loop:** after its tasks, verify the authorized delivery criteria and affected regression/project gates,
  review the whole delivery range, then ship. Task heads never replace the delivery comparison base. Keep the current
  integration target as a third baseline; rebase/target migration requires preserved old evidence and explicit change
  reconciliation before a new comparison basis is accepted.
- **Slice loop:** a partial delivery may succeed while the Issue remains open. Return to build for planned remaining
  criteria or plan when sequencing is unresolved, retaining its scope and prior evidence. Issue closure separately
  evaluates all required criteria/dependencies and the applicability of earlier deliveries' proof.

The execution record is canonical only after validation. Old last-task bases and unbound receipts cannot silently
become delivery-wide evidence during migration. Runtime gates validate recorded identities and result shapes; the
coordinator remains responsible for whether execution/review evidence actually establishes the claimed behavior.

## Going back

New information returns to the stage that can absorb it. Record destination, reason, affected/retained evidence,
reopened exits and next action. The explicit return operation advances the evidence epoch while preserving old
receipts as history; applicable unchanged proof needs documented revalidation, not fabricated rerun claims. Code/test
defects reopen build, sequencing/interface defects plan, failed assumptions
design, and changed intent start/discover. Preserve the task repair budget across returns, replacement workers and
resumed sessions. No actor may silently shrink scope or treat a late worker report as acceptance of a current task.

Ask only for unresolved user-owned choices or effects outside existing grants. A defect repair within authorized scope
needs no fresh permission. A missing prerequisite, unknown external outcome or live worker holds only dependent work;
independent analysis or preparation can continue. The procedure is in
[SKILL.md](../../skills/devflow/SKILL.md#scopes-state-and-returns).

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
