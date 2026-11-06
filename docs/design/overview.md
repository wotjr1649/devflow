# devflow overview

devflow is a personal development loop shared by Claude Code and Codex: **Issues hold approved intent, a bound local
ledger records execution, one main session owns integration, and independent review and actual checks verify results**.
One repository is the single source of the plugin for both hosts.

What devflow is not: a system that forces skills on every task, a team approval process, or a framework that replaces
model judgment.

## Principles

1. **A source for each fact.** The Issue owns intent and public checkpoints, the ledger owns execution phase, and a
   versioned delivery binds scope and baseline. Resume validates their identities before dependent action. Reason: [State
   and resume](current-decisions.md#state-and-resume)
2. **Decisions and writes in one place, judgment support in many.** The main session writes, and subagents handle
   context protection and verification from a fresh viewpoint. Delegation widens only with evidence. Reason: [Execution
   and delegation](current-decisions.md#execution-and-delegation)
3. **Code for exact contracts, judgment for meaning.** The helper checks identity, transitions and safe input/output;
   hooks handle resume and sessions, and review judges sufficiency. These are not a same-user security sandbox. Reason: [Instructions and
   protections](current-decisions.md#instructions-and-protections)
4. **Exact scope with selective reading.** The router selects the needed stage and role. Editing budgets preserve
   required authority, identity and evidence. Invocation and behavior are evaluated separately from measured usage
   ([eval](../specs/eval.md)).
5. **People only at gates.** Once the scope is set, work proceeds to the end and asks only about effects not covered by
   existing user authority and decisions only the user can make.

## Layers

| Layer | Holds | Claude Code | Codex | Enforcement |
|---|---|---|---|---|
| Global instructions | Safety, authority | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | Guidance |
| Project AGENTS.md | Facts, commands, document map, boundaries | Loaded directly if there is no CLAUDE.md | Loaded | Guidance |
| Skills | Procedures | Plugin `skills/` | Same folder | Guidance |
| Agents | Isolated work | `general-purpose` with the brief | `spawn_agent` with the brief | Role limits are instructions; the main session's before-and-after check around each explorer and reviewer catches visible effects and is not isolation |
| Hooks | Resume and sessions | `hooks/hooks.json` | `hooks/hooks.json` | Do not block. Only the resume card, unattended continuation and session release |
| Scripts | Bound execution, delivery scope, Issue I/O, safe review material | `bin/devflow-state` | Skills run it by trusted path | Entry-point contract checks; no global control over arbitrary processes |
| git hooks, CI | Final gate | Common | Common | Deterministic |
| eval | Regressions in skill invocation and stage behavior (optional) | `claude plugin eval`, skill-creator | No runner | Measurement |

## Stages

discover → start → design → plan → build → verify → review → ship → cleanup → learn: 10 stages.

- Depending on the path (spike, bounded, architectural), only some of them run.
- build, task-local verification and review repeat for each task in the plan. An M3 integration task may contain
  independent parallel work units, followed by serial integration and combined verification.
- When new information appears, work goes back to a set stage.

Stages, repetition, going back: the devflow skill ([why](../specs/lifecycle.md)). Execution: the devflow skill
([why](../specs/orchestration.md)).
Document format and budgets: [documents](../specs/documents.md).

## Components

- **5 skills**
  - `devflow`: the one lifecycle skill. Its SKILL.md holds scope, Issue I/O, the stop conditions and a situation ->
    reference table, and links its references in [`skills/devflow/references/`](../../skills/devflow/references/):
    discover, start, design, plan, build, verify, review, ship, cleanup, learn, sessions, delegation and three role
    contracts. The router names each selected contract directly. It serves repositories with `.devflow.json`. Choice and reason: [Entry
    points and stages](current-decisions.md#entry-points-and-stages).
  - Independent skills: `decision-interview`, `write-prompts`, `audit-prompts`, `agent-instruction-design`. The lifecycle does not invoke them, and they are used on their own in any repository. Reason: [Independent skills](current-decisions.md#independent-skills).
  - Compatibility: the former `development-start`, `pr-review-workflow` and `workspace-cleanup` skills are gone, with
    their `/` commands. Their requests go to `devflow` in a devflow repository, and repositories without
    `.devflow.json` no longer get them.
- **Roles**: separate role references hold their boundaries and perspectives; every fresh brief
  carries the selected role contract and at most one perspective, on both hosts. `explorer` (reads and runs commands): search by
  default, summary, root cause, verification. `reviewer` (reads only): correctness by default, design, security.
  `implementer` (edits). The plugin ships no agent definitions: Claude Code runs every role on `general-purpose`,
  Codex on `spawn_agent` ([why](current-decisions.md#execution-and-delegation)).
  Models, effort and promotion use the actual host capability and applicable user preferences
  ([why](../specs/orchestration.md#models-and-effort)).
- **Claude Workflows**: devflow does not ship them and does not keep them as an execution mode. The user runs them
  directly outside devflow ([execution modes](../specs/orchestration.md#execution-modes))
- **Hooks**: resume card (SessionStart), continuation in unattended mode only (Stop), release when the session ends
  (SessionEnd; if it does not run, expiry after 30 minutes).
  Pre-integration verification follows the integration method in [repository](../specs/repository.md#integration-and-ci).
- **Scripts**: `devflow-state` handles execution state, Issue I/O and the resume card; trusted review material binds the
  correct delivery or task baseline, original Git objects and relevant dirty inputs. Raw diff commands are not assumed
  free of configured execution effects. The [evidence contract](../specs/evidence.md) owns receipt applicability;
  the [execution adapter](../specs/execution.md) owns local process completion and its explicitly limited host profile.
- **Templates and eval**: Issue intent, REVIEW.md, AGENTS.md, ignore and attributes blocks, trigger eval

Reason for the layout and the single source: [Single source](current-decisions.md#single-source).
