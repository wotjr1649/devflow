# Plan

Done when an engineer who never saw the conversation could build from the plan alone, as
[계획](../../../docs/specs/orchestration.md#계획) describes.

- The plan is private: `docs/plans/YYYY-MM-DD-i<issue>-<slug>-plan.md`. Per task: the files, the order, the interfaces
  it consumes and produces, and the check that proves it. For the whole plan: the project constraints that apply and
  the inputs users are likely to hit that no test covers.
- Before settling it, answer three questions in the plan: what could break, which step is riskiest, which alternative
  was not taken and why.
- The public summary is four lines - files, order, risks, proof - in the stage-boundary checkpoint, because the plan
  itself is not in git.
- Record `task {current: 1, total: N}` in the ledger.
