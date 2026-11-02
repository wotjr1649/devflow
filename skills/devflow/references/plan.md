# Plan

Done when an engineer who never saw the conversation could build from the plan alone, its prerequisites ran, and the
stage-boundary checkpoint says go or no-go ([Plan](../../../docs/specs/orchestration.md#plan)). This is the last point
where a wrong plan costs a page instead of a build.

- The plan is private: `docs/plans/YYYY-MM-DD-i<issue>-<slug>-plan.md`, not committed. Per task: the files, the order,
  the interfaces it consumes and produces, and the check that proves it. For the whole plan: the project constraints
  that apply (minimum versions, dependency limits, naming rules) and the inputs users are likely to hit that no test
  covers.
- Before settling it, answer three questions in the plan: what could break, which step is riskiest, which alternative
  was not taken and why. If a decision only the user can make remains among the answers, ask the user only that.
- Run the prerequisites rather than assuming them: declared dependencies install, the tools exist, the check commands
  start and fail or pass as expected, and every effect the plan needs is covered by standing permission or an
  instruction.
- Pick the run mode by the router's Execution modes table and record `runMode` (source:
  [Execution modes](../../../docs/specs/orchestration.md#execution-modes)).
- When the plan changes a trust boundary (authentication, permissions, secrets, hooks, handling outside input) or has
  five or more tasks, review it once with the design perspective. Claude Code: delegate it to `reviewer` with the
  design perspective named in the brief; the agent holds the perspective text. Codex: the main session performs the
  review itself, as the router's Roles table says (source:
  [Models and effort](../../../docs/specs/orchestration.md#models-and-effort)). Fix the plan for each finding and recheck the affected
  tasks against the questions above.
- The public summary is four lines - files, order, risks, proof - plus go or no-go, in the stage-boundary checkpoint,
  because the plan itself is not in git. No-go stays in plan, or goes back to design when an assumption broke, with the
  reason.
- Record `task {current: 1, total: N}` in the ledger.

With five or more tasks, copy this into the reply and tick each line, because a long plan is where a step gets skipped:

```text
- [ ] per-task files, order, interfaces, proof; constraints and uncovered inputs
- [ ] three questions answered; user-only decisions asked
- [ ] prerequisites run
- [ ] runMode recorded
- [ ] design-perspective review done, findings fixed and rechecked
- [ ] checkpoint: four-line summary and go or no-go
- [ ] ledger task {current: 1, total: N}
```
