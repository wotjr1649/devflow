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
  against the case's grader; the `llm` judge's score is a metric. The judge often fails a healthy answer that says it
  made no write because the case allows no write tool, so a score alone can report a regression that is not there.
- Run the default 2-arm comparison of no plugin against the current plugin. For a change to structure, run the same
  cases on the revisions before and after the change with the same model and compare.

Write case files that contain backslashes with an edit tool, not a shell heredoc, and check the bytes.
