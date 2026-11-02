# Ship

Done when the project's integration and completion gates pass and the resulting commit and Issue status are verified.
Apply the common [integration](#integration) and
[completion](#completion) gates; this reference owns the devflow-specific order.
A review-only request ends in review; enter ship only for the requested integration or completion work.

Ship records on the Issue branch, since `devflow-state` writes an Issue only from its branch. When the whole scope ships it
closes the Issue before integrating, except under `pr-ci`, where it closes after the merge is seen (step 4); a partial
ship leaves the Issue open.

1. Pass the project's `verify` gate on the Issue branch. Under `pr-ci`, push the branch and take CI's `verify` success on
   that exact HEAD as the evidence, bound as in integration; if CI does not run `verify` or its result cannot be
   verified, run `verify` locally. Other profiles run it locally
   ([.devflow.json](../../../docs/specs/repository.md#devflowjson)).
2. When the change adds, removes or renames a skill or changes a `SKILL.md` name or description, the trigger eval in
   [eval](../../../docs/specs/eval.md) is available; it is optional, and the user runs it in their terminal. Note in the ship
   checkpoint whether it ran and its result.
3. Reconcile the scope and criteria against the completion gates above. Check off each evidenced criterion with
   the card's `Tool:` command before closing; unmet scope stays open. Post the ship checkpoint, replace the
   state block with `단계: done` and `남음: push 확인, 로컬 브랜치 정리`, and close the Issue; under `pr-ci`, and for
   a partial ship whose scope stays open, see below instead.
4. Integrate. If a required integration check fails (including CI after a successful push), or the push is refused,
   return to the Issue branch, reopen a prematurely closed Issue and restore its state: a failed check returns to
   build, anything else to ship.
   With `pr-ci`, a merge is not done until it is seen: in step 3 keep `단계: ship` with `남음: PR 병합 확인` and leave the
   Issue open; merge by the project's rule ([devflow](../../../docs/specs/repository.md#integration-and-ci)); confirm the merged SHA on
   the target branch and the checks the project requires after merge; then, from the Issue branch, set `단계: done`
   and close the Issue only when every criterion is checked. A partial ship keeps the Issue open with its remaining
   scope in the state block. No closing keyword goes in the PR body or any commit message it merges, so GitHub does
   not close the Issue.

Cleanup is recorded in the ledger only. `workspace-cleanup` owns integration proof, including squash/rebase
equivalence, and non-forcing deletion; a refused deletion retains the branch.

## Integration

When drafting a PR (locally, bound to the available diff, if remote metadata is absent), apply [review](review.md) and the project template: problem/outcome, scope/exclusions, acceptance/checks/limits, Issue/completed-subset links; leave remnants open. Integration requires evidence that review is complete; a readiness assessment checks that evidence and does not perform the review.

Follow project CI policy ([devflow](../../../docs/specs/repository.md#integration-and-ci)). Report each required CI check's supplied or observed state and revision; mark it NOT_VERIFIED unless it succeeded at the revision that check must test under the project's policy for the current head (for example the head itself on a branch push, or the merge of the current base and head on a pull request run). Local checks/templates replace no required CI/protection/approval/thread gate. Zero checks: NOT_VERIFIED until local checks pass with PR evidence. No CI: pass documented local gate hook or record checks in PR/integration commit.

For failed required CI, the next action is to investigate and fix its cause, then obtain success at the revision that check must test for the final head; a code change means a new head to verify. An assessment reports these steps without performing them.

Assess supplied CI against the project's required check and the revision it must test; unrequired identifiers stay unknown, not new gates. Before mutation bind live CI to repo/workflow/run/attempt/event/base/head/checkout and synthetic/head/post-merge type; reject unrelated runs. Refresh base/head/rules/CI/approvals/threads; guard expected head or hold races. Merge by project method without bypass; verify result/required post-merge checks.

After verified merge, [cleanup](cleanup.md#readiness-without-deletion).

## Completion

Verify start record or establish repo/linked Issues/milestones/closure gate/tracker authority.
Close only satisfied Issues/milestones with reviewed criteria/dependency evidence; resolve Issues as completed. Reconcile findings/linked work; paginate all milestone Issues/PRs, including moved/cancelled/unverified work. Report inventory completeness and counter scope from their own evidence. Record evidence/remnants; others stay open with next action. State/checkboxes/merge/successors/counts prove nothing. Never weaken criteria; rescope/deferral needs authority, retaining blockers. Report/reopen premature closure; no duplicate closures/comments.

With `.devflow.json`: [ship](#ship) sequence; card `Tool:` for all Issue I/O; unattended runs keep Issue text in ledger notes.
Assess each Issue against its own criteria/dependencies. When a supplied PR or commit links it, verify full/partial scope; hold linked closure until applicable post-merge/release gates pass. Unlinked Issues keep independent eligibility. Authorized local-only: agreed install/artifact-identity gate.

Devflow: create successors now only for user-decided deferrals/reproduced defects; propose other remnants with ledger followups as one ship list.
Successors: search open/closed matches; reuse open or justify new/reopen. Include problem/evidence, scope/observable criteria, dependencies, source Issue/PR, next action, confirmed owner/priority or unknowns; authorized links both ways. Invent no backlog/private logs/milestones/assignments/deadlines.

Verify required successor existence/scope before source closure; failed/uncertain transfer stays incomplete. Unrelated followups cannot block completion. Report closed/open/unverified trackers, successor links, pending writes.
