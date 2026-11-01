# Research sources

Material used as design evidence. Originals are not copied; only links and our own summaries are kept. If a claim about
host behavior looks doubtful, check the original here again. Host documentation changes often.

## Sources the user specified

- [OpenAI: Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)
  - Write skill descriptions short and with non-overlapping scope.
  - A skill with several workflows keeps its root as a router.
  - Recipe-style instructions constrain newer models.
  - AGENTS.md holds situational pointers.
  - Permit safe work explicitly and recalibrate strong boundary wording. Boundaries meant to stop an older model can
    stop a newer one more than needed, so review the [boundary wording](../specs/documents.md#text-agents-read) when
    the model that reads the instructions changes.
  - Define the completion condition first.
- [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)
  - The default effort is `medium`; raise it only after measuring the effect. On coding, `medium` matches or beats
    Opus 5 at `high`.
  - Telling the model to write its reasoning in the response invites refusals.
  - Unattended runs: keep a checklist and limit automatic continuation to 2-3 times.
  - How to receive progress updates, how pasted text is shown, and time signals for multi-agent work.
- [Prompting Claude Sonnet 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5)
  - The effort levels were recalibrated. For agentic coding, start at `medium` for well-defined tasks and at `high` for
    hard or long ones. Opus is better for the hardest long-running work. On long tasks at `medium` or below, the model
    tends to stop and ask for confirmation before finishing.
  - Scope paragraph: carry on to the end but add nothing that was not asked for.
  - At `xhigh` and `max` it reviews itself and spawns reviewers.
  - Count only checks that were actually run as verification.
- [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
  - Give reasons rather than prohibitions. Emphasis words trigger over-reaction.
  - General instructions beat prescriptive steps.
  - On long tasks, a fresh context that restores state from the file system can work better.
  - Track state with git and a progress record.
- [Agentic coding is straining CI](https://claude.com/ko/blog/agentic-coding-is-straining-ci-heres-how-we-scaled-test-impact-analysis-at-anthropic)
  - CI load grows exponentially as agents multiply.
  - Selecting only the affected tests makes it easier for agents to verify themselves.
  - Small PRs, service instrumentation.
- [Skills explained](https://claude.com/ko/blog/skills-explained)
  - Progressive disclosure: metadata, body (under 5,000 tokens), files when needed.
  - How skills differ in role from prompts, projects, subagents and MCP.
- [Improving skill-creator](https://claude.com/ko/blog/improving-skill-creator-test-measure-and-refine-agent-skills)
  - Skills split into capability-uplift and preference-encoding kinds.
  - Evals and benchmarks, blind A/B, description trigger tuning.
- [The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook)
  - Each stage produces a committed artifact that the next stage reads.
  - One source of truth per artifact.
  - Plan mode, a short CLAUDE.md, skills as advice and hooks as enforcement.
  - Feedback loops, configuration evals, REVIEW.md.
- [Capture as intent.md (Academy)](https://academy.claude.com/courses/ai-native-sdlc-playbook/capture-intent)
  - Same as the playbook's Plan stage. Intent template, commit after review, measurement metrics.

## Host documentation

- Claude Code
  - [Skills](https://code.claude.com/docs/en/skills): frontmatter, invocation control, listing budget, what is
    re-attached after compact, eval. External advice to move repeated rules into hooks is kept separate from devflow's
    [current choice](../design/current-decisions.md#instructions-and-protections).
  - [Plugin reference](https://code.claude.com/docs/en/plugins-reference),
    [Plugin components](https://code.claude.com/docs/en/plugins/components),
    [Plugin loading](https://code.claude.com/docs/en/plugins/loading): namespaces, agent frontmatter limits,
    in-place loading, scopes.
  - [Plugin evals](https://code.claude.com/docs/en/plugin-evals): comparison with and without the plugin,
    `tool_used: Skill` grading.
  - [Worktrees](https://code.claude.com/docs/en/worktrees): base branch and cleanup of subagent worktree isolation (M3).
  - [Subagents](https://code.claude.com/docs/en/sub-agents): criteria for choosing main versus subagent,
    resume and `SendMessage`, tool filters, precedence of `model` and `effort` at invocation.
  - [Hooks](https://code.claude.com/docs/en/hooks): only exit 2 and denial block while other errors and timeouts pass,
    Stop block, the SessionStart 10,000-character cap, Windows shell selection.
  - [Workflows](https://code.claude.com/docs/en/workflows),
    [Agent teams](https://code.claude.com/docs/en/agent-teams),
    [Best practices](https://code.claude.com/docs/en/best-practices).
  - [Memory and AGENTS.md](https://code.claude.com/docs/en/memory),
    [Context window](https://code.claude.com/docs/en/context-window),
    [Model config](https://code.claude.com/docs/en/model-config): alias resolution, effort levels, `ultrathink`.
  - [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview),
    [Effort](https://platform.claude.com/docs/en/build-with-claude/effort): price, use and recommended effort per model
    (haiku starts at `medium`; `low` tends to skip searching and checking in long agentic work).
  - Built-in [agents-md plugin](https://github.com/anthropics/claude-code/tree/main/mods/agents-md) (2282079,
    2026-09-30): how AGENTS.md is looked up again for each context, and recomputation after compact.
- Codex
  - [Skills](https://learn.chatgpt.com/docs/build-skills): locations, implicit invocation, `agents/openai.yaml`,
    listing budget.
  - [Plugins](https://learn.chatgpt.com/docs/plugins),
    [Hooks](https://learn.chatgpt.com/docs/hooks): plugin hooks, SessionStart matchers, Stop input and output, path
    variables.
  - [Build plugins](https://developers.openai.com/plugins/build/plugins): local-source marketplace format, install cache
    location.
  - [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents): built-in and custom agents,
    precedence of the model and effort given at spawn, luna starts at `high`.
  - [Models](https://learn.chatgpt.com/docs/models), [OpenAI models](https://developers.openai.com/api/docs/models),
    [Latest model](https://developers.openai.com/api/docs/guides/latest-model): use and price per ID, terra starts at
    `medium`, sol and astra for the hardest coding.
  - terra coding performance (2026-11-01): [Artificial Analysis](https://artificialanalysis.ai/articles/gpt-6-1-terra-pushes-the-cost-efficiency-frontier)
    Coding Agent Index terra 48, sol 54, luna 31; [system card addendum](https://deploymentsafety.openai.com/gpt-6-1-terra/addendum-to-gpt-6-astra-system-card-gpt-6.1-terra)
    Sandbox Bench terra 22.7%, sol 41.9%.
  - [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md): lookup order, size limit.
  - [Multi-agent (Responses API)](https://developers.openai.com/api/docs/guides/responses-multi-agent):
    basic spawn, message, follow-up and wait capabilities.

## Writing on orchestration

- [Cognition: Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents):
  share context, and write from one place.
- [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents):
  initializer agent and coding agent, feature list, progress record, one feature per session.
- [Claude: When to use multi-agent systems](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them):
  it costs several times the tokens. Split along context boundaries. Verification subagents.
- [obra/superpowers](https://github.com/obra/superpowers): brainstorming, writing-plans,
  subagent-driven development, finishing a branch.
  [Release notes](https://github.com/obra/superpowers/blob/main/RELEASE-NOTES.md) (through v6.4.2): path
  classification to scale the procedure, a ledger per plan, one review per task and one per branch, an explicit model
  for each delegation, removal of the plan-review loop that had no effect, the cheapest approach of running directly
  in main, trigger and transcript tests.
- [Spec-driven development benchmark](https://uvik.net/spec-driven-development-benchmark/): on 50 tickets the spec
  approach reduced review defects, but gave no benefit for changes to 1-2 files or for bug fixes. Conclusion: use it
  selectively.
- [Invariants, not frameworks](https://ranjankumar.in/spec-driven-development-invariants-not-frameworks): state on
  disk, context bound to the unit of work, position tracking, fresh context per stage. The point at issue is scaling
  the procedure.
- [DORA 2025](https://dora.dev/research/2025/dora-report/): AI amplifies an organization's strengths and weaknesses
  and raises instability along with throughput.
- [METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/): perceived and measured
  productivity differ. Judge the effect by measurement.

## Scope of enforcement and measurement

Sources consulted when choosing [instructions and protection](../design/current-decisions.md#instructions-and-protections). The
originals were checked on 2026-10-31.

- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)
  (2026-01-09): start with 20-50 tasks drawn from real failures. It is written for teams building agent products.
  Grade deterministically where possible and look at the outcome, not the path.
- [OpenAI: Testing Agent Skills Systematically with Evals](https://developers.openai.com/blog/eval-skills): when a
  skill's name, description or instructions change, compare with 10-20 prompts and a few required checks. Adding it to
  CI is optional.
- [Anthropic: Claude Code auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode) (2026-03-25): users
  accept 93% of manual approval requests. Because of approval fatigue, approval prompts that stop work protect little. A false-positive
  block is returned with its reason so that one retry ends it.
- [Naresh Jain: Are Harnesses Worth the Cost?](https://martinfowler.com/articles/are-harnesses-worth-the-cost.html)
  (2026-10-13): the same service was built 10 times each way. The strong model scored 10/10 with or without the
  harness, and the harness cost about 10 times the tokens and about 3 times the time. The weak model rose from 3/10 to
  10/10. It is the result of a single task.
- A 2026-10-31 survey of 7 public workflow tools (addyosmani/agent-skills, toss/apps-in-toss-harness,
  anthropics/claude-plugins-official, cursor/plugins, mattpocock/skills, github/spec-kit, obra/superpowers) observed a
  setup that leaves judgments such as TDD, review and scope to instructions and runs behavior evals optionally. Within
  that survey no tool was found that made a measured score a merge or release condition. This observation is limited to
  the time and tools surveyed and does not guarantee the behavior of the whole ecosystem or of later versions.

## Security

- [Comment and Control](https://github.com/vectara/awesome-agent-failures/blob/main/docs/case-studies/comment-and-control-prompt-injection.md):
  through PR titles, Issue bodies and comments, and hidden HTML comments, a coding agent published secrets in a public
  comment. An agent that writes to a public timeline needs output filtering, minimal-scope secrets and short-lived
  credentials.
- [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail): a real example of packaging for both hosts.
