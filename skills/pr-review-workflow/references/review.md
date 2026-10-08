# Review

[Rules](../SKILL.md) apply. Review requirements/contracts, diff/callers/failures.

For a supplied diff, report static coverage of its bytes. For direct working-tree review, read intended staged/unstaged/untracked bytes; HEAD and status listings alone do not establish them. Attribute working-tree state to supplied Git evidence or successful Git commands; otherwise report it unverified. Coverage is what was read; access scope is what the task permits. A supplied diff alone establishes neither a read restriction nor an exclusion.

Findings: location/trigger/impact/evidence/validation. Checks: command/environment/revision/result; static/local/hosted.
Report each check/state claim once with its source, observation status and missing metadata.
Attribute claims to supplied evidence or successful observations; otherwise mark them unverified.
For unread inputs, including definitions and callers, report "not read; existence unverified" without guessing why.
Report read failures with their observed error; exclusions with the explicit task boundary and evidence that the input falls outside it.

Before fixes verify repo/Issue/task-branch linkage via start record/project procedure; revalidate, record rationale/fix identity/disposition, await required reviewer confirmation. Defer per project rules.

Apply permitted independent review by semantic impact, not extension/size. Give reviewer scope/acceptance/contracts/diff/base/head/checks/unrun checks/reference identity, no verdict. Record reviewer/revision; non-executing=STATIC_REVIEW. Author rechecks/relays replace neither independence nor formal approval. No findings is scoped, not universal defect-freedom.
