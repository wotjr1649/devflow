# devflow overview

devflow is a personal development loop shared by Claude Code and Codex in which **GitHub Issues serve as memory, one
main agent decides and writes code, subagents read and verify, and review and CI check the results**.
One repository is the single source of the plugin for both hosts.

What devflow is not: a system that forces skills on every task, a team approval process, or a framework that replaces
model judgment.

## Principles

1. **Memory in the Issue.** State lives in the Issue body's state block and checkpoint comments, and per-task progress
   lives in the local ledger. After a compact or a session change, one resume card continues the work. Reason: [State
   and resume](current-decisions.md#state-and-resume)
2. **Decisions and writes in one place, judgment support in many.** The main session writes, and subagents handle
   context protection and verification from a fresh viewpoint. Delegation widens only with evidence. Reason: [Execution
   and delegation](current-decisions.md#execution-and-delegation)
3. **Work through instructions and review, with no blocking mechanisms.** Skills guide, hooks handle only resume and
   sessions, review looks at defects and test changes, and CI blocks last with tests. Reason: [Instructions and
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
| Agents | Isolated work, tool limits | Plugin `agents/` | Built-in explorer, worker | The Claude reviewer gets read tools only. Reporting roles with shell tools and Codex report-only roles are instructions, not file system isolation |
| Hooks | Resume and sessions | `hooks/hooks.json` | `hooks/hooks.json` | Do not block. Only the resume card, unattended continuation and session release |
| Scripts | Ledger, Issue I/O, resume card | `bin/devflow-state` | Skills run it by path | Public text filter. Does not block posting that bypasses it |
| git hooks, CI | Final gate | Common | Common | Deterministic |
| eval | Regressions in skill invocation and stage behavior (optional) | `claude plugin eval`, skill-creator | No runner | Measurement |

## Stages

discover → start → design → plan → build → verify → review → ship → cleanup → learn: 10 stages.

- Depending on the path (spike, bounded, architectural), only some of them run.
- build, verify and review repeat for each task in the plan.
- When new information appears, work goes back to a set stage.

Stages, repetition, going back: [lifecycle](../specs/lifecycle.md). Execution: [orchestration](../specs/orchestration.md).
Document format and budgets: [documents](../specs/documents.md).

## Components

- **8 skills**
  - `devflow`: the router. Stages without a dedicated skill live in [`references/`](../../skills/devflow/references/) at the plugin root. Why several skills read them together is in [Entry points and stages](current-decisions.md#entry-points-and-stages).
  - Lifecycle skills: `development-start`, `pr-review-workflow`, `workspace-cleanup`
  - Independent skills: `decision-interview`, `write-prompts`, `audit-prompts`, `agent-instruction-design`. The lifecycle does not invoke them, and they are used on their own in any repository. Reason: [Independent skills](current-decisions.md#independent-skills).
  - Choice and reason: [Entry points and stages](current-decisions.md#entry-points-and-stages).
- **Claude agents**: 3 definitions split by tools (explorer, reviewer, implementer). The brief sets the role's
  perspective (exploration, summarizing, root-cause analysis, verification, design, security). Models, effort,
  promotion: [orchestration](../specs/orchestration.md#models-and-effort)
- **Claude Workflows**: devflow does not ship them and does not keep them as an execution mode. The user runs them
  directly outside devflow ([execution modes](../specs/orchestration.md#execution-modes))
- **Hooks**: resume card (SessionStart), continuation in unattended mode only (Stop), release when the session ends
  (SessionEnd; if it does not run, expiry after 30 minutes).
  Pre-integration verification follows the integration method in [repository](../specs/repository.md#integration-and-ci).
- **Scripts**: `devflow-state` handles the ledger, Issue I/O and the resume card. The BASE..HEAD diff file passed to review (`review-package`) is made with `git diff` by pr-review-workflow's review reference.
- **Templates and eval**: Issue intent, REVIEW.md, AGENTS.md, ignore and attributes blocks, trigger eval

Reason for the layout and the single source: [Single source](current-decisions.md#single-source).
