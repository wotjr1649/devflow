# Ship

Done when the project's integration and completion gates pass and the resulting commit and Issue status are verified.
Apply the common [integration](../skills/pr-review-workflow/references/integration.md) and
[completion](../skills/pr-review-workflow/references/completion.md) gates; this reference owns the devflow-specific order.
A review-only request ends in review; enter ship only for the requested integration or completion work.

Ship records on the Issue branch, since `devflow-state` writes an Issue only from its branch. It closes the Issue
before integrating, except under `pr-ci`, where it closes after the merge is seen (step 4).

1. Pass the project's `verify` gate on the Issue branch. Under `pr-ci`, push the branch and take CI's `verify` success on
   that exact HEAD as the evidence, bound as in integration; if CI does not run `verify` or its result cannot be
   verified, run `verify` locally. Other profiles run it locally
   ([.devflow.json](../docs/specs/repository.md#devflowjson)).
2. When the change adds, removes or renames a skill or changes a `SKILL.md` name or description, the trigger eval in
   [eval](../docs/specs/eval.md) is available; it is optional, and the user runs it in their terminal. Note in the ship
   checkpoint whether it ran and its result.
3. Reconcile the scope and criteria against the completion gates above. Check off each evidenced criterion with
   the card's `Tool:` command before closing; unmet scope stays open. Post the ship checkpoint, replace the
   state block with `단계: done` and `남음: push 확인, 로컬 브랜치 정리`, and close the Issue; under `pr-ci`, and for
   a partial ship whose scope stays open, see below instead.
4. Integrate. If a required integration check fails (including CI after a successful push), or the push is refused,
   return to the Issue branch, reopen a prematurely closed Issue and restore its state: a failed check returns to
   build, anything else to ship.
   With `pr-ci`, a merge is not done until it is seen: in step 3 keep `단계: ship` with `남음: PR 병합 확인` and leave the
   Issue open; merge by the project's rule ([devflow](../docs/specs/repository.md#통합과-ci)); confirm the merged SHA on
   the target branch and the checks the project requires after merge; then, from the Issue branch, set `단계: done`
   and close the Issue only when every criterion is checked. A partial ship keeps the Issue open with its remaining
   scope in the state block. No closing keyword goes in the PR body or any commit message it merges, so GitHub does
   not close the Issue.

Cleanup is recorded in the ledger only. `workspace-cleanup` owns integration proof, including squash/rebase
equivalence, and non-forcing deletion; a refused deletion retains the branch.
