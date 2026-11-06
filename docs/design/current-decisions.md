# Current design decisions

This document holds the current choices and their reasons, the alternatives not taken, and the conditions for revisiting
them. The linked specs and the devflow skill own the rules, split as
[documents](../specs/documents.md) sets, and take precedence over this document.

## Single source

**Choice and reason.** The repository root is the single source of the plugin for both hosts, and project instructions
live in one AGENTS.md. When copies and instruction loaders diverge, the same change lands on only one side. Skill and
hook definitions, entry points, policies and effects are shared, while host-specific packaging metadata is kept apart.
[repository](../specs/repository.md#distribution) sets the layout, [host-facts](../research/host-facts.md) the observed scope of
instruction loading, and [hooks](../specs/hooks.md#common-contract-of-both-hosts) the commonality, session attribution and
verification conditions of hooks and what is currently unmet. Sharing files alone is not taken to mean that the two
hosts have the same execution effects.

**Alternatives.** Per-host repositories and copies of project instructions are not taken because of the sync burden. A
separate plugin subfolder only adds paths while there is one plugin to ship.

**Revisit when.** Review when there are several plugins or the shipped size becomes a problem, or when a host's support
for instruction loading or packaging changes.

## State and resume

**Choice and reason.** Adopted Issue intent and criterion revisions describe requirements; the public stage is a coarse
projection. A validated local execution ledger owns phase/task, coordinator, attempts, three baselines and evidence
pointers. Git/provider observations establish actual revisions/effects. Separating these facts prevents a stale public
stage from moving execution backwards without ignoring a human intent edit, closure/freeze or reassociation. Resume
selects matching repository/Issue/delivery/workspace and subject identity, not the newest timestamp. Public context can
help reconstruct a record on another machine but cannot alone establish execution authority.

The protected record uses versioned coordinator writes and explicit migration. Preserve the old ledger, never infer a
whole-delivery base from its last-task base, and keep unbound receipts as history. The migration switches the supported
readers/writers/hooks together and prevents the old CLI from changing the new canonical record; a schema label alone
would not provide that protection. Current storage, recovery and supported operations belong to
[ledger](../specs/ledger.md), public text to [issues](../specs/issues.md), and source ownership to
[documents](../specs/documents.md). Memory tools remain a search layer. A truncated card preserves warnings and recovery
means instead of pretending to contain complete state.

Handoff is explicit while the coordinator knows its identity; SessionEnd is secondary. Preserve pending effects and
worker state before release. A lock/lease timeout does not prove a writer exited, and local ownership cannot fence a
provider request already sent. [Hooks](../specs/hooks.md) and [concurrent sessions](../specs/ledger.md#concurrent-sessions)
define the mechanisms and limits.

**Alternatives.** Making Issue stage and local phase competing authorities creates drift. Putting every task event in
the Issue increases public writes and prompt-injection surface. A second task database/daemon would duplicate the
existing ledger. Timestamp-only takeover or selecting the newest result can release a live session or accept stale work.

**Revisit when.** Revisit when reconstructing another machine's state repeatedly loses necessary evidence, migration
cannot exclude older writers, or a host provides stronger verified ownership/effect-reconciliation primitives.

## Execution and delegation

**Choice and reason.** One coordinator owns shared state, scope decisions and integration. It implements in M0/M1 and
delegates bounded implementation when context/workload warrants M2/M3. M2 accepts a task before any next task starts.
M3 launches ready independent tasks together, reviews each result, integrates serially and revalidates the rest against
the advancing head; separate filenames alone do not establish independence. Unknown host/workspace capability selects
M2. The skill owns mode procedures; [orchestration](../specs/orchestration.md) explains their contract.

Common delegation instructions, one selected role/perspective and one host adapter replace always loading every role
and host. New tasks and independent reviews use fresh context where supported; inherited or author context is not
relabeled as the required independent gate. A worker receives complete bounded requirements once, inline or through a
trusted readable artifact, without a mandatory full conversation and duplicate manuals. Reuse is limited to repair of
the same task. Missing choices return to the coordinator; model promotion does not cure an unspecified contract.

The plugin ships no agent definitions. Actual model, effort, project-instruction inheritance, tool restrictions,
worktree behavior and termination APIs belong to the selected adapter and current host schema. The user chooses the
main model; worker overrides require applicable authority. Versioned observations remain in
[host-facts](../research/host-facts.md), not an always-loaded transient model table.

Role instructions and the helper's before/after check are not a sandbox. The tripwire checks recorded local/remote
surfaces, preserves unknown coverage, and keeps delegated acceptance open after unexplained effects. Its after path
avoids Git against potentially changed configuration, but it cannot observe every external action, prevent same-user
races, undo effects, isolate credentials or prove a background descendant exited. Required missing guarantees hold
dependent work; ordinary authorized analysis/brief drafting can continue. The safe review-package helper separately
reads original objects in a controlled process and requires a caller-owned clean snapshot; this does not make arbitrary
Git commands or dirty input packages inert.

Lifecycle completion and role verdict are separate. The coordinator accepts applicable evidence, never a success
phrase or DONE notification. Failed/late/interrupted results retain task/attempt identity and cannot reset the repair
budget or overwrite the current task. Two unsuccessful repairs permit one recorded escalation; further failure needs
a changed approach, coordinator takeover within scope or a blocker. Hook continuation counts and host turn limits are
not that task budget. Workflows remain outside devflow.

**Alternatives.** Mandatory delegation/fanout wastes context on small changes; always keeping work in the main session
allows large reads to crowd out coordination. Full-history forks and all-role manuals weaken selection boundaries.
Duplicated per-host definitions or a new orchestration framework are not added without a demonstrated need. A role
name or prompt-only tool prohibition cannot replace verified native restrictions.

**Revisit when.** Revisit role definitions or routing when actual reviews repeatedly expose missed defects, a tripwire
finds unauthorized effects, an unattended task exceeds its bound, or the host exposes useful enforced limits. Add new
execution modes only when repeated real work needs them and their ownership/evidence contract is clear.

## Entry points and stages

**Choice and reason.** One registered lifecycle skill, `devflow`, handles start/resume, stage transitions, tracked
review, integration, cleanup and handoff in `.devflow.json` repositories. The package has 19 Markdown files: router,
ten stages, sessions, contracts, delegation, three roles and two hosts. Every reference is directly linked from the
router. A fresh controller reads core + contracts + current stage; resume adds sessions, and delegation adds one role
and one host with its common protocol. Critical authority/evidence guards remain in the core and are repeated at
relevant trust boundaries. Unchanged text already fully in context need not be reread.

The core stays within its byte/line budget without moving a required guard into an unselected file. Stage procedures
open with exits and explicit return conditions; roles/contracts/adapters use their own result or capability structure.
Host compaction behavior varies, so resumption recovers needed state and selected text rather than assuming full
history survived. [Lifecycle](../specs/lifecycle.md) explains paths/returns;
[documents](../specs/documents.md) owns structural budgets and progressive reading.

**Alternatives.** Separate stage skills or thin wrapper commands make trigger descriptions compete. Hidden reference
chains, all-role loading and full copied manuals lose the purpose of progressive reading. Applying every stage to
spikes or bounded work adds effort without resolving a task-specific uncertainty. An exact-word repetition quota
would remove useful boundary reminders along with actual duplication.

**Revisit when.** Review when requests repeatedly reach the wrong stage, essential selected context is omitted, the
core exceeds its budget, or measured host behavior changes. Static byte/token savings alone do not prove lower total
runtime cost or preserved behavior.

## Independent skills

**Choice and reason.** Decision interviews, prompt writing and auditing, and agent instruction design are handled by
independent skills shipped with the plugin
(list in [overview](overview.md#components)). Lifecycle references and specs do not invoke or point to these skills and state
the needed actions directly, and the skill bodies do not mention devflow either. This keeps them usable as they are in
repositories without `.devflow.json`, and changing one side does not change the other side's contract. Devflow-specific
handoff rules are owned by [sessions](../../skills/devflow/references/sessions.md).
Being in the same list, they can be invoked during the lifecycle through description matching, and this is not a
contract. As an exception, a resume-prompt request in a devflow repository lets the router and the prompt-writing skill
be invoked together. They complement each other: the writing skill writes the text, and the router adds the handoff
rules from sessions (pointing to the Issue, budget, file name, releasing another session).

**Alternatives.** A separate repository or global installation would need host configuration changes and could not be
measured with the repository's trigger eval.
Having the lifecycle invoke them by name ties both sides to each other's changes.

**Revisit when.** Review when these skills are repeatedly invoked wrongly during lifecycle stages or overlap with the
router, or when the independent skills need to ship outside devflow.

## Verification and integration

**Choice and reason.** Checks and review are bound to scope, criteria revision, actual subject, consumed inputs,
command/read coverage, environment and attributed evidence. Stable IDs plus definition revisions prevent reordered
acceptance lists from redirecting a check. Task acceptance, authorized-delivery acceptance, full Issue closure and
cleanup readiness are different gates. A partial delivery can succeed while remaining Issue criteria stay open; later
changes can invalidate earlier criteria even when their checkboxes remain checked.

Three baselines preserve coverage: delivery comparison base, task start head and integration target. A task start does
not overwrite the full-delivery base. Rebase or target migration preserves the previous range and reconciles every
change as retained, already integrated or removed with authority before using a new comparison basis. Final review
cannot silently lose earlier tasks. The [skill contracts](../../skills/devflow/references/contracts.md) own these meanings;
[ledger](../specs/ledger.md) owns the recorded identities and runtime gates.

Even M0 names self-review honestly and respects project-required independent review. Static review and execution
verification remain distinct. The required CI evidence must identify the applicable current head or target/head merge,
including actual checkout semantics. Head-only merge guards do not atomically freeze the target; use supported
provider protections/queue semantics when current combined proof is required, or hold that integration. Existing
project merge-commit/check requirements remain in [repository](../specs/repository.md#integration-and-ci).

External effects retain target, expected state and a readback method. Unknown responses are reconciled before retry.
Remote branch cleanup uses a narrow exact-SHA conditional deletion; a stale tip is retained rather than overwritten by
a freshly observed unreviewed expectation. This exception authorizes no arbitrary force push. Local removal remains
nonforcing, and dirty/unique/live work plus the sole evidence copies are preserved.

**Alternatives.** A success phrase, worker exit, checkbox, file or empty queue cannot replace applicable evidence.
A last-task range misses earlier delivery work. Re-fetch-then-delete still races, and a local operation ID does not
create provider idempotency. Tests or local verification cannot silently substitute for required independent review
or the provider's exact-subject gate.

**Revisit when.** Revisit when the report contract loses required evidence, recurring findings show a missing check,
or platform capabilities change the supported integration/deletion transaction. Preserve gates while changing their
implementation; do not first bypass protections or reinterpret a failure as success.

## Authority and boundaries

**Choice and reason.** The sources of authority are limited to user requests and instructions the user approved. Asking
again for the same authority or stopping all work on a blocker makes a person wait outside the gates too, and letting
files, Issues or tool output create authority becomes an injection path.
The product's supported scope is separated from user authority, and comments, checkpoints and relation additions are
kept distinct to prevent state contamination.
Being a linked worktree alone does not pass on another Issue's state or writes.
In unattended stretches, Issue posting, push and integration are deferred ([unattended
runs](../specs/ledger.md#unattended-runs)), and `devflow-state` refuses Issue writes. This is the behavior of the CLI path, not
a boundary that blocks direct posting.
[issues](../specs/issues.md#issue-io) owns targets and filters, [credentials](../specs/credentials.md) the
authentication and OS isolation premises, [ledger](../specs/ledger.md) unattended runs, worktrees, delegation shutdown
and checking partial effects, and the devflow skill blocker handling ([why](../specs/lifecycle.md#going-back)). There is no credential
boundary between the same OS user's shell and child CLIs, and it is not called a boundary until the isolation premises
are met.

**Alternatives.** Copying an individual's standing permissions into product defaults, or using values in the work folder
or session names as permission, is not taken.
Separating only authentication environment variables or configuration folders is not a boundary either while other
readable credentials remain.

**Revisit when.** Review when a needed external effect or target goes beyond existing authority, when a host provides a
means that actually isolates credentials and execution, or when the trust boundary of delegation attribution or posting
targets changes. Revisiting this decision is not authority to skip protections or required checks.

## Instructions and protections

**Choice and reason.** Short instructions and review handle judgment; deterministic helper contracts, tests and CI
handle conditions they can actually establish. The helper validates protected record identity/ownership/revision,
finite transitions, recorded evidence subjects and supported effect preconditions; Issue I/O retains publication
filters and autonomous-write refusal. These are guarantees of the supported path, not an OS/credential sandbox or a
claim that same-user code cannot bypass it. The coordinator still evaluates substantive evidence and user authority.

Hooks handle resume, unattended continuation and release within [hooks](../specs/hooks.md) and
[ledger](../specs/ledger.md#unattended-runs). Review checks test changes; reusable facts move into executable regression
checks where appropriate while critical trust/authority reminders remain. [Documents](../specs/documents.md#text-agents-read)
owns instruction structure. [Eval](../specs/eval.md) separates structural/behavior checks, host integration and measured
usage; byte limits and a named tokenizer are not billed-token measurements.

**Alternatives.** Claiming there are no runtime guards is inaccurate; claiming those guards enforce every command,
network action or semantic choice is equally inaccurate. Universal shell parsing and test locks add bypass complexity
without creating OS isolation. Installing a larger framework or maintaining scores is not a substitute for fixing the
reproduced failure.

**Revisit when.** Revisit when review or real use reproduces a defect that the current path can deterministically
prevent, or host capabilities support a smaller reliable boundary. Establish the failure and its required effect
before adding a mechanism; measure false blocking and successful normal paths as well as rejected unsafe cases.

## Distribution and sources

**Choice and reason.** The author's common marketplace points to each plugin's independent repository and release tags.
Development testing is kept apart from distribution, and host installation, updates and releases are done on user
instruction that includes those effects.
[repository](../specs/repository.md#distribution) owns distribution, versions and rollback.
The repository is distributed under Apache-2.0, and third-party parts keep their original licenses and notices. Copied
content and idea references are recorded separately in [SOURCES](../../SOURCES.md), and [LICENSE](../../LICENSE),
[LICENSES](../../LICENSES/) and [NOTICE](../../NOTICE) are maintained.
Unlike the change history of the current design, source records explain the provenance of what is shipped.

**Alternatives.** Running a separate catalog per plugin splits per-author management.
An automatic cross-repository publishing pipeline does not add shared credentials and failure paths until the need is
confirmed.
Unifying under a single MIT license does not fit the chosen patent clause or keeping third-party licenses distinct.

**Revisit when.** Review when plugin distributions are repeatedly tied to each other or catalog update errors recur, or
when introducing new third-party content or changing the license or distribution boundary.
