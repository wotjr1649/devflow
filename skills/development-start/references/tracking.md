# Tracking

Search relevant Issues/PRs in the verified repository. Match scope/ownership, not titles. Reuse matching open work without requiring "resume"; reopen closed work only when its scope is unfinished. Check freeze/dependency conditions.

Use the project template. Draft/publish only reviewed, secret-free requirements/evidence summaries; exclude raw prompts/logs/private paths. In a repository with `.devflow.json`, read and write Issues only through the devflow-state command on the resume card's `Tool:` line (`read`, `create`, `state`, `intent`, `comment`, `reopen`): it filters what gets published and queues posts during unattended runs. There, record the association in the Issue's state block, whose "브랜치/PR" line starts with the branch name (the resume card shows the state only when it matches the current branch), and start the ledger with `stage` and `path`. Verify returned URL/number and scope. On uncertain success, read back before retrying; unknown is not absent.

For an authorized sub-issue relationship, use `sub-issue add <parent> <child>`; inspect it with `sub-issue list <parent>`.
Read the relationship contract in [Issue I/O](../../../docs/specs/issues.md#issue-입출력) before using this exception.

An Issue number in a branch name is not a verified tracker link. On GitHub, `gh issue develop` creates a remote branch; verify platform and installed flags. Record the Issue/branch/PR association explicitly. Use non-closing references for partial work; check platform closing semantics at PR preparation.

Record the completion boundary (merge, post-merge validation, or another project gate), linked milestone if any, and verified authority for tracker creation/update/closure and integration: repository, targets, effects, limits. Reuse current or standing authorization; ask only for missing material effects, not a routine start approval. Pass this record and pending requirements to PR completion. Do not create a milestone or successor task merely to fill the record.
