# devflow overview

devflow is a personal development loop shared by Claude Code and Codex. **Adopted Issue intent defines requirements,
a validated ledger controls execution, one coordinator owns decisions/integration, and scoped workers and evidence
support acceptance.**
One repository is the single source of the plugin for both hosts.

What devflow is not: a system that forces skills on every task, a team approval process, or a framework that replaces
model judgment.

## Principles

1. **One owner for each fact.** Issue intent/criteria are the requirements reference; public stage is a projection. The
   validated local ledger owns execution and evidence pointers. Resume reconciles identity, scope and actual Git/provider
   state, including human intent edits. Reason: [State
   and resume](current-decisions.md#state-and-resume)
2. **One coordinator, bounded workers.** The main session owns shared state and integration. Workers implement or
   inspect scoped tasks; independent review uses fresh context. M2 accepts serially; M3 launches independent tasks in
   parallel and integrates serially with revalidation. Reason: [Execution
   and delegation](current-decisions.md#execution-and-delegation)
3. **Guards match their actual boundary.** Skills/review handle judgment; the helper validates protected state and
   supported effect inputs, and CI/tests enforce their gates. Neither role prompts nor same-user CLI guards are an OS
   sandbox. Reason: [Instructions and
   protections](current-decisions.md#instructions-and-protections)
4. **Short instructions.** A router skill and references, size budgets. The trigger eval is run optionally when
   invocation fields change ([eval](../specs/eval.md)).
5. **People only at gates.** Once the scope is set, work proceeds to the end and asks only about effects not covered by
   existing user authority and decisions only the user can make.

## Layers

| Layer | Holds | Claude Code | Codex | Enforcement |
|---|---|---|---|---|
| Global instructions | Safety, authority | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | Guidance |
| Project AGENTS.md | Facts, commands, document map, boundaries | Loaded directly if there is no CLAUDE.md | Loaded | Guidance |
| Skills | Procedures | Plugin `skills/` | Same folder | Guidance |
| Workers | Scoped implementation, checks or static review | Selected host adapter | Selected host adapter | Actual host controls are distinct from role instructions and the before/after tripwire |
| Hooks | Resume and sessions | `hooks/hooks.json` | `hooks/hooks.json` | Do not block. Only the resume card, unattended continuation and session release |
| Scripts | Protected execution record, Issue I/O, evidence and resume card | Trusted `Tool:` entry | Same entry contract | Identity/version/evidence guards and filtered supported effects; no claim to prevent direct same-user bypass |
| git hooks, CI | Final gate | Common | Common | Deterministic |
| eval | Regressions in skill invocation and stage behavior (optional) | `claude plugin eval`, skill-creator | No runner | Measurement |

## Stages

discover → start → design → plan → build → verify → review → ship → cleanup → learn: 10 stages.

- Depending on the path (spike, bounded, architectural), only some of them run.
- Task checks/acceptance are separate from whole-delivery verification/review and full Issue completion.
- When new information appears, work goes back to a set stage.

Stages, repetition, going back: the devflow skill ([why](../specs/lifecycle.md)). Execution: the devflow skill
([why](../specs/orchestration.md)).
Document format and budgets: [documents](../specs/documents.md).

## Components

- **5 skills**
  - `devflow`: the one lifecycle skill. Its SKILL.md holds scope, Issue I/O, the stop conditions and a situation ->
    reference table, and directly links all 18 references in [`skills/devflow/references/`](../../skills/devflow/references/):
    ten stages, sessions, contracts, delegation, three roles and two host adapters. Fresh context reads the core,
    contracts and current stage; initialization/migration or resume adds sessions, and delegation adds one role/perspective
    and the selected host. Tracked mutation/acceptance uses protected state. It serves only repositories
    with `.devflow.json`. Choice and reason: [Entry
    points and stages](current-decisions.md#entry-points-and-stages).
  - Independent skills: `decision-interview`, `write-prompts`, `audit-prompts`, `agent-instruction-design`. The lifecycle does not invoke them, and they are used on their own in any repository. Reason: [Independent skills](current-decisions.md#independent-skills).
  - Compatibility: the former `development-start`, `pr-review-workflow` and `workspace-cleanup` skills are gone, with
    their `/` commands. Their requests go to `devflow` in a devflow repository, and repositories without
    `.devflow.json` no longer get them.
- **Roles**: separate explorer (bounded reads/named execution), reviewer (static inspection) and implementer (bounded
  edits) references share one delegation envelope. One perspective is selected per worker. Fresh tasks/reviews receive
  only necessary context; reuse is limited to repair of the same task. The plugin ships no agent definitions. Actual
  model/tool/worktree mapping lives in the selected host adapter ([why](current-decisions.md#execution-and-delegation)).
- **Claude Workflows**: devflow does not ship them and does not keep them as an execution mode. The user runs them
  directly outside devflow ([execution modes](../specs/orchestration.md#execution-modes))
- **Hooks**: resume card (SessionStart), continuation in unattended mode only (Stop), release when the session ends
  (SessionEnd; if it does not run, expiry after 30 minutes).
  Pre-integration verification follows the integration method in [repository](../specs/repository.md#integration-and-ci).
- **Scripts**: `devflow-state` handles protected execution state, Issue I/O, the card and supported evidence/effect
  operations. The review-package helper uses controlled original-object reading of a caller-owned clean snapshot;
  exact-SHA conditional deletion preserves a remote ref that no longer matches the reviewed tip.
- **Templates and eval**: Issue intent, REVIEW.md, AGENTS.md, ignore and attributes blocks, trigger eval

Reason for the layout and the single source: [Single source](current-decisions.md#single-source).
