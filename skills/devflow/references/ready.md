# Ready

Done with a checkpoint that says go or no-go. Ready is the last point where a wrong plan costs a page instead of a build.

- Plan quality: each task names its files, interfaces and proof; nothing depends on the conversation.
- Prerequisites, by running them rather than assuming: declared dependencies install, the tools exist, the check
  commands start and fail or pass as expected, and every effect the plan needs is covered by standing permission or an
  instruction.
- Pick the run mode by [실행 모드](../../../docs/specs/orchestration.md#실행-모드) and record `runMode`.
- When the plan touches a `.devflow.json` `highRisk` path or has five or more tasks, review it once
  with the design perspective from [perspectives](perspectives.md), using the host-specific design-review role in
  [roles](../../../docs/specs/orchestration.md#모델과-effort).
- No-go goes back to plan, or to design when an assumption broke, with the reason in the checkpoint.
