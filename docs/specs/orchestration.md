# Orchestration contract

Defines which stages work flows through, who writes code, when to delegate, and which model and effort run it.

## Stages and paths

[lifecycle](lifecycle.md) defines stages, paths (spike, bounded, architectural), loops and going back. This document
defines how work runs within them. Execution modes by path: spike only runs a throwaway experiment, bounded builds in M0
or M1, and architectural builds in M1 to M3.

## Plan

A plan on the architectural path is done when an engineer who has not seen the conversation can build from the plan
alone. For each task it lists the files to change, the order, interfaces (consumes / produces) and the check that proves
the task. For the plan as a whole it lists the project-wide constraints (minimum versions, dependency limits, naming
rules) and the inputs the tests do not cover that users are likely to hit.

Before confirming it, ask three questions: what can break, which step is riskiest, and which alternatives were not
chosen and why they were dropped. If a decision only the user can make remains among these, ask the user only that.

If the build departs from the plan, fix the private plan before finishing that task, and if the public summary changes,
record it in the next checkpoint. Plans are not committed to git.

## Build and verification

- When you change executable code, report it done only after running a check that actually executes the change (tests,
  type check, build, the changed command). A syntax check or a check that did not start does not count as verification.
- If the only thing missing is a dependency the project declares, install it with the project's package manager and
  lockfile. Do not use sudo or a system package manager.
- If a check cannot run, report which check did not run and why.
- Confirm once that a test for new behavior fails before the change, or with the change reverted. Whether to write the
  test first or later follows the project's rules. Either way, a test not seen failing does not prove the change.
- A bug fix first writes a reproduction test and confirms it fails, then fixes the code. That test is not changed in the
  process. There is no test lock; review looks at test changes ([rationale](../design/current-decisions.md#instructions-and-protections)).

## Execution modes

Decisions and writes happen in one place, the main session. When several agents write at once, the unstated decisions in
each one's actions collide. Subagents are used to protect context and to verify with fresh eyes.

| Mode | When | Who writes | Subagents |
|---|---|---|---|
| **M0** | Explainable in one sentence, does not touch a trust boundary (authentication, permissions, secrets, hooks, external input handling) and meets the meaning criteria below | main session | None. The main session's checks stand in for verify, and its own re-reading of the diff for review |
| **M1** (default) | Other ordinary work | main session | Exploration, test and log summaries, root-cause analysis, execution verification, final review (reporting roles; tool limits are in the definitions below) |
| **M2** | Three or more independently testable tasks, reading expected to exceed half the main context, or a long unattended run | implementer subagents, one at a time | Per-task review, final review |
| **M3** (Claude only) | Files do not overlap and interfaces are fixed in the plan | implementers, one per worktree, up to 2 to 3 at once | Per-task review, final review |

Workflow is not an execution mode. The user runs it directly, outside devflow ([conditions to
revisit](../design/current-decisions.md#execution-and-delegation)).

Even in interactive M2, a one- or two-line edit that one sentence explains is not delegated; the main session makes it
and records it in the ledger. One delegation (brief, fresh context, report) costs more than the edit. Per-task review
follows build's rule for mechanical changes. Unattended runs need a fresh context per task ([unattended
runs](ledger.md#unattended-runs)), so they have no such exception.

In M3, the main session starts implementers by passing `isolation: "worktree"` on each Claude Agent call. Putting it in
the agent definition would move M2 delegation into worktrees too, so the definition does not carry it. The main session
merges results one at a time, and after each merge runs the checks the merged result affects. Without grounds to narrow
the scope, it runs the full `verify` locally at that point (procedure in the build reference). The full `verify`
evidence for the integration gate follows the integration method ([repository](repository.md#devflowjson)).

### Applying and finishing M0

Choose by meaning rather than by extension or line count. Fixing typos, links or wording while keeping the contract is
M0. The same holds for AGENTS.md and SKILL.md. Changing an instruction's execution flow, permissions, disclosure scope,
trust boundary or check gates is M1 or above, and the [trust-boundary design review](#review) also applies.

The main session checks BASE..HEAD and staged, unstaged and untracked changes against the acceptance criteria. Required
ignored inputs are named by path. Design documents, review-package and reviewers are skipped. [Stages by
path](lifecycle.md#stages-by-path) and the Issue and ledger stay, and integration follows [Integration and
CI](repository.md#integration-and-ci).

## What the main session owns

- Issue state, the plan, the [ledger](documents.md#one-source-of-truth-per-artifact)
- Every decision outside the delegation brief's scope
- Integrating results and final verification
- Recording checkpoints
- Confirming user permissions and targets, and communicating with the user

## Delegation brief

```
TASK k/N · Issue #i · BASE <sha>
Goal:
Acceptance:
Files you may change: …  (leave every other file as it is)
Interfaces: consumes … / produces …
Constraints: <the plan's global constraints that apply>
Check: <command>  (healthy output: …)
Out of scope for you: push, Issue writes, spawning subagents, deleting or weakening tests, adding dependencies
End with one status: DONE | DONE_WITH_CONCERNS | NEEDS_DECISION | BLOCKED
Report: files changed, checks run with results, checks not run and why
Keep working until the brief is done; stop early only with NEEDS_DECISION or BLOCKED.
When the work in this brief is done and its checks pass, stop and report. Do not start extra
rounds of review or changes outside the listed files; mention anything worth doing at the end.
```

A brief is text agents read, so it is written in English ([documents](documents.md#text-agents-read) item 9).

A delegation launched as another session (`codex exec`, `claude -p`), unlike a subagent, is recorded in the ledger as
its own session, so the brief's last instruction is `release <issue>` ([concurrent sessions](ledger.md#concurrent-sessions)).

Record BASE before delegating. Using `HEAD~1` instead drops the early part of a multi-commit task from the review.

For plans, task specs, tests and outputs that git ignores, the brief gives the path and the part to read. Read the path
directly even when Glob does not list it, and report a missing required input as a review limit. A background delegation
goes into the ledger's `running` ([ledger keys](ledger.md#ledger-keys)).

## Subagent questions

Subagents do not ask the user directly (Claude Code removes `AskUserQuestion` from subagents). Neither host documents
that a subagent can keep running while it waits for an answer, so it **stops and resumes**.

1. It decides implementation details inside the brief's scope itself.
2. If it needs a scope change, an interface change, a new dependency, deleting or loosening a test, or a change to a
   file it may not change, it ends with `NEEDS_DECISION`, giving one question, the options, a recommendation and the
   reason.
3. The main session decides what lies within existing permissions and the delegation scope. When to ask the user, and
   independent work, follow [going back](lifecycle.md#going-back).
4. The main session resumes the same agent. Claude resumes it with `SendMessage`, keeping the conversation history and
   model settings. Codex sends a follow-up task to the same agent.
5. Messages during a run are notifications only. Do not proceed by guessing a decision.

The subagent cache runs with a default 5-minute TTL. If waiting for user answers is frequent, consider raising
`subagentPromptCacheTtl` to `1h`.

## Fix loop

1. If the cause of a check or CI failure is unclear, an explorer with the root-cause perspective first reports the cause
   and evidence, without changing files. Splitting analysis from fixing reduces fixes that only cover symptoms.
2. Within one task, the implementer fixes at most twice. The ledger counts the attempts: each fix attempt and each
   promotion is one ledger `notes` line with its reason, not a `counts` value, which holds only the Stop hook's
   `{continue}` ([ledger keys](ledger.md#ledger-keys)).
3. If it still fails, go up one step of [promotion](#promotion) and try once.
4. If it still fails, the main session takes it over or reports where it is blocked.

## Review

- In M1 and above, the final review runs in a fresh context. The reviewer gets the BASE..HEAD diff file
  (`review-package`), the acceptance criteria, the plan summary and REVIEW.md, but not the verdict.
- Have it report only defects that affect correctness and requirements.
- In M2 and M3, add a narrowly scoped review per task. When the final review catches a defect that review missed, record
  it in the ledger together with the model.
- Review looks at test changes separately. Weakening a test to make it pass, when the requirement did not change and the
  expectation was not wrong, is a defect ([rationale](../design/current-decisions.md#instructions-and-protections)).
- Fixing review findings: only a fix that changed behavior or permissions (code, settings, tests; an instruction's flow,
  permissions, disclosure scope, trust boundary or gates) gets a fresh-context execution verification of the criteria it
  reaches and a narrowed re-review. The main session confirms wording and format fixes through CI. If findings recur at
  the same spot, revisit the design instead of patching on top.
- A design that moves a trust boundary goes, regardless of path, to a reviewer with the design perspective to try to
  break before planning. Examples are loosening a filter that guards public text, and deciding paths, permissions or
  write targets from repository files, git metadata or tool output. A bypass the reviewer claims is neither accepted nor
  dismissed by argument; confirm it with the real renderer or command.
- Do not use a simplification agent that edits code directly for review. Reviewers only report; the implementation side
  does the fixing.
- If another plugin injects rules into subagents, recommend excluding devflow agents from it. The brief sets the report
  format.

## Models and effort

The user picks the main controller's model and effort. devflow does not set `effort` on skills that run in the main
session. Changing the main session's effort invalidates the prompt cache. Effort differences belong only on subagents,
which use their own cache.

In Claude Code, the `model` (aliases only) and `effort` given at call time take precedence over the agent definition.
Promotion within the same model uses the call's `effort`, not `ultrathink` ([host-facts](../research/host-facts.md)).
The Claude columns are family aliases; the Codex column, which has no aliases, is updated when a new version ships.
fable and astra are not used. Values in parentheses are the definition's defaults.

| Role | Claude default | Claude promotion | Codex |
|---|---|---|---|
| Exploration | `explorer` + `model: haiku` (`medium`) | `effort: high` → `model: sonnet` | gpt-6-luna `high` (`xhigh` if not enough) |
| Test and log summary | `explorer` + summary perspective + `model: haiku` (`medium`) | `effort: high` → `model: sonnet` | gpt-6-luna `high` (`xhigh` if not enough) |
| Failure root-cause analysis | `explorer` + root-cause perspective + `effort: high` (`sonnet`) | `model: opus` | gpt-6.1-sol `high`, worker told to report only |
| Mechanical implementation | `implementer` (`sonnet` `medium`) | `model: opus` | gpt-6.1-terra `medium` (promotion: gpt-6.1-sol `high`) |
| Implementation needing judgment | `implementer` + `model: opus` (`medium`) | `effort: high` | gpt-6.1-sol `high` |
| Design alternatives, plan validation | `reviewer` + design perspective (`opus` `high`) | — | done by the main session |
| Execution verification | `explorer` + verification perspective (`sonnet` `medium`) | — | gpt-6.1-terra `high`, worker told to report only |
| Per-task review | `reviewer` + `model: sonnet` (`high`) | — | gpt-6.1-terra `high` |
| Final review | `reviewer` (`opus` `high`) | — | gpt-6.1-sol `high` |
| Security and high-risk review | `reviewer` + security perspective (`opus` `high`) | — | gpt-6.1-sol `high` |

There are three agent definitions, split by tools: `explorer`, which only reads and runs commands; `reviewer`, which
only reads; and `implementer`, which edits files
([rationale](../design/current-decisions.md#execution-and-delegation)). Definitions do not set `omitClaudeMd`, because the agents need the
project instructions and boundaries as they are.

Claude implementers carry `disallowedTools: Agent` and `maxTurns`. The brief's last paragraph blocks extra review rounds
and includes a line telling the agent to keep going to the end.

### Perspectives

An agent definition holds the text of its perspectives. `reviewer` reviews for correctness unless the brief names design
or security; `explorer` searches unless the brief names summary, root cause or verification. A brief names at most one
perspective, because a reviewer given two does neither well,
and keeping the text in the agent body means no stage reads a separate perspectives file. A Codex subagent gets the same
role body and perspective text in its brief and is spawned with `fork_turns: "none"`, so both hosts apply one text.

### Promotion

The main session decides it when delegating. Go up only one step per task, and record the reason in one ledger line.

| Condition | Decided by | Result |
|---|---|---|
| Still failing after two fixes in the same task | count | One step to the promotion column ([fix loop](#fix-loop)) |
| The cause of a check or CI failure is unclear | main session | Root-cause analysis by explorer (`effort: high`). If it finds no cause, once more with `model: opus` |
| The task spans the interfaces of several modules, or needs judgment during implementation (consistency across files, choice of algorithm) | plan | Classified as implementation needing judgment. The main session settles design decisions before delegating |
| The brief is ambiguous | implementer | No promotion; end with `NEEDS_DECISION` |
| Changes a trust boundary (authentication, permissions, secrets, hooks, external input handling) | diff | One separate security-perspective review |
| A mechanical change within one file that does not touch a trust boundary | diff | Skip per-task review; the final review checks it |

Routes outside this table and promotion (hook enforcement, declarative routes) are on hold. The conditions to revisit
them follow [revisiting routes and Workflow](../design/current-decisions.md#execution-and-delegation). In Codex, the model and effort
given at spawn take precedence over the defaults. The host's current tool instructions may still limit what can be set,
so follow them first. Confirm from run records that the table's values actually apply; if that cannot be confirmed,
leave it as unconfirmed. In Codex, read-only roles are kept only by instruction. A custom agent's `sandbox_mode` cannot
narrow the parent sandbox ([host-facts](../research/host-facts.md#codex)).

## The two hosts

| Mechanism | Claude Code | Codex |
|---|---|---|
| Implementer and reviewer agents | plugin `agents/` (`model`, `effort`, `tools`, `disallowedTools`, `maxTurns`) | built-in explorer and worker spawned with `fork_turns: "none"` and a set model and effort. The default `"all"` passes on the parent conversation |
| Resume card, unattended continuation, session release | [hooks](hooks.md#registered-events) | same file |

Codex's SessionEnd does not run in subagents. A session that ended without the hook running expires after 30 minutes
([concurrent sessions](ledger.md#concurrent-sessions)).
