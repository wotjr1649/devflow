# Ship

Done when the integration and completion gates below pass and the resulting commit on the target branch and the Issue
status are verified.

Contents: Checklist · Sequence · Integration · Completion

Enter ship only for requested integration or completion work; a review-only request ends in review. Ship writes the
Issue from the Issue branch, because `devflow-state` writes an Issue only from its branch. While the ledger's `mode` is
`autonomous`, nothing is posted, pushed or integrated: record each in the ledger notes for the next interactive turn,
because no one is present to approve the effect.

## Checklist

Copy this into the reply and tick each line, because a skipped step merges unverified code or closes an Issue early:

```text
- [ ] 1 verify gate passed for the current head (pr-ci: CI on that head; otherwise local)
- [ ] 2 evals noted: trigger; behavior when stage rules or the description changed: worth running, ran or not, result
- [ ] 3 scope and criteria reconciled, evidenced criteria checked off
- [ ] 4 ship checkpoint and state block written (closure timing by profile; partial ship stays open)
- [ ] 5 PR drafted: summary, review evidence with reviewed SHA, `Refs #<n>`, no closing keyword
- [ ] 6 each required check succeeded at the revision it must test for the current head
- [ ] 7 base, head, rules, CI, approvals, threads refreshed; merged with an expected-head guard
- [ ] 8 merge commit and required post-merge checks confirmed on the target branch
- [ ] 9 pr-ci: `단계: done` and Issue closed after the merge is seen, every criterion checked
- [ ] 10 successors created or proposed; next stage cleanup
```

## Sequence

1. Verify gate, on the Issue branch, by the `.devflow.json` profile. Under `pr-ci`, push the branch and take CI's
   `verify` success on that exact head, bound as in Integration, as the evidence; when CI does not run `verify` or its
   result cannot be verified, run `verify` locally and still wait for required CI. `local-merge` and `push-on-request`
   run `verify` locally.
2. Evals. The trigger eval is worth running when a skill was added, removed or
   renamed, an invocation field in `skills/*/SKILL.md` frontmatter changed (`name`, `description`, `when_to_use`,
   `paths`, `disable-model-invocation`, `user-invocable`), or `evals/trigger/` changed; changes to skill bodies,
   references, hooks, agents or AGENTS.md do not change its result. It is optional, and the user runs it in an
   authenticated terminal. The ship checkpoint's `- 검증:` line says whether it ran and its result. Where the project
   has a behavior eval of its skills (for example `evals/behavior/`, `--tag behavior`) and the change alters what an
   agent does in a stage (a rule moved, removed or added, a changed routing or safety step, a changed description),
   running the cases that read the changed text three times each is worth it; wording, format and tool output changes
   are left to tests and review. A fresh-context reviewer judges those runs by their final answers and tool records,
   not the judge's score. Record whether it ran and its result, or why not. It is
   a recommendation, not a merge gate; an Issue that names behavior runs as criterion evidence is reconciled like any
   criterion, and paid runs need the user's approval.
3. Reconcile the Issue's scope and criteria under Completion. Check off each evidenced criterion with the card's `Tool:`
   command before any closing; unmet scope stays open.
4. Record. Post the ship checkpoint, then write the state block by profile:
   - `local-merge` and `push-on-request`, whole scope: `단계: done` and `남음: push 확인, 로컬 브랜치 정리`, then close
     the Issue before integrating.
   - `pr-ci`: `단계: ship` and `남음: PR 병합 확인`; the Issue stays open, because a merge is not done until it is seen.
   - Partial ship: the Issue stays open with its remaining scope in the state block, and the work returns to build for
     the remaining criteria (plan, when that work was not planned).
5. Integrate under Integration. When a required check fails (CI after a successful push included) or the push is
   refused, return to the Issue branch, reopen an Issue closed early and restore its state: build for a failed check,
   ship otherwise.
6. `pr-ci` after the merge: confirm the merge commit on the target branch and the checks the project requires there;
   then, from the Issue branch, set `단계: done` and close the Issue only when every criterion is checked.
7. Successors under Completion. Then cleanup, recorded in the ledger only, since a deleted branch can no longer write
   its Issue. Cleanup proves integration (squash or rebase by change equivalence) and deletes with non-forcing commands;
   a refused deletion keeps the branch.

## Integration

Follow the project's CI policy.

PR. Draft it with the project template: problem and outcome, scope and exclusions, acceptance, checks and limits,
links to the Issue and the completed subset, remnants left open; without remote metadata, draft it locally from the
available diff. The body holds a public summary, review evidence with the reviewed SHA, and `Refs #<n>`. Check the
platform's closing keywords while drafting: none goes in the PR body, its commits or the merge commit message, so the
platform does not close the Issue before ship verifies it. Integration needs evidence that the review stage is complete;
when the project requires independent review before integration, that covers M0 too and the author's re-read does not
count; a readiness assessment checks that evidence and does not perform the review.

Required checks. A merge needs each required check to have succeeded at the revision that check must test for the
current head: the head itself on a branch push, the merge of the current base and head on a pull request run. Report
each required check's supplied or observed state and revision, and mark it NOT_VERIFIED otherwise:

- A green run on an older head does not count. Example: head 7e1f0a2, the only green run on 3b9c4d8: NOT_VERIFIED; the
  next step is a successful run at the revision it must test for 7e1f0a2, then the merge.
- A missing, cancelled or skipped run, a run on another commit, or one with the same name from another source is not a
  pass. Assess supplied CI against the project's required checks; an unrequired check identifier stays unknown, not a
  new gate.
- Local checks and templates replace no required CI, protection, approval or review-thread gate. A PR with zero
  checks reported stays NOT_VERIFIED until local checks pass with PR evidence. A project without CI passes its
  documented local gate hook, or records the checks in the PR or the integration commit.

Without that success, do not merge, call the PR ready, or offer to merge or to accept the gap, because a result for
another revision says nothing about the code being merged.

Failed required check. Investigate and fix its cause, then get a success at the revision it must test for the final
head, and recheck; a code change makes a new head to verify. An assessment reports these steps without performing them.

Merge. Before mutating, bind each live CI run to the repository, workflow, run, attempt, event, base, head and checkout,
and to its type (synthetic merge, head or post-merge); reject unrelated runs. Right before merging, refresh base, head,
rules, CI, approvals and threads. Merge by the project's method without bypass and with an expected-head guard in the
merge command itself (for example `gh pr merge <n> --merge --match-head-commit <sha>`); a head that moved holds the
merge. Then verify the result and the required post-merge checks.

## Completion

Start's record carries the Issue, its scope and authority; verify it, or establish the repository, linked Issues,
milestones, closure gate and tracker authority.

- Assess each Issue against its own criteria and dependencies. Close only satisfied Issues and milestones, with reviewed
  criteria and dependency evidence, resolving Issues as completed. State, checkboxes, a merge, successors or counts
  prove nothing alone.
- The working Issue closes when the Sequence says. Another Issue a supplied PR or commit links: verify full or partial
  scope, and hold its closure until the applicable post-merge or release gates pass. Unlinked Issues keep their own
  eligibility.
- Reconcile findings and linked work. Paginate all of a milestone's Issues and PRs, moved, cancelled and unverified
  work included, and report inventory completeness and counted scope from their own evidence.
- Record evidence and remnants; other Issues stay open with a next action. Never weaken criteria; a rescope or deferral
  needs authority and keeps its blockers. Report and reopen a premature closure; post no duplicate closure or comment.
- Authorized local-only work passes the agreed install or artifact-identity gate.

Successors:

- Create them now only for user-decided deferrals and reproduced defects; propose other remnants, with the ledger's
  `followups`, as one list at ship.
- Search open and closed Issues for a match first; reuse an open one, or say why a new one or a reopen is needed.
- Each holds the problem and evidence, scope and observable criteria, dependencies, source Issue or PR, next action,
  and confirmed owner and priority or the unknowns; with authority, link both ways. Invent no backlog, private logs,
  milestones, assignments or deadlines.
- Verify that each required successor exists with its scope before closing the source; a failed or uncertain transfer
  leaves the source incomplete. Unrelated follow-ups do not block completion.

Report closed, open and unverified trackers, successor links and pending writes. A cleanup request that also asks for
tracking readiness applies this section; deletion authority and tracker closure stay separate.
