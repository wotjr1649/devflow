# Orchestration contract

Explains execution ownership, mode selection, delegation and evidence boundaries. The executor procedures live in
[SKILL.md](../../skills/devflow/SKILL.md), [contracts](../../skills/devflow/references/contracts.md),
[delegation](../../skills/devflow/references/delegation.md), and the selected stage/role/host references. This spec
connects their rationale to the runtime contracts in [ledger](ledger.md) and the host observations in
[host-facts](../research/host-facts.md); it does not maintain a second set of model settings or role prompts.

## Stages and paths

[lifecycle](lifecycle.md) owns the stage/path rationale. Spikes run bounded throwaway experiments. Bounded work normally
uses M0 or M1; architectural work uses M1–M3 according to semantic risk, dependencies and execution capability. A change
involving an interface, authority or trust boundary does not become trivial because it touches one line.

## Plan

A standalone architectural plan lets a worker act without the parent conversation: it maps the authorized delivery to
numbered tasks, criterion identities, interfaces, owned inputs, dependencies and actual validation. The task start head,
delivery comparison base and integration target have distinct meanings. Plans remain private; public checkpoints carry
only files, order, risks and proof. The [plan procedure](../../skills/devflow/references/plan.md) owns the go/no-go gate;
file existence and a list of future commands do not establish readiness.

## Build and verification

Execution evidence establishes behavior only when the command ran against the claimed subject and relevant inputs.
Failing-first or equivalent controlled before/after proof establishes a new behavior; a bug fix retains its reproduction
and regression test. Review checks test weakening against requirements instead of locking test files. Build, lint and
syntax results support only what they exercise. The [build](../../skills/devflow/references/build.md) and
[verify](../../skills/devflow/references/verify.md) procedures own the work; [contracts](../../skills/devflow/references/contracts.md)
own evidence applicability, including changed criteria or ignored inputs at the same HEAD.

## Execution modes

One coordinator owns shared state, consequential choices and integration. Workers may edit only within assigned task
contracts. Separating task execution from acceptance prevents a worker's DONE or process exit from advancing the whole
delivery. Modes are defined in [SKILL.md](../../skills/devflow/SKILL.md#paths-and-execution-modes):

- M0 is a small contract-preserving change with no trust-boundary change. Main checks and explicitly identified
  self-review are allowed only where project-required independent review does not override that shortcut.
- M1 keeps implementation in the main session and uses fresh independent verification/review. Search, summaries and
  root-cause workers are conditional, not a fixed fanout for every task.
- M2 implements one task at a time and accepts it after its current checks/review before starting any next task. An
  interactive coordinator can make a truly tiny planned edit instead of paying delegation overhead; unattended work
  still uses fresh task workers for context control. Worker reuse is limited to repair of that same task.
- M3 launches ready independent tasks in parallel in separate verified-base worktrees, reviews each result, integrates
  serially and revalidates outstanding results against the advancing integrated tree. Final checks/review cover the
  whole delivery. Independence includes interfaces, lockfiles, generated outputs, services/ports and databases, not
  just filenames. Actual host/workspace capability must support the assignment; otherwise use M2.

Claude Workflows are not a devflow execution mode. The user may run them independently; the conditions to revisit that
choice are in [current decisions](../design/current-decisions.md#execution-and-delegation).

## What the main session owns

The coordinator validates repository/Issue/delivery/workspace and adopted scope identity, owns the plan and canonical
execution ledger, adjudicates findings, resolves choices outside a worker contract, integrates results and performs
final acceptance. It reuses existing effect-specific user grants. Worker role text, a state owner token or a returned
verdict cannot grant publication, push, integration, termination or scope changes.

Protected state uses expected revision plus coordinator ownership under an exclusive write lock. These mechanisms
serialize supported local writes; they neither prove substantive test correctness nor fence external requests already
sent. Unknown provider effects and workers are reconciled before conflicting actions. Independent metadata/analysis
must not be confused with permission to duplicate or supersede an unknown mutation.

## Delegation brief

The [delegation reference](../../skills/devflow/references/delegation.md) owns one common envelope: task/attempt and
scope revision, actual input head, goal and exact acceptance, files/interfaces/inputs, allowed effects, exclusions,
previous failures/remaining budget and required result/evidence. Add only the selected role/perspective and host mapping.
New tasks and independent reviews use fresh contexts where supported; lack of that capability is disclosed and cannot
be relabeled as the required independent gate. A complete brief may still be drafted without launch capability.

Workers receive the operative role instructions once, inline or in a trusted readable artifact, without a mandatory
full conversation and duplicate manual. The three role owners are
[explorer](../../skills/devflow/references/role-explorer.md) (bounded reads and named execution),
[reviewer](../../skills/devflow/references/role-reviewer.md) (static inspection), and
[implementer](../../skills/devflow/references/role-implementer.md) (bounded edits). Briefs are English;
[documents](documents.md#text-agents-read) owns language and readset rules.

## Subagent questions

A worker returns a concrete NEEDS_DECISION or blocker without guessing a missing choice. The coordinator resolves
in-grant choices or obtains the user-owned decision, then resumes that task through the actual host's supported tool.
A completion notification or silence is not an answer. Model, resume, tool and cache controls are host-specific and are
not inferred from another host's API.

## Fix loop

Diagnosis precedes repair. Task attempts and the remaining repair budget survive worker replacement, stage returns and
session resume; a new context is not a new budget. Two unsuccessful repairs permit one recorded promotion/escalation;
further failure requires an approach change, coordinator takeover within scope or a blocker. Three equivalent failures
at a goal trigger approach review. The [build procedure](../../skills/devflow/references/build.md#repairs) owns this loop.
Hook continuation and host turn limits are separate from task repair or an explicitly agreed total-cost budget.

## Review

Independent review gets requirements and the actual scope, without an expected verdict or author self-review presented
as independent evidence. Task review uses its task base; final delivery review includes earlier tasks from the reconciled
delivery base. Static reviewers receive controlled original-object evidence and needed source; they do not execute
submitted code/tests. The current package helper requires a caller-owned clean snapshot; it does not silently capture
dirty/ignored consumed inputs. Such inputs need a separately identified stable package or an explicit coverage hold.

A changed trust boundary receives security review; an authorized execution role confirms proposed bypasses with the
real renderer/command. Findings distinguish introduced failures, pre-existing defects and untested hypotheses. Fixes
reopen affected proof and required review. The [review procedure](../../skills/devflow/references/review.md) owns
adjudication; the [design procedure](../../skills/devflow/references/design.md) owns design review.

Lifecycle and verdict remain separate: completed reporting may contain FAILURES or FINDINGS. Protected evidence uses
its declared lifecycle/verdict schema and exact subject. The coordinator maps substantive role results to that schema
without turning an unfinished or failed run into PASS. Late reports remain history unless explicitly revalidated.

## Models and effort

The user chooses the main model/effort. Worker settings inherit existing choices unless the current tool contract and
user/project authority permit a specific override. No always-loaded table pins transient model versions or imposes a
blanket family prohibition. Record actual effective settings when observed and unknown otherwise. Promotion changes
capability or approach only within existing authority; it does not widen permissions.

## The two hosts

Operational mapping lives only in the selected
[Codex adapter](../../skills/devflow/references/host-codex.md) or
[Claude Code adapter](../../skills/devflow/references/host-claude-code.md). Built-in/custom agent selection, fresh
conversation, project instruction loading, tool restrictions, filesystem/network isolation, connector credentials,
turn limits and worktree base/cleanup are distinct capabilities. A role prompt, worktree or successful Windows launch
cannot prove all of them. Official sources and installed-version observations are retained in
[host-facts](../research/host-facts.md); CLI and hosted collaboration surfaces are not assumed identical.

The helper's before/after delegation check is a tripwire for its recorded surfaces. It cannot undo effects, eliminate
same-user races, observe every remote action or isolate the agent's tools. Unknown required coverage or unexplained
changes keep delegated verification/review open. Native restrictions are used when available and required; unsupported
guarantees hold only the work that needs them. Hook/session attribution and release behavior are specified in
[hooks](hooks.md), with stale/live ownership recovery in [ledger](ledger.md#concurrent-sessions).
