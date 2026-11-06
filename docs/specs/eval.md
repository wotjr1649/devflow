# Evaluation contract

## eval

The eval is an optional tool run with `claude plugin eval`. A score alone is never an acceptance criterion or a release condition
([why](../design/current-decisions.md#instructions-and-protections)). An Issue may name behavior runs as the evidence
for its behavior criteria; each run is then judged by its final answer, tool calls and tool grader results, kept
with `--keep-temp` (`out/trace.jsonl`), and a run that errored or lacks those records does not pass.
Cases live in `evals/`, and results go in that change's checkpoint with the model, the Claude Code version and the cost.
Pin models by full ID, not alias, in `--model` and `--judge-model`. An alias changes its target when a new model ships,
which breaks before-and-after comparison.
Run it in an authenticated terminal (Bash child processes have no authentication and hang). Do not publish the report;
use `--no-publish`.
The target is a clean worktree of a committed revision. Given a path as the target, it also finds plugin copies below it
and runs their cases too, so in a work tree with a copy in an ignored folder such as `.work/` it measures another
plugin.

**Trigger eval** (`evals/trigger/`, `--tag trigger`) checks for regressions in skill invocation.

- Worth running when: the invocation fields in `skills/*/SKILL.md` frontmatter (`name`, `description`, `when_to_use`,
  `paths`, `disable-model-invocation`, `user-invocable`) changed, a skill was added, removed or renamed, or
  `evals/trigger/` changed.
- Results do not change when: only skill bodies, references, hooks, agents or AGENTS.md changed. The host decides
  automatic invocation from the skill list alone ([host-facts](../research/host-facts.md)).
- The Skill grader does not count toward the score in a 2-arm run, so run with `--ablation none`. The verdict, excluding
  runs that errored, is a trigger rate of 80% or more and a false-positive rate of 10% or less.

**Behavior eval** (`evals/behavior/`, `--tag behavior`) checks that, after entering a stage, the agent reads the right
reference and takes the correct next action.
It is worth running only for a change that alters what an agent does in a stage: a rule moved, removed or added in a
skill body or reference, a changed routing or safety step, or a changed description. Wording, format and tool output
changes are covered by tests and review. Run only the cases that read the changed text, three runs each, not the whole
suite: in this repository's history the behavior eval found defects only where a rule's flow changed, while most of its
cost went to its own case and judge defects.

- A case puts the resume card and the request in the prompt and allows only read-only tools. It makes no external
  writes.
- The `llm` grader scores by behavior (next action, refusal, not making things up). Which reference was read is only a
  metric, through a `tool: Read` grader with `arm: with-only`. Without it, the grader fails in the arm without the
  plugin and inflates Δ. Path patterns use `[\\/]+` as the separator (Windows paths are escaped as `\\` in JSON). Where
  a rule lives in a skill body rather than a file, add that skill's Skill grader as the same kind of metric (the body
  is injected without a Read).
- Each scenario has a healthy variant that should proceed and a failure variant that should stop. With only one side,
  a regression that proceeds on everything or refuses everything goes unnoticed. The `llm` grader sees only the last
  answer, so judge tool use (such as a search that should not happen) with a `tool_used` grader.
- A case that passes even without the plugin reads as a regression guard, not as an effect of the plugin.
- The evidence for a run's behavior is a fresh-context reviewer's verdict on its final answer and tool record, judged
  against the case's `llm` rubric and `tool_used` graders (not the metric-only Read and Skill graders); the `llm`
  judge's score is a metric. The judge often fails a healthy answer that says it
  made no write because the case allows no write tool, so a score alone can report a regression that is not there.
- Run the default 2-arm comparison of no plugin against the current plugin. For a change to structure, run the same
  cases on the revisions before and after the change with the same model and compare.

Write case files that contain backslashes with an edit tool, not a shell heredoc, and check the bytes.

## Matched redesign evaluation

Keep the baseline commit immutable. Compare no skill, that baseline, and the candidate using the same initial Git
objects, task, approved effects, external events, host, model, effort and budget. Do not penalize the no-skill arm for
lacking a candidate-only command or ledger field; score observable behavior. If role or model selection changes,
measure it separately after the fixed-profile comparison. Preserve failed runs and their cost.

Run checks in this order:

1. Static structure: valid links, reachable selected references, real CLI examples, shared format consistency and
   unchanged independent skills. File count or line count alone does not establish good routing.
2. Deterministic fixtures: whole-delivery versus task bases, protected-state migration and obsolete writers,
   stale lock ownership, criteria identity/revision, unknown external results, original Git object reads and exact
   expected-OID deletion. Pair rejection cases with permitted operations so refusing everything cannot pass.
3. Fresh-context decisions: exercise scope, resume, evidence, agent reports, M2/M3 and authority with healthy and
   failing inputs. The worker receives the task and applicable instructions, never the expected verdict or the
   author's diagnosis. Separate authors, behavior workers and graders. Keep case order fixed within a paired run
   and vary arm order between repetitions; disclose shared-context case packets as correlated observations.
4. Native host integration: actual installed Claude Code and Codex versions, available tool permissions, project
   instruction loading, termination and Windows filesystem/process behavior. A simulated card or a passing Node
   fixture is not proof of these properties. Missing host prerequisites produce UNRUN or UNAVAILABLE, never PASS.

The required outcomes are no observed unauthorized effects, disclosure, data loss or false completion; all
regression oracles met; healthy work proceeds without unnecessary holds; and unchanged acceptance quality. Compare
cost only after these outcomes. A next-action response is a decision probe, not an end-to-end workflow run. An
independent code review is evidence of review, not a substitute for running the affected behavior.

At minimum, record the baseline/candidate content identity, scenario version, model identifier as actually exposed,
host/version, run count, permitted tools, result, missing observations and retained trace location. Do not invent an
unexposed model ID or usage total. Repeat changed behavior cases three times when the host and budget permit; report
the actual number and variation. Re-run a wider set only to resolve a concrete remaining regression risk.

## Size and token accounting

`evals/measure-skill.py` reads a pinned Git baseline and the candidate, using `evals/read-sets.json` for declared
controller read sets. It reports exact UTF-8 bytes, lines and per-file hashes. With an explicit `--encoding`, it also
reports static counts from the named, versioned optional `tiktoken` package. It sums each complete file once per
read set. The runtime and ordinary tests do not depend on this optional measurement package.

Stage-only sets assume already validated protected state. Fresh bounded-path and new-task sets include the
candidate's mandatory initialization/session reference; do not omit that cost when comparing a new tracked task.

These counts omit prompts, tool results, output, child briefs and host framing. They are neither exact Claude token
counts nor billed usage. Do not call characters divided by four a measured token count. Report core size, total skill
size and representative selected read sets separately; more files can still mean less context.

For actual usage, aggregate the coordinator and every child by unique request ID. Distinguish input/output, cache
reads/writes and reported reasoning according to the provider's definitions; do not add a subset to a total that
already contains it. Tool bytes and file reads are separate diagnostics, not extra billed tokens. Record cold/warm
cache, failed attempts, repairs, compactions, unnecessary questions and wall time. Convert to money only with the
applicable dated price schedule. Use paired differences, median and range with the sample count; static shrinkage
alone cannot support an end-to-end cost-saving percentage.
