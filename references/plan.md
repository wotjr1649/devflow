# Plan

Done when an engineer who never saw the conversation could build from the plan alone, as
[계획](../docs/specs/orchestration.md#계획) describes, and its prerequisites ran: the stage-boundary checkpoint says go or
no-go. This is the last point where a wrong plan costs a page instead of a build.

- The plan is private: `docs/plans/YYYY-MM-DD-i<issue>-<slug>-plan.md`. Per task: the files, the order, the interfaces
  it consumes and produces, and the check that proves it. For the whole plan: the project constraints that apply and
  the inputs users are likely to hit that no test covers.
- Before settling it, answer three questions in the plan: what could break, which step is riskiest, which alternative
  was not taken and why.
- Run the prerequisites rather than assuming them: declared dependencies install, the tools exist, the check commands
  start and fail or pass as expected, and every effect the plan needs is covered by standing permission or an
  instruction.
- Pick the run mode by [실행 모드](../docs/specs/orchestration.md#실행-모드) and record `runMode`.
- When the plan changes a trust boundary (authentication, permissions, secrets, hooks, handling outside input) or has
  five or more tasks, review it once with the design perspective from [perspectives](perspectives.md), using the
  host-specific design-review role in [roles](../docs/specs/orchestration.md#모델과-effort).
- The public summary is four lines - files, order, risks, proof - plus go or no-go, in the stage-boundary checkpoint,
  because the plan itself is not in git. No-go stays in plan, or goes back to design when an assumption broke, with the
  reason.
- Record `task {current: 1, total: N}` in the ledger.
