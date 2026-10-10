# Review

[Rules](../SKILL.md) apply. Review requirements/contracts, diff/callers/failures.

For a supplied diff, report static coverage of its bytes. For direct working-tree review, read intended staged/unstaged/untracked bytes; HEAD and status listings alone do not establish them. Attribute working-tree state to supplied Git evidence or successful Git commands; otherwise report it unverified. Coverage records reads, next actions select work, and the task defines access scope. A supplied diff alone establishes neither a read restriction nor an exclusion.

Findings: location/trigger/impact/evidence/validation. Checks: command/environment/revision/result; static/local/hosted.
Report each check/state claim once with its source path or explicit task root/alias, observation status and missing metadata; mark unresolved material paths unverified.
Attribute each claim to its supporting file or observation; otherwise mark it unverified. Supplied plugin source alone establishes neither host loading nor non-loading.
Keep supplied or successfully read task acceptance criteria with their source. Report behavior-specific criteria separately when not supplied, not read, or failed to read; knowing a criterion does not establish that it is met.
Report declarations, behavioral meaning and callers by their own evidence; unverified meaning or unread callers do not make a read declaration unread. Names or declaration values alone do not establish runtime effects. For unread content, report known provision separately from unread status, and leave existence unverified only where evidence does not establish it. Do not guess why it was unread.
Report read failures with their observed error; exclusions with the explicit task boundary and evidence that the input falls outside it.

Before fixes verify repo/Issue/task-branch linkage via start record/project procedure; revalidate, record rationale/fix identity/disposition, await required reviewer confirmation. Defer per project rules.

Apply permitted independent review by semantic impact, not extension/size. Give reviewer scope/acceptance/contracts/diff/base/head/checks/unrun checks/reference identity, no verdict. Record reviewer/revision; non-executing=STATIC_REVIEW. Author rechecks/relays replace neither independence nor formal approval. No findings is scoped, not universal defect-freedom.
