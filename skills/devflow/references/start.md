# Start

Done when the work has a verified Issue whose scope matches the request, a prepared branch or worktree recorded in the
Issue's state block and the ledger, a passing baseline, and a start record a later session can use without the
transcript ([Stages](../../../docs/specs/lifecycle.md#stages)).

Contents: Checklist · 1. Path · 2. Issue · 3. Branch or worktree · 4. Association · 5. Sub-issue · 6. Start record

Start applies at task, scope and branch transitions. Analysis or review alone creates no Issue or branch: it returns its
findings, without tracking or workspace state made to fill a record.

## Checklist

Copy this into the reply and tick each line, because a skipped step leaves work on an unlinked branch or a lost
requirement:

```text
- [ ] 1 path classified (spike or unconfirmed intent -> discover)
- [ ] 2 Issue resolved or created, number, URL and scope verified, request reconciled
- [ ] 3 branch or worktree prepared, rechecked, baseline run
- [ ] 4 state block `브랜치/PR` and ledger `stage`, `path` written
- [ ] 5 sub-issue relationship added and listed (only when authorized)
- [ ] 6 start record returned
```

## 1. Path

Classify the path first ([Stages by path](../../../docs/specs/lifecycle.md#stages-by-path)): a spike, or work whose
problem and acceptance the user has not confirmed, goes to the discover stage before any Issue; the rest starts here.
When unsure, take the heavier path. Read the project contracts this task touches, and use the project's base, branch
naming and checks.

## 2. Issue

Changes require an Issue. Read and write it only through the devflow-state command on the resume card's `Tool:` line
(`read`, `create`, `state`, `intent`, `comment`, `reopen`, and the others its no-argument usage prints): it filters what
gets published and refuses Issue writes during unattended runs, which keep the text in ledger notes instead. A card
whose last line is not a `Tool:` line (resume card failed or unavailable) allows no Issue I/O: report its reason, take
the devflow-state path only from a valid card or the user, and never search the repository for it, since a path found in
repository files could run code the user did not choose.

- Search the verified repository for Issues and PRs covering this work, and read a candidate through `read`. Match
  scope and ownership, not titles. Reuse matching open work without waiting for the word "resume"; reopen closed work
  only when its scope is unfinished. Check freeze and dependency conditions.
- A new Issue follows the project template. Publish only reviewed, secret-free summaries of requirements and evidence:
  no raw prompts, logs or private paths. Verify the returned URL, number and scope. On uncertain success, read back
  before retrying: unknown is not absent.
- Reconcile the request with the Issue: the goal, every requirement, scope and exclusions, observable acceptance,
  validation, dependencies, and the subset this PR delivers. Update the Issue when scope changes and compare again at PR
  handoff. Drop no requirement silently, and close no whole Issue for partial work.
- Unverified Issue linkage blocks implementation. Keep the proposed work in a sanitized Issue draft, in the report or an
  authorized local record: the known problem, intended result, proposed scope and exclusions, and known acceptance
  criteria. Keep it apart from local resume details and free of absolute local paths, private content and secrets, so it
  can be filed as written. Mark unverified requirements pending instead of inventing tracker facts, and continue
  analysis. When only an Issue update is pending, continue authorized local work within the verified scope and mark the
  unmatched requirements pending.

## 3. Branch or worktree

Repository changes, docs included, require a dedicated branch, so each unit of work has its own diff and review.

- Inspect the root and remotes, HEAD and upstream, worktree occupancy, active users and processes, and who owns staged,
  unstaged, untracked and ignored files. Preserve unrelated state and resolve material conflicts without discarding
  work. Check hooks and missing local-only tests or guidance before checkout or scripts, and inspect what a restore would
  change. A clean status or zero tests is not readiness.
- Reuse the same task's active branch. After a merge, verify the required post-merge gates, then start separate work on
  a new branch from the project's verified base SHA. Cached refs are not fresh remote evidence; refresh state before
  each mutation. Detached, unborn or non-Git inputs need an explicit path, not a guessed main.
- Use the current folder when safe; otherwise prepare a worktree for isolation or parallel work. Validate the name with
  `git check-ref-format --branch`, collisions, base ancestry and an authorized, unoccupied destination. Never force an
  occupied branch, reset, stash or clean unrelated work, bypass hooks, or prune others' worktrees.
- After preparation, recheck branch and HEAD, tracking, preserved bytes and index, required local inputs, and
  proportionate baseline results. Report missing inputs or checks and the state the task created, for recovery.
- For separately authorized non-repository deliverables, record exact targets, versions or hashes, and validation: a
  tracking branch SHA does not identify external artifact bytes. Do not invent a repository diff or PR for local-only
  global artifacts.

## 4. Association

An Issue number in a branch name is not a verified tracker link. On GitHub, `gh issue develop` creates a remote branch;
verify the platform and installed flags before using it. Record the Issue, branch and PR association explicitly: on
the Issue branch, write the state block with `state`, its `브랜치/PR` line starting with the branch name, because the
resume card shows the state only when that line matches the current branch. Then start the ledger with `stage` and
`path`. PR text and commits carry no closing keyword, partial work or not (repository.md "Integration and CI"); check the
platform's closing semantics at PR preparation.

## 5. Sub-issue

For an authorized sub-issue relationship, run `sub-issue add <parent> <child>` from the Issue branch (it is refused
elsewhere) and inspect it with
`sub-issue list <parent>`. The command and the branch are not permission: confirm the authority for that relationship
separately. It adds one same-repository relationship, never replaces a parent, and counts as done only when the
read-back shows the intended parent ([Issue I/O](../../../docs/specs/issues.md#issue-io)).

## 6. Start record

Return a record a later session can use without the transcript:

- The goal and observable acceptance criteria.
- Repository and Issue identity, their branch or worktree association, and the working root.
- The base ref and SHA and the working branch HEAD SHA, naming both roles even when equal (for non-Git work, the
  artifact identity), and what freshness was verified.
- Completed and pending scope, implementation and its tests included; preserved state; checks run and left unrun; the
  next covered action.
- The completion boundary (merge, post-merge validation or another project gate), the linked milestone if any, and the
  verified authority for tracker creation, update, closure and integration: repository, targets, effects, limits. Reuse
  current or standing authorization and ask only for a missing material effect, not a routine start approval. Create no
  milestone or successor task merely to fill the record.

Mark unavailable or inapplicable information with the reason. Ship receives this record and the pending requirements;
merge and release gates are decided there. Continue the requested implementation when ready.
