# Orchestration contract

Defines why work runs the way it does: who writes code, when to delegate, and which model and effort run it. The
procedure the executor follows lives in the devflow skill, which owns it: [SKILL.md](../../skills/devflow/SKILL.md)
(Delegation, Execution modes, Roles) and its [plan](../../skills/devflow/references/plan.md),
[build](../../skills/devflow/references/build.md), [review](../../skills/devflow/references/review.md) and
[design](../../skills/devflow/references/design.md) references. This spec keeps the reasons, the policy the skill does
not apply at run time, and the host facts agent definitions and tests rely on.

## Stages and paths

[lifecycle](lifecycle.md) explains stages, paths, loops and going back; the skill states them. Execution modes follow the
path: a spike only runs a throwaway experiment, bounded work builds in M0 or M1, architectural work in M1 to M3.

## Plan

A plan is written so that an engineer who has not seen the conversation can build from it alone, because a wrong plan
costs a page while a wrong build costs the work. Plans are private and not committed to git; the stage-boundary checkpoint
carries their public summary. The procedure is the [plan reference](../../skills/devflow/references/plan.md).

## Build and verification

A change is done only after a check that executes it, because a syntax check or a check that never started proves
nothing. A test not seen failing does not prove the change, and a bug fix keeps its reproduction test as written. There
is no test lock; review reads test changes instead ([rationale](../design/current-decisions.md#instructions-and-protections)).
The procedure is the [build reference](../../skills/devflow/references/build.md).

## Execution modes

Decisions and writes happen in one place, the main session: when several agents write at once, the unstated decisions in
each one's actions collide. Subagents protect context and verify with fresh eyes. The execution modes and how to choose
by meaning are in [SKILL.md](../../skills/devflow/SKILL.md#execution-modes).

Workflow is not an execution mode. The user runs it directly, outside devflow ([conditions to
revisit](../design/current-decisions.md#execution-and-delegation)).

Interactive M2 lets the main session make a one- or two-line edit itself, because one delegation (brief, fresh context,
report) costs more than the edit; unattended runs keep a fresh context per task instead. M3 passes `isolation:
"worktree"` on each Claude Agent call rather than in the agent definition, which would move M2 delegation into worktrees
too.

## What the main session owns

Issue state, the plan, the ledger, every decision outside a brief's scope, integrating results and final verification,
checkpoints, and confirming permissions and targets with the user. Subagents report; the main session acts.

## Delegation brief

A brief gives a subagent one task with its files, check, exclusions and an end status, so the subagent needs no
conversation history and the main session can judge the report without rereading the work. Its shape is in the
[build reference](../../skills/devflow/references/build.md#delegating-m2-m3). A brief is text agents read, so it is
written in English ([documents](documents.md#text-agents-read) item 9).

## Subagent questions

Subagents do not ask the user directly (Claude Code removes `AskUserQuestion` from subagents), and neither host documents
that a subagent can keep running while it waits for an answer, so it stops with `NEEDS_DECISION` and is resumed: Claude
with `SendMessage`, keeping history and model settings; Codex with a follow-up task to the same agent. The subagent cache
runs with a default 5-minute TTL; if waiting for user answers is frequent, consider raising `subagentPromptCacheTtl` to
`1h`.

## Fix loop

Analysis is split from fixing, because a fix made before the cause is known tends to cover only the symptom. Attempts
and promotions are counted in ledger `notes`, not in `counts`, which holds only the Stop hook's `{continue}`. The
procedure is the [build reference](../../skills/devflow/references/build.md#failures).

## Review

The final review runs in a fresh context without the expected verdict, because a reviewer told the answer confirms it,
and reports only defects that affect correctness and requirements. Weakening a test to make it pass, when neither the
requirement nor the expectation changed, is a defect
([rationale](../design/current-decisions.md#instructions-and-protections)). A design that moves a trust boundary is
reviewed before planning by a reviewer trying to break it, and a claimed bypass is confirmed with the real renderer or
command, not by argument. Reviewers only report; no simplification agent edits code during review. If another plugin
injects rules into subagents, recommend excluding devflow agents from it. The procedure is the
[review reference](../../skills/devflow/references/review.md) and, for designs, the
[design reference](../../skills/devflow/references/design.md).

## Models and effort

The user picks the main controller's model and effort. devflow does not set `effort` on skills that run in the main
session, because changing the main session's effort invalidates the prompt cache; effort differences belong only on
subagents, which use their own cache. The Claude columns of the Roles table in
[SKILL.md](../../skills/devflow/SKILL.md#roles) are family aliases; the Codex column, which has no aliases, is updated
when a new version ships. fable and astra are not used.

In Claude Code, the `model` (aliases only) and `effort` given at call time take precedence over the agent definition
([host-facts](../research/host-facts.md)). In Codex, the model and effort given at spawn take precedence over the
defaults, but the host's current tool instructions may limit what can be set. Read-only roles in Codex are kept only by
instruction: a custom agent's `sandbox_mode` cannot narrow the parent sandbox ([host-facts](../research/host-facts.md#codex)).

There are three agent definitions, split by tools: `explorer`, which only reads and runs commands; `reviewer`, which
only reads; and `implementer`, which edits files ([rationale](../design/current-decisions.md#execution-and-delegation)).
Definitions do not set `omitClaudeMd`, because the agents need the project instructions and boundaries as they are.
Claude implementers carry `disallowedTools: Agent` and `maxTurns`.

### Perspectives

An agent definition holds the text of its perspectives, so no stage reads a separate perspectives file and both hosts
apply one text: a Codex subagent gets the same role body and perspective text in its brief. A brief names at most one
perspective, because a reviewer given two does neither well.

### Promotion

Promotion goes one step per task, decided by the main session and recorded in one ledger line; its conditions are in the
[build reference](../../skills/devflow/references/build.md#failures). Routes outside it (hook enforcement, declarative
routes) are on hold; the conditions to revisit them follow [revisiting routes and
Workflow](../design/current-decisions.md#execution-and-delegation).

## The two hosts

| Mechanism | Claude Code | Codex |
|---|---|---|
| Implementer and reviewer agents | plugin `agents/` (`model`, `effort`, `tools`, `disallowedTools`, `maxTurns`) | built-in explorer and worker spawned with `fork_turns: "none"` and a set model and effort. The default `"all"` passes on the parent conversation |
| Resume card, unattended continuation, session release | [hooks](hooks.md#registered-events) | same file |

Codex's SessionEnd does not run in subagents. A session that ended without the hook running expires after 30 minutes
([concurrent sessions](ledger.md#concurrent-sessions)).
