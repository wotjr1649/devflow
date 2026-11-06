# Evaluation contract

Contents: [eval](#eval), [redesign regressions](#redesign-regressions), [usage comparison](#usage-comparison).

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

## Redesign regressions

Run the deterministic Git, state, migration and Issue-write fixtures before judging a prose-only scenario. Read-only
behavior cases show routing and decisions; they do not prove mutation, concurrency, native host integration or cost.

The required failure/healthy pairs cover:

- The final delivery review includes every task; a missing delivery baseline is not replaced by the last task base.
- A valid ledger's phase wins over a stale Issue projection; a ledger bound to another repository/Issue is refused.
- A successful partial delivery can advance; a failed in-scope criterion cannot. Whole-Issue requirements remain.
- Reordering uniquely identified unchanged criteria preserves their identity; changed definitions invalidate old proof.
- Local cleanup can proceed when eligible while unsupported atomic remote deletion remains held.
- A successful intermediate task advances on its own local checks without falsely checking an unfinished end-to-end AC;
  a failed prerequisite task blocks its dependent successor.
- Local shipping keeps an Issue open before the agreed integration gate, then allows authorized closure after applicable
  target-subject proof. Source-branch checks are not silently relabelled as merge-result checks.
- Registered isolated M3 batch units can launch concurrently when independent; overlapping or unresolved dependent
  units must be resequenced or given a fixed disjoint contract.

Runtime fixtures additionally cover external diff/textconv/fsmonitor execution, original Git objects with replacement
refs, dirty snapshot stability, stale writers, paused lock owners and actual archived-v1 writers during migration.
Use temporary repositories and mocked Issue APIs; a real external write requires the applicable user authorization.
Critical wrong deletion, unauthorized writing and false completion are separate failures, not weighted score penalties.

## Usage comparison

`node evals/measure.js instructions <skill-directory>` reports unique file bytes for selected loading paths, with
hashes and a baseline-layout adapter. It does not count model tokens, observe that a file was loaded or estimate billing.

For actual usage, keep the parent, child and separately invoked hook request records. Normalize each provider's counters
into disjoint `uncachedInput`, `cacheRead`, `cacheWrite` and `output` buckets; do not sum an inclusive prompt counter with
its cache subset. A subagent's final context footprint is not its run's request total. Unknown use stays unknown.
For example, Claude Code documents `subagent_completed.total_tokens` as the final request footprint, not the sum of all
child requests: [monitoring usage](https://code.claude.com/docs/en/monitoring-usage).

Compare records with `node evals/measure.js compare <baseline.json> <candidate.json>`. Each input has this shape:

```json
{
  "control": {
    "fixture": "scenario-and-input-revision",
    "host": "actual-host",
    "hostVersion": "actual-version",
    "model": "actual-full-model-id",
    "effort": "actual-effort",
    "permissions": "actual-permission-profile",
    "cacheCondition": "cold-or-warm"
  },
  "outcome": "unknown",
  "violations": [],
  "oracleRef": "private-result-assessment",
  "coverage": { "main": false, "subagent": false, "hook": false },
  "elapsedSeconds": null,
  "requests": []
}
```

Each observed request adds `requestId`, `role` (`main`, `subagent`, `hook`), `sourceRef`,
`counterBasis: "disjoint-request-usage"` and the four normalized token buckets. Use null for an unknown bucket.
Coverage is true only after accounting for every request in that role, including confirming that a role made none.
The comparison requires matching controls, independently assessed passing outcomes, no violations and complete usage.
An early failure cannot qualify as a saving. Report unmatched outcomes and unknown measurements without a reduction
percentage. A local JSON record is an evidence index, not proof its author performed the recorded checks.

Keep hosted CI, native Windows execution, each real host's skill/hook loading, behavior scenarios and usage measurements
as distinct results. A Linux unit test cannot substitute for a Windows host run. When a runner fails before the task
starts, record the initialization failure and no task outcome or usage; do not silently change permissions or credentials.
