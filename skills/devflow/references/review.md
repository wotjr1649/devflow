# Review

Done when the review found no defect that affects correctness or the requirements, or each one went back through build
and verify and a narrowed re-review passed. `pr-review-workflow` runs the review; this is what devflow hands it.

- From M1 up the final review runs in a fresh context: the `reviewer` agent, or in Codex a worker told to report only.
  Write the package first: `git diff <base>..HEAD > .work/devflow/i<issue>/review-package.diff`, with the ledger's
  `base`. Give the reviewer that file, the acceptance criteria, the plan summary and REVIEW.md if the project has one -
  and no verdict, because a reviewer told the answer confirms it. Name by path any input git ignores (private tests,
  verification output): the reviewer's Glob cannot find it.
- A reviewer, verifier or implementer started in the background goes into the ledger's `running` with `running <issue>
  add <label>` and comes out with `running <issue> done <label>` when its result arrives.
- In M0 the main session rereads the diff against the criteria instead; the change was small enough to say in one
  sentence.
- A change to a `.devflow.json` `highRisk` path also gets the security perspective from [perspectives](perspectives.md).
- Fix findings that change behaviour or break a requirement; a reviewer asked to find something finds something, and
  fixing every remark over-builds the change. Record the disposition of each finding in the checkpoint.

## Before integrating

Ship measures, records and closes on the Issue branch before it integrates: worktree reflogs and old host records
disappear later, and `devflow-state` writes an Issue only from its branch. Rules: [metrics](../../../docs/specs/metrics.md).

1. Read the cycle's guard blocks (`guard-events.jsonl` beside the ledger). Count each one that stopped a legitimate
   action, and any intervention not yet counted, with `metric` on the card's `Tool:` command.
2. Run the project's `verify` gate.
3. Decide the trigger eval by [eval](../../../docs/specs/lifecycle.md#eval): `git diff --name-status <base>..HEAD -- skills
   evals/trigger` shows added, deleted or renamed skills and any changed eval case, and `git diff -U0 <base>..HEAD --
   'skills/*/SKILL.md'` shows changed frontmatter lines. When it is due, ask the user to run it in their terminal, since
   it cannot authenticate inside a session. Either way the ship checkpoint says whether it ran and why.
4. From the Issue's work tree, run `devflow-metrics <issue>` (next to the `Tool:` command) and save its output as
   `artifacts/metrics/i<issue>.json` in the main work tree.
5. Post the ship checkpoint with the line from `devflow-metrics <issue> --line --until <the saved until>`, replace the
   state block with `단계: done` and `남음: push 확인, 로컬 브랜치 정리`, and close the Issue.
6. Integrate. If the push is refused, switch back to the Issue branch, reopen the Issue and set the state back: a failed
   check returns to build, anything else to ship.

Cleanup is recorded in the ledger only, and deletes the branch only once the remote default branch contains its tip.
