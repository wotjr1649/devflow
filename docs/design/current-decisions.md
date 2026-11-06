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

**Choice and reason.** The Issue owns approved intent, stable acceptance-criterion identities and public progress.
The validated ledger owns execution phase and active work. Versioned delivery state owns the selected criteria, tasks
and original/review baselines. Git and the external provider own actual code/ref and integration facts; execution
records retain their source and applicability. A copied claim or content hash does not prove that a check ran.
[Issue contract](../specs/issues.md), [ledger](../specs/ledger.md), [lifecycle](../specs/lifecycle.md) and
[documents](../specs/documents.md) own these rules. A stale Issue phase cannot move a valid local run backwards, and the
ledger cannot overwrite a newer human change to intent. Cross-machine recovery validates the missing private state.

Control changes use validated transitions and exclusive storage commits. Appended notes do not become an independent
control state. Time elapsed is not proof that a lock owner stopped; recovery must prevent the previous holder from
committing. Migration must fence actual old CLI and hook writers before the new state is authoritative. An unknown
baseline or ambiguous old criterion mapping is recovered rather than guessed.

**Alternatives.** A single overloaded base for both task and delivery loses earlier changes at final review. Version
checks only in the new reader do not constrain old code. Multiple mutable state machines increase reconciliation cost.
A local lock is coordination among cooperating processes, not an OS or cross-machine security boundary.

**Revisit when.** Revisit the storage mechanism when supported native hosts cannot provide the required exclusive commit,
or when cross-machine writers need a server-enforced transaction. Keep actual host tests separate from local fixtures.

## Execution and delegation

**Choice and reason.** The parent owns shared state, decisions outside a brief, final verification and integration.
It delegates bounded tasks when independent evidence or context savings justify dispatch cost. Role contracts are
separate from the parent's delegation procedure, so a dispatch reads only its selected role. Fresh children receive
necessary boundaries, exact criteria, scope, baseline and result provenance without the parent's whole conversation or
an expected verdict. The lifecycle keeps M0-M3 and its three paths; parallel implementation requires independent file
ownership, settled interfaces and a supported isolation path.

The main model remains the user's choice. Host capability and applicable preferences determine permitted overrides;
otherwise the child inherits. The router does not hardcode model versions or prices. Existing findings about past model
trials remain historical evidence, not promises about a later model or host. The plugin continues to use built-in
agents rather than adding another set of agent definitions.

A role's instructions do not restrict tools or credentials by themselves. The existing delegation tripwire observes
its recorded paths and selected remote effects; it is not isolation. The trusted Git reader constructs static review
material without external diff/textconv/fsmonitor effects and without replacement-object interpretation. After an
unverified or changed local state, keep the review open until the trusted state is recovered. Preserve the distinction
between advisory roles, helper contract checks and real host permissions.
[Orchestration](../specs/orchestration.md) owns the dispatch, host and evidence contracts.

**Alternatives.** Always delegating duplicates contexts for small work. Passing all role manuals or full parent history
increases load and biases independent review. Combining several all-in-one coordinators creates overlapping state,
continuation and publication paths. Worktrees alone do not isolate remote refs or shared state.

**Revisit when.** Add a role or host adapter only when observed task outcomes justify it. Evaluate model/effort changes
with fixed controls, and repeat loading/permission cases when the host interface changes. Budget exhaustion and unknown
child exit remain explicit unresolved outcomes rather than success or permission to relaunch.

## Entry points and stages

**Choice and reason.** One lifecycle skill, `devflow`, is the only entry point. It takes new work, continuation, stage
transitions, review, PR and merge, cleanup and handoff in repositories with `.devflow.json`, and its SKILL.md links
the ten stage references and the selected session/delegation/role contracts in `skills/devflow/references/` directly. Repositories without `.devflow.json`
get no lifecycle skill at all; that compatibility loss is accepted.
One description decides invocation, so no two lifecycle descriptions compete for the same request. Each reference is
one level from SKILL.md and finishes its procedure without reading another, so no step depends on a second hop. After
compaction a host reattaches only the start of an invoked skill body, so the router puts scope, Issue I/O and the stop
conditions first, and those survive while reference files do not.
The devflow skill sets routing, stages per path and going back ([why](../specs/lifecycle.md)), and
[documents](../specs/documents.md) sets document size and progressive reading.

**Alternatives.** Keeping the start, review and cleanup skills as thin wrappers around the router keeps their
descriptions overlapping. Nested references break the one-level rule. Separate integration and completion references
linked from SKILL.md are not taken because ship needs both every time. Inlining every role and perspective in each stage duplicates unrelated context; each fresh child still needs its own essential contract.
Applying the same stages to every path raises the cost of small changes.

**Revisit when.** Review when requests are repeatedly routed to the wrong stage or reference, when the router outgrows
its size budget or the stop conditions no longer fit its start, when stage cost exceeds results, or when a host's skill
loading or compaction behavior changes.

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

**Choice and reason.** Acceptance criteria are proven by real execution, and review separately checks defects and
evidence.
Even small changes are judged by meaning rather than file extension or line count. Review reports are short prose, and
re-review is narrowed to fixes that changed behavior or permissions.
The devflow skill's review reference owns the scope of checks and review ([why](../specs/orchestration.md#review)).
devflow itself links the reviewed SHA to CI and the integration record through PRs, server protection and merge commits.
CI binds the actual checkout revision and the project's required head/base policy, not the event name alone. It does not
replace per-criterion execution evidence or independent review. Final delivery review retains the full delivery range;
whole-Issue closure requires still-applicable evidence for all required criteria after subsequent deliveries.
[repository](../specs/repository.md#integration-and-ci) and [check evidence](../specs/repository.md#devflowjson) set the conditions
for widening or substituting local checks, independent review including M0, CI on the branch HEAD and the latest merge
result, the recheck right before integration, and the post-integration check.

**Alternatives.** A structured report CLI is not added without evidence that the cost of the report format leads to
fewer defects.
Updating main through local gates alone does not replace server protection. Squash and rebase do not fit preserving the
reviewed commit SHA.

**Revisit when.** Review when the prose format itself is confirmed as the cause of repeated defects, when review findings
at the same spot recur, or when the link between CI evidence, reviewed revision and integration method must change. Do
not bypass the rules or server protection first.

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

**Choice and reason.** Development judgment is handled by concise instructions and review. The helper enforces deterministic
identity, transition and I/O conditions on its own entry point, with regression tests and CI checking the implementation.
Hooks handle resume, unattended continuation and session release. [hooks](../specs/hooks.md) sets the limits on input,
session handling and real host evidence, and [ledger](../specs/ledger.md#unattended-runs) the continuation conditions. The Issue
CLI's public filter and unattended write refusal are the behavior of that path.
Direct posting is not read as a security boundary that hooks block. Review checks test changes, and the safety floor
stays in the instructions.
[documents](../specs/documents.md#text-agents-read) owns document rules, and
the devflow skill's learn reference the placement of lessons ([why](../specs/lifecycle.md#learn-and-memory)). The trigger eval is an optional tool of
[eval](../specs/eval.md).

**Alternatives.** Enforcing every action through shell command parsing, posting blocks and test file locks costs a lot in
chasing bypass forms and does not replace OS isolation either.
Making measured scores a condition for integration or release can let maintaining the mechanism replace the purpose of
the work.

**Revisit when.** Review when review repeatedly misses weakened tests or missing public filters, or when the same defect
reproduces in instructions and real use.
Before adding a mechanism, confirm the cause of the failure and the effect to protect.

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
