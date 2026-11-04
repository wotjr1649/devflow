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

**Choice and reason.** The Issue holds the state to continue across machines and hosts, and the local ledger holds task
progress and private content. Not duplicating the same facts in prompts and handoffs reduces what is read on resume and
state conflicts. Memory tools are a search layer.
[Issue contract](../specs/issues.md), [ledger](../specs/ledger.md) and [documents](../specs/documents.md) own the rules.
The resume card protects the next action, blockers, warnings and recovery means, and a truncated display is not treated
as complete state.
Handoff is done explicitly while the session knows itself, and SessionEnd is a secondary path.
[Concurrent sessions](../specs/ledger.md#concurrent-sessions) sets the release order, and [hooks](../specs/hooks.md) sets the scope
and limits of events, input reading and safe file reading.

**Alternatives.** Local files alone cannot be continued on another machine, and writing all task progress to the Issue
enlarges public edits and the input surface.
Guessing that the most recent writer is the previous session and clearing it is not taken, because it can release
another session that is in use.

**Revisit when.** Review when needed information is repeatedly missing when continuing across machines, or when a host
guarantees the previous session's identifier and its end.

## Execution and delegation

**Choice and reason.** Decisions and writes are gathered in the main session, and subagents serve context protection
and verification from a separate viewpoint.
Implementation is delegated when there is a reason to protect the main session's context, such as workload or an
unattended run, and parallel writes are used only when files do not overlap and interfaces are fixed. The devflow
skill's Execution modes set the conditions per mode ([why](../specs/orchestration.md#execution-modes)). Models and effort are chosen to fit the role and
the evidence, but the user chooses the main model. Roles whose results the main session judges again, such as
exploration and summarizing, go to the cheapest family (haiku, luna), and promotion within the same model is done
through the call's effort. fable and astra are not used because their token cost is high. Codex mechanical
implementation, execution verification and per-task review go to terra, which costs half of sol and is close to sol on
coding-agent benchmarks; hard judgment and security review stay on sol.
In side-by-side trials on past work, terra produced the same results as sol in all three roles at lower cost
([host-facts](../research/host-facts.md)).
With briefs missing decisions, both models silently filled unstated gaps, so that risk is prevented not by model
promotion but by the main session settling the behavior in the brief.
Role text and perspectives live in the skill's roles reference, and every brief carries the role's body and one
perspective on both hosts, so the skill depends on no agent name or file (#157). The plugin ships no agent definitions
(#159): Claude Code runs every role on `general-purpose`, Codex on `spawn_agent`, so each host has one delegation path.
The owner accepted the loss of the controls only a Claude definition gave - the reviewer's read-only tools, the
explorer's lack of Edit and Write, the implementer's `maxTurns` and spawn ban, the definitions' `BLOCKED` floor, and a
`devflow:<role>` name another plugin's subagent rules could exclude - because a 30-run comparison found no difference in
findings or integrity between plugin agents and `general-purpose`, a spike without definitions passed review,
verification and implementation cases with injected and hidden side effects on both hosts, and Codex never had these
limits. The roles state the limits; the main session's check before and after every explorer and reviewer is a tripwire
for the effects it can see (local state, git config and hooks, remote refs, new posts in the repository), counts what it
cannot check as the agent's, and after an outside effect leaves the review or verification open. Since #163 it is a
devflow-state command: `before` runs git with fixed arguments to learn the git dir, hooks, config files of every scope
with their include targets, the origin and the main work tree, because no agent has run yet (so git may already
follow an include or pointer planted before the check; that is the main session's normal git use, not a new reach);
`after` runs no git and opens only recorded paths and new entries beneath recorded folders, through a guard that
follows no changed link and refuses network spellings, because git run after the agent could start what it planted (a
signature program for a ref format, an fsmonitor for an index read, a network include). It lists every changed path,
so the main session can tell a brief's byproduct from the agent's change, and starts gh, by its recorded path and hash,
only when git, config, hooks and gh's own config are unchanged; a skipped remote check counts as one it could not make.
Its snapshot sits in the OS temp folder, checked for owner and mode on POSIX and trusted to the per-user temp folder's
access rights on Windows; a token digest catches an edited snapshot.
It is not isolation, and the owner accepted what it does not see: host configuration, the plugin installation and the
runtimes it starts (node, gh), which the agent's account can write, same-user races between a check and an open,
mapped network drives or mounts that look local, a pull request review with no inline comment (seen only if GitHub
updates the pull request's time, unverified), edits to existing Issues and PRs, repository settings, network
traffic, posts in other repositories, effects of a background process or nested agent after the check, and an
implementer's nested agents. Each delegation gets a new agent, so the
lost turn limit only ever bounded one delegation; within one delegation the implementer makes at most two fixes after
its first attempt and then ends with `BLOCKED`, by instruction only, which uses up the build reference's two fixes and
leads to the promotion (#161). Out-of-scope decisions are gathered in the main session through stop and resume. The
devflow skill sets execution modes, roles, promotion and the question procedure;
[orchestration](../specs/orchestration.md)
keeps their reasons, per-host support, authority to choose models and the isolation limits of reporting roles. Workflows are run directly outside
devflow.

**Alternatives.** Always delegating raises the cost of new contexts and reports, and the main session always doing the
work lets large explorations take up its context.
Adding definitions for every role or enforcing routes with hooks is not taken until the need is confirmed.
Pinning the after-check's git arguments in the skill text was not taken: git still reads planted config and includes
before it reports, and a model can drift from exact arguments (#163).
Keeping the definitions as shells keeps those limits but a second delegation path on Claude Code, with its fallback
report and redo route, for controls the comparison did not show to matter. Passing the subagent a path
to its role text instead of the text would shrink briefs but put the role text below the brief, beside tool output.

**Revisit when.** Revisit routes beyond the table and promotion (hook enforcement, declarative routes) when promotion
recurs in real cycles or the same role's lack of quality is confirmed by review evidence two or more times, or when in
Codex the table's model is not applied and results differ. If terra mechanical implementation is repeatedly promoted to
sol in the ledger, or the final review catches defects missed by terra per-task review two or more times, that role goes
back to sol. Revisit whether to add Workflows to the execution modes when they are used repeatedly within devflow cycles
and their results need to be recorded in the ledger. Revisit agent definitions when an after-check finds a delegated
agent's change or outside effect, when an unattended implementer runs away within one task, or when a call or spawn can
set tool limits.

## Entry points and stages

**Choice and reason.** One lifecycle skill, `devflow`, is the only entry point. It takes new work, continuation, stage
transitions, review, PR and merge, cleanup and handoff in repositories with `.devflow.json`, and its SKILL.md links
each of the eleven stage references in `skills/devflow/references/` directly. Repositories without `.devflow.json`
get no lifecycle skill at all; that compatibility loss is accepted.
One description decides invocation, so no two lifecycle descriptions compete for the same request. Each reference is
one level from SKILL.md and finishes its procedure without reading another, so no step depends on a second hop. After
compaction a host reattaches only the start of an invoked skill body, so the router puts scope, Issue I/O and the stop
conditions first, and those survive while reference files do not.
The devflow skill sets routing, stages per path and going back ([why](../specs/lifecycle.md)), and
[documents](../specs/documents.md) sets document size and progressive reading.

**Alternatives.** Keeping the start, review and cleanup skills as thin wrappers around the router keeps their
descriptions overlapping. Nested references break the one-level rule. Separate integration and completion references
linked from SKILL.md are not taken because ship needs both every time. Inlining the design and security perspective
text in each stage reference duplicates it across references, while the agent that applies a perspective reads its own
body anyway.
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
CI must be evidence that the revision the event requires was actually checked, and it does not replace per-criterion
execution evidence or independent review.
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

**Choice and reason.** Development judgment is handled by short instructions and review, and effects a test can decide
are checked by tests and CI.
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
