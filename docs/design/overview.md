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
3. **Guide work and enforce scoped boundaries.** Skills guide the workflow. Hooks route requests, manage sessions and restrict
   tool calls during an assigned document revision. Host permissions govern the remaining execution surfaces. Independent review
   checks behavior and test preservation, and CI enforces the final verification gate. Reason: [Instructions and
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
| Agents | Isolated work | `general-purpose` with the brief | `spawn_agent` with the brief | Role limits are instructions; the main session's before-and-after check around each explorer and reviewer catches visible effects and is not isolation |
| Hooks | Session state, request routing and assigned revisions | `hooks/hooks.json` | `hooks/hooks.json` | `PreToolUse` restricts tools during assigned document revisions. The host controls other execution |
| Scripts | Ledger, Issue I/O, resume card | `bin/devflow-state` | Skills run it by path | Public text filter. Does not block posting that bypasses it |
| git hooks, CI | Final gate | Common | Common | Deterministic |
| eval | Regressions in skill invocation and stage behavior (optional) | `claude plugin eval`, skill-creator | No runner | Measurement |

## Stages

discover → start → design → plan → build → verify → review → ship → cleanup → learn: 10 stages.

- Depending on the path (spike, bounded, architectural), only some of them run.
- build, verify and review repeat for each task in the plan.
- When new information appears, work goes back to a set stage.

Stages, repetition, going back: the devflow skill ([why](../specs/lifecycle.md)). Execution: the devflow skill
([why](../specs/orchestration.md)).
Document format and budgets: [documents](../specs/documents.md).

## Components

- **5 skills**
  - `devflow`: the one lifecycle skill. Its SKILL.md holds scope, Issue I/O, stop conditions, and routes actions to
    Change, Resume, or Delivery in [`skills/devflow/references/`](../../skills/devflow/references/). A project with
    `.devflow.json` uses Issue tracking; other projects can use local records for
    consequential changes and handoffs. Choice and reason: [Entry
    points and stages](current-decisions.md#entry-points-and-stages).
  - Independent skills: `decision-interview`, `write-prompts`, `audit-prompts`, `agent-instruction-design`. The lifecycle does not invoke them, and they are used on their own in any repository. Reason: [Independent skills](current-decisions.md#independent-skills).
  - [Moving from v0.4.0](../../README.md#moving-from-v040) maps the old commands to the current routes.
- **Delegation**: the Change reference defines scoped briefs for research, review, and implementation. Each brief
  carries its task permissions, files, and verification criteria. Claude Code uses `general-purpose`,
  Codex on `spawn_agent` ([why](current-decisions.md#execution-and-delegation)).
  Models and effort follow the host or an explicit user override ([why](../specs/orchestration.md#models-and-effort)).
- **Claude Workflows**: devflow does not ship them and does not keep them as an execution mode. The user runs them
  directly outside devflow ([execution modes](../specs/orchestration.md#execution-modes))
- **Hooks**: SessionStart for resume or assignment context, UserPromptSubmit for routing, PreToolUse for the assigned
  document boundary, Stop for bounded unattended continuation, and SessionEnd for release. The [hook contract](../specs/hooks.md)
  describes what each event can enforce.
  Pre-integration verification follows the integration method in [repository](../specs/repository.md#integration-and-ci).
- **Scripts**: `devflow-state` handles the ledger, Issue I/O, resume cards and assigned-change verification.
  `devflow-stage` prepares an exact reviewed commit for a local plugin install.
- **Templates and eval**: Issue intent, REVIEW.md, AGENTS.md, ignore and attributes blocks, trigger eval

Reason for the layout and the single source: [Single source](current-decisions.md#single-source).
