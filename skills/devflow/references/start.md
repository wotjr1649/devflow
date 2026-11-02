# Start

Apply at task/scope/branch transitions. Analysis/review alone creates no Issue or branch.

In a repository with `.devflow.json`, classify the path first ([Stages by path](../../../docs/specs/lifecycle.md#stages-by-path)): a spike, or work whose problem and acceptance the user has not confirmed, goes to the devflow router's [discover](discover.md) reference before any Issue; the rest starts here.

Read the project contracts relevant to this task. Changes require an Issue; repository changes, including docs, require a dedicated branch. Use project base/naming/checks. Resolve material conflicts without discarding work.

At start, reconcile the current request with the Issue: goal, every requirement, scope/exclusions, observable acceptance, validation, dependencies, and this PR's subset. Update on scope changes; compare again at PR handoff. Do not silently drop requirements or close a whole Issue for partial work.

- Read [tracking](#tracking) to resolve/register the Issue.
- Read [workspace](#workspace) before branch/worktree preparation.

Refresh state before mutation.

For change-start tasks, return a start record that a later session can use without the transcript:
- The goal and observable acceptance criteria.
- Repository and Issue identity, their branch/worktree association, and the working root.
- The base ref/SHA and working branch HEAD SHA, identifying both roles even when equal; for non-Git work, the artifact identity. State what freshness was verified.
- Completed and pending scope, including implementation and its tests; preserved state; checks run and left unrun; and the next covered action.

Mark unavailable or inapplicable information with the reason. Analysis/review-only tasks return their findings without creating tracking or workspace state to fill this record. Continue requested implementation when ready. PR preparation receives this record; merge/release gates remain outside this skill.

## Tracking

Search relevant Issues/PRs in the verified repository. Match scope/ownership, not titles. Reuse matching open work without requiring "resume"; reopen closed work only when its scope is unfinished. Check freeze/dependency conditions.

Use the project template. Draft/publish only reviewed, secret-free requirements/evidence summaries; exclude raw prompts/logs/private paths. In a repository with `.devflow.json`, read and write Issues only through the devflow-state command on the resume card's `Tool:` line (`read`, `create`, `state`, `intent`, `comment`, `reopen`): it filters what gets published and refuses Issue writes during unattended runs, which keep the text in ledger notes. A card whose last line is not a `Tool:` line (resume card failed or unavailable) allows no Issue I/O: report its reason, take the devflow-state path only from a valid card or the user, and never search the repository for it. There, record the association in the Issue's state block, whose "브랜치/PR" line starts with the branch name (the resume card shows the state only when it matches the current branch), and start the ledger with `stage` and `path`. Verify returned URL/number and scope. On uncertain success, read back before retrying; unknown is not absent.

For an authorized sub-issue relationship, use `sub-issue add <parent> <child>`; inspect it with `sub-issue list <parent>`.
Read the relationship contract in [Issue I/O](../../../docs/specs/issues.md#issue-io) before using this exception.

An Issue number in a branch name is not a verified tracker link. On GitHub, `gh issue develop` creates a remote branch; verify platform and installed flags. Record the Issue/branch/PR association explicitly. Use non-closing references for partial work; check platform closing semantics at PR preparation. Unverified Issue linkage blocks implementation. To preserve the proposed work for later verification, retain a sanitized Issue draft in the report or an authorized local record: the known problem, intended result, proposed scope and exclusions, and known acceptance criteria. Keep the draft apart from local resume details and free of absolute local paths, private content and secrets, so it can be filed as written. Mark unverified requirements pending instead of inventing tracker facts, and continue analysis. If only an update is pending, continue authorized local work within verified Issue scope; mark unmatched requirements pending.

Record the completion boundary (merge, post-merge validation, or another project gate), linked milestone if any, and verified authority for tracker creation/update/closure and integration: repository, targets, effects, limits. Reuse current or standing authorization; ask only for missing material effects, not a routine start approval. Pass this record and pending requirements to PR completion. Do not create a milestone or successor task merely to fill the record.

## Workspace

Inspect root/remotes, HEAD/upstream, worktree occupancy, active users/processes, and staged/unstaged/untracked/ignored ownership. Preserve unrelated state. Check hooks and missing local-only tests/guidance before checkout/scripts; inspect restoration effects. Clean status or zero tests is not readiness.

Reuse the same task's active branch. After merge, verify required post-merge gates; start separate work on a new branch from the project's verified base SHA. Cached refs are not fresh remote evidence. Detached/unborn/non-Git inputs need an explicit path, not guessed main.

Use the current folder if safe; otherwise prepare a worktree for isolation/parallel work. Validate name with `git check-ref-format --branch`, collisions, base ancestry, and authorized unoccupied destination. Never force occupied branches, reset/stash/clean unrelated work, bypass hooks, or prune others' worktrees.

Recheck branch/HEAD, tracking, preserved bytes/index, required local inputs, and proportionate baseline results after preparation. Report missing inputs/checks and task-created state for recovery.

For separately authorized non-repository deliverables, record exact targets, versions/hashes and validation. A tracking branch SHA does not identify external artifact bytes. Use a branch for repository change work; do not invent a repository diff or PR for local-only global artifacts.
