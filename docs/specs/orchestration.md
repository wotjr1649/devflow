# Orchestration contract

Defines why work runs the way it does: who writes code, when to delegate, and which model and effort run it. The
procedure the executor follows lives in the devflow skill, which owns it: [SKILL.md](../../skills/devflow/SKILL.md)
and its [delegation](../../skills/devflow/references/delegation.md), [plan](../../skills/devflow/references/plan.md),
[build](../../skills/devflow/references/build.md), [review](../../skills/devflow/references/review.md) and
[design](../../skills/devflow/references/design.md) references. This spec keeps the reasons, the policy the skill does
not apply at run time, and the host facts delegation and tests rely on.

## Stages and paths

[lifecycle](lifecycle.md) explains stages, paths, loops and going back; the skill states them. Execution modes follow the
path: a spike only runs a throwaway experiment, bounded work builds in M0 or M1, architectural work in M1 to M3.

## Plan

A plan is written so that an engineer who has not seen the conversation can build from it alone, because a wrong plan
costs a page while a wrong build costs the work. Plans are private and not committed to git; the stage-boundary checkpoint
carries their public summary. The procedure is the [plan reference](../../skills/devflow/references/plan.md).

## Build and verification

A changed behavior needs a check that exercises it; a syntax check or a command that never started does not prove that
behavior. Preserve meaningful bug reproductions. Do not create a test solely to mirror a harmless wording edit; M0 uses
proportionate contract and diff checks. Record execution, static review and supplied results separately with their scope
and tested subject. There is no test-file lock; review examines changes to still-valid tests
([rationale](../design/current-decisions.md#instructions-and-protections)).
Task checks prove the task's own contract; its `contributesTo` links explain how it supports Issue acceptance criteria.
A storage task can finish before the dependent UI exists, while the full user-facing criterion remains unchecked until
delivery verification. The procedure is the [build reference](../../skills/devflow/references/build.md).

## Execution modes

Decisions and writes happen in one place, the main session: when several agents write at once, the unstated decisions in
each one's actions collide. Subagents protect context and verify with fresh eyes. The execution modes and how to choose
by meaning are in [SKILL.md](../../skills/devflow/SKILL.md#execution-modes).

Workflow is not an execution mode. The user runs it directly, outside devflow ([conditions to
revisit](../design/current-decisions.md#execution-and-delegation)).

Interactive M2 lets the main session make a one- or two-line edit itself, because one delegation (brief, fresh context,
report) costs more than the edit; unattended runs keep a fresh context per task instead. M3 passes `isolation:
"worktree"` on each Claude Agent call, so M2 delegation stays out of worktrees. One M3 integration-batch task owns
separate registered work units, each with a fixed original base, isolated worktree, file scope, local checks and evidence
return contract. The singular active task is the batch; its independent units may launch together. Main collects their
results and confirmed exits, serially reviews/integrates them and executes the combined task checks before advancing.
Do not launch an unregistered second task to bypass the sequential task barrier.

## What the main session owns

Issue state, the plan, the ledger, every decision outside a brief's scope, integrating results and final verification,
checkpoints, and confirming permissions and targets with the user. Subagents report; the main session acts.

## Delegation brief

A brief gives a subagent one task with its files, check, exclusions and an end status, so the subagent needs no
conversation history and the main session can judge the report without rereading the work. Its shape is in the
[build reference](../../skills/devflow/references/build.md#delegating-m2-m3). A brief is text agents read, so it is
written in English ([documents](documents.md#text-agents-read) item 9).

## Subagent questions

Subagents return unresolved decisions to the parent with `NEEDS_DECISION`. Use the current host's supported follow-up
or resume mechanism; do not invent a suspended waiting channel or assume unsupported model overrides. The parent asks
the user only for a consequential decision or authority not already established. Cache settings and host configuration
are not changed by the skill.

## Fix loop

Analysis is split from fixing, because a fix made before the cause is known tends to cover only the symptom. Attempts
and promotions are counted in ledger `notes`, not in `counts`, which holds only the Stop hook's `{continue}`. The
procedure is the [build reference](../../skills/devflow/references/build.md#failures). Hook continuation, task fixes,
verification retries and the goal's work budget are separate. Starting a new task, agent or session does not reset the
goal budget. Exhaustion or non-progress is blocked/budget-exhausted, never success. Without complete token telemetry,
report call/time/work limits rather than claim an enforced token budget.

## Review

The final review runs in a fresh context without the expected verdict, because a reviewer told the answer confirms it,
and reports only defects that affect correctness and requirements. Weakening a test to make it pass, when neither the
requirement nor the expectation changed, is a defect
([rationale](../design/current-decisions.md#instructions-and-protections)). A design that moves a trust boundary is
reviewed before planning by a reviewer trying to break it, and a claimed bypass is confirmed with the real renderer or
command, not by argument. Reviewers only report; no simplification agent edits code during review. Rules another plugin
injects into subagents reach devflow's agents too: they run as `general-purpose`, so no matcher can single them out
([rationale](../design/current-decisions.md#execution-and-delegation)). The procedure is the
[review reference](../../skills/devflow/references/review.md) and, for designs, the
[design reference](../../skills/devflow/references/design.md).

## Models and effort

The user chooses the main model and effort. The router carries no fixed model-version or price table. A dispatch may
use an applicable user preference only when the actual tool schema and higher-priority instructions allow it; otherwise
inherit and report that fact. A requested model name in prose does not configure the call. Benchmark comparisons pin
the actual model and effort that ran, not a drifting alias.

The skill has [explorer](../../skills/devflow/references/role-explorer.md),
[reviewer](../../skills/devflow/references/role-reviewer.md) and
[implementer](../../skills/devflow/references/role-implementer.md) contracts. The parent loads only the selected role and
gives its essential boundaries and one relevant perspective to each fresh child. It does not pass the expected verdict,
the parent's whole conversation or all other roles. Codex dispatch uses `fork_turns: "none"` for independent work;
available model/effort overrides remain subject to the host's current instructions.

The plugin ships no agent definitions. Use the host's supported general-purpose delegation path with the task contract.
Actual tool, filesystem and network restrictions are separate from advisory role limits; do not claim that naming a
reviewer changes its permissions. M3 stays within the supported, tested isolation path until another host passes the
same ownership and integration cases. Worktrees do not isolate shared ledger, remote or process effects.

The before/after `devflow-state delegation-check` remains an observational tripwire. `after` reads recorded paths
without invoking Git, because an agent may have changed executable configuration. It does not cover arbitrary same-user
effects. Generate static review material through the trusted reader, preserving original publishable Git objects and
disabling configured diff/text conversion effects. When a changed or unverified local state invalidates a report, keep
that review open and recover the trusted state before executing repository programs again.

### Perspectives

Perspectives belong to their role's file; they are not separate always-loaded documents. Select one coherent review or
exploration assignment. Broader work can use independent assignments when the additional evidence justifies their cost.

### Promotion

Promotion goes one step per task, decided by the main session and recorded in one ledger line; its conditions are in the
[build reference](../../skills/devflow/references/build.md#failures). Routes outside it (hook enforcement, declarative
routes) are on hold; the conditions to revisit them follow [revisiting routes and
Workflow](../design/current-decisions.md#execution-and-delegation).

## The two hosts

| Mechanism | Claude Code | Codex |
|---|---|---|
| Delegated agents | Supported general-purpose call with the brief; overrides only when available and permitted | `spawn_agent` with the brief and `fork_turns: "none"`; overrides only when available and permitted, otherwise inherit. The default `"all"` passes the parent conversation |
| Resume card, unattended continuation, session release | [hooks](hooks.md#registered-events) | same file |

Do not rely on a child's SessionEnd or on automatic clear-time release without observing that host path. Explicit
handoff and confirmed child exit remain required. Legacy session-warning expiry is described in
[concurrent sessions](ledger.md#concurrent-sessions); expiry does not transfer v2 execution ownership.
