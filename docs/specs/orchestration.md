# Orchestration contract

Defines why work runs the way it does: who writes code, when to delegate, and which model and effort run it. The
procedure lives in the devflow skill: [SKILL.md](../../skills/devflow/SKILL.md) routes into
[Change](../../skills/devflow/references/change.md) for design, plan, build, verification, delegation and review. This
spec keeps the rationale, policy boundaries and host facts delegation and tests rely on.

## Stages and paths

[lifecycle](lifecycle.md) explains stages, paths, loops and going back; the skill states them. Execution modes follow the
path: a spike only runs a throwaway experiment, bounded work builds in M0 or M1, architectural work in M1 to M3.

## Plan

A plan is written so that an engineer who has not seen the conversation can build from it alone, because a wrong plan
costs a page while a wrong build costs the work. Plans are private and not committed to git; the stage-boundary checkpoint
carries their public summary. The procedure is the [plan reference](../../skills/devflow/references/change.md#design-and-plan).

## Build and verification

A change is done only after a check that executes it, because a syntax check or a check that never started proves
nothing. A test not seen failing does not prove the change, and a bug fix keeps its reproduction test as written. There
is no test lock; review reads test changes instead ([rationale](../design/current-decisions.md#instructions-and-protections)).
The procedure is the [build reference](../../skills/devflow/references/change.md#build-and-verify).

## Execution modes

Decisions and writes happen in one place, the main session: when several agents write at once, the unstated decisions in
each one's actions collide. Subagents protect context and verify with fresh eyes. The execution modes and how to choose
by meaning are in [Change](../../skills/devflow/references/change.md#execution-modes).

Workflow is not an execution mode. The user runs it directly, outside devflow ([conditions to
revisit](../design/current-decisions.md#execution-and-delegation)).

Interactive M2 lets the main session make a one- or two-line edit itself, because one delegation (brief, fresh context,
report) costs more than the edit; unattended runs keep a fresh context per task instead. M3 passes `isolation:
"worktree"` on each Claude Agent call, so M2 delegation stays out of worktrees.

## What the main session owns

Issue state, the plan, the ledger, every decision outside a brief's scope, integrating results and final verification,
checkpoints, and confirming permissions and targets with the user. Subagents report; the main session acts.

## Delegation brief

A brief gives a subagent one task with its files, check, exclusions and an end status, so the subagent needs no
conversation history and the main session can judge the report without rereading the work. Its shape is in the
[delegation procedure](../../skills/devflow/references/change.md#delegation). A brief is text agents read, so it is
written in English ([documents](documents.md#text-agents-read) item 9).

## Subagent questions

Subagents do not ask the user directly (Claude Code removes `AskUserQuestion` from subagents), and neither host documents
that a subagent can keep running while it waits for an answer, so it stops with `NEEDS_DECISION` and is resumed: Claude
with `SendMessage`, keeping history and model settings; Codex with a follow-up task to the same agent. The subagent cache
runs with a default 5-minute TTL; if waiting for user answers is frequent, consider raising `subagentPromptCacheTtl` to
`1h`.

## Fix loop

Reproduce a failure before fixing it. The implementation brief caps repeated fixes for the same failing check. The
main session records attempts in ledger `notes` and decides whether to change approach or report the blocker. The
Stop hook tracks unattended continuations in `counts`. See [Build and
verify](../../skills/devflow/references/change.md#build-and-verify) and [Delegation](../../skills/devflow/references/change.md#delegation).

## Review

The final review runs in a fresh context without the expected verdict, because a reviewer told the answer confirms it,
and reports only defects that affect correctness and requirements. Weakening a test to make it pass, when neither the
requirement nor the expectation changed, is a defect
([rationale](../design/current-decisions.md#instructions-and-protections)). A design that moves a trust boundary is
reviewed before planning by a reviewer trying to break it, and a claimed bypass is confirmed with the real renderer or
command, not by argument. Reviewers only report; no simplification agent edits code during review. Rules another plugin
injects into subagents reach devflow's agents too: they run as `general-purpose`, so no matcher can single them out
([rationale](../design/current-decisions.md#execution-and-delegation)). The procedure is the
[review reference](../../skills/devflow/references/change.md#review) and, for designs, the
[design reference](../../skills/devflow/references/change.md#design-and-plan).

## Models and effort

The host supplies model and effort defaults for the main session and its workers. An explicit user choice can override
those defaults when the runtime supports it. [Change](../../skills/devflow/references/change.md#delegation) routes
work by evidence and permissions and records only confirmed overrides.

In Claude Code, the `model` (aliases only) and `effort` given at call time take precedence over the session's model and
effort, except that `CLAUDE_CODE_EFFORT_LEVEL` overrides the call's `effort` ([host-facts](../research/host-facts.md)).
In Codex, the model and effort given at spawn take precedence over the defaults, but the host's current tool
instructions may limit what can be set. Read-only roles in Codex are kept only by instruction: a custom agent's
`sandbox_mode` cannot narrow the parent sandbox ([host-facts](../research/host-facts.md#codex)).

The [delegation reference](../../skills/devflow/references/change.md#delegation) specifies scoped implementation and independent read-only review. A brief carries the task permissions and evidence required to decide its result. Apply a focused review perspective when risk warrants it.

The plugin ships no agent definitions. Claude Code runs every role on `general-purpose` with the brief, and Codex on
`spawn_agent`, so each host has one delegation path. Explore and Plan are not
used: they start without the project instructions. Tool lists, `disallowedTools` and `maxTurns` exist only in a Claude
agent definition and no Codex spawn sets a tool or sandbox limit, so the roles' limits (the reviewer reads only, the
explorer changes no files, the implementer spawns no agents) hold by instruction. The main session's check before and
after every explorer and reviewer, `devflow-state delegation-check`, catches the effects it can see: `before` reads the
git layout with git while no agent has run, and `after` runs no git and opens only recorded paths and new entries
beneath recorded folders, through a guard that follows no changed link and refuses network paths, because git run after
the agent could start a program the agent planted. It is a tripwire, not isolation
([rationale](../design/current-decisions.md#execution-and-delegation)).

### Promotion

The main session can change the execution mode when the task's scope and evidence warrant it. Record the reason in
the ledger. Model and effort still follow the host or a supported user override.

## The two hosts

| Mechanism | Claude Code | Codex |
|---|---|---|
| Delegated agents | `general-purpose` with the brief and a set model and effort; role limits by instruction | `spawn_agent` with the brief, `fork_turns: "none"`, and the model and effort set where the host and its instructions allow, else inherited and reported; an agent type only where the spawn tool offers one ([host-facts](../research/host-facts.md#codex)). The default `"all"` passes on the parent conversation |
| Resume card, unattended continuation, session release | [hooks](hooks.md#registered-events) | same file |

Codex's SessionEnd does not run in subagents. A session that ended without the hook running expires after 30 minutes
([concurrent sessions](ledger.md#concurrent-sessions)).
