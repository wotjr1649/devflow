# Review

Done when the review found no defect that affects correctness or the requirements, or each one went back through build
and verify and a narrowed re-review passed. `pr-review-workflow` runs the review; this is what devflow hands it.

- From M1 up the final review runs in a fresh context: the `reviewer` agent, or in Codex a worker told to report only.
  Write the package first: `git diff <base>..HEAD > .work/devflow/i<issue>/review-package.diff`, with the ledger's
  `base`. Give the reviewer that file, the acceptance criteria, the plan summary and REVIEW.md if the project has one -
  and no verdict, because a reviewer told the answer confirms it. Name by path any input git ignores (private tests,
  verification output): the reviewer's Glob cannot find it.
- A reviewer, verifier or implementer started in the background goes into the ledger's `running` with `running <issue>
  add <label>` and comes out with `running <issue> done <label>` when its result arrives or it fails or stops.
- In M0 the main session rereads the diff against the criteria instead; the change was small enough to say in one
  sentence.
- A change to a `.devflow.json` `highRisk` path also gets the security perspective from [perspectives](perspectives.md).
- Fix findings that change behaviour or break a requirement; a reviewer asked to find something finds something, and
  fixing every remark over-builds the change. Record the disposition of each finding in the checkpoint.
- After the fixes: a fix that changes anything but `.md` documents goes back to a fresh-context verifier for the
  criteria it touches; a documents-only fix is checked by the main session with doctor and the tests. Once BASE..HEAD
  differs from what the reviewer saw, a narrowed re-review of that difference passes before integrating, even for
  documents ([review](../../../docs/specs/orchestration.md#리뷰)).

## Before integrating

Ship measures, records and closes on the Issue branch before it integrates: worktree reflogs and old host records
disappear later, and `devflow-state` writes an Issue only from its branch. Rules: [metrics](../../../docs/specs/metrics.md).

1. Read the cycle's guard blocks (`guard-events.jsonl` beside the ledger). Count each one that stopped a legitimate
   action, and any intervention not yet counted, with `metric` on the card's `Tool:` command.
2. Run the project's `verify` gate, and on the Issue branch `devflow-doctor` where `.devflow.json` lists `tests`.
   Any `tests unlocked` line in the ledger's notes goes into the ship checkpoint with its reason.
3. Decide the trigger eval by [eval](../../../docs/specs/eval.md#eval): `git diff --name-status <base>..HEAD -- skills
   evals/trigger` shows added, deleted or renamed skills and any changed eval case, and `git diff -U0 <base>..HEAD --
   'skills/*/SKILL.md'` shows changed frontmatter lines. When it is due, ask the user to run it in their terminal, since
   it cannot authenticate inside a session, with `--no-publish` as in that command, so the report stays local. Record
  each host's result with `metric <issue> eval <passed>/<total> --host claude|codex --rev <commit it ran on>`. Either
  way the ship checkpoint has a `- 트리거 eval:` line: per host `통과/전체 @rev`, or that it did not run and why.
  `comment` refuses a ship checkpoint without that line, the `- 측정(v…)` line, or, when the notes hold an unlock, a
  `- 시험 잠금 해제` line.
4. Once every delegation has finished (the ledger's `running` is empty), run `devflow-metrics <issue>` (next to the
   `Tool:` command) from the Issue's work tree and save its output as `artifacts/metrics/i<issue>.json` in the main work
   tree: the host writes subagent records late, so a delegation still running adds records before the saved `until`.
5. Post the ship checkpoint with the line from `devflow-metrics <issue> --line --until <the saved until>`, replace the
   state block with `단계: done` and `남음: push 확인, 로컬 브랜치 정리`, and close the Issue.
6. Integrate. If a required integration check fails (including CI after a successful push), or the push is refused,
   return to the Issue branch, reopen a prematurely closed Issue and restore its state: a failed check returns to
   build, anything else to ship.

Cleanup is recorded in the ledger only. `workspace-cleanup` owns integration proof, including squash/rebase
equivalence, and non-forcing deletion; a refused deletion retains the branch.
