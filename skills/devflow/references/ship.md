# Ship

Done when the project's integration and completion gates pass and the resulting commit and Issue status are verified.
Apply the common [integration](../../pr-review-workflow/references/integration.md) and
[completion](../../pr-review-workflow/references/completion.md) gates; this reference owns the devflow-specific order.
A review-only request ends in review; enter ship only for the requested integration or completion work.

Ship measures, records and closes on the Issue branch before it integrates: worktree reflogs and old host records
disappear later, and `devflow-state` writes an Issue only from its branch. Rules: [metrics](../../../docs/specs/metrics.md).

1. Read the cycle's guard blocks (`guard-events.jsonl` beside the ledger). Count each one that stopped a legitimate
   action, and any intervention not yet counted, with `metric` on the card's `Tool:` command.
2. Run the project's `verify` gate, and on the Issue branch `devflow-doctor` where `.devflow.json` lists `tests`.
   Main's pre-push cannot replace this ledger-aware check ([integration](../../../docs/specs/repository.md#통합과-ci)).
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
5. Reconcile the scope and criteria against the completion gates above. Check off each evidenced criterion with
   the card's `Tool:` command before closing; unmet scope stays open. Post the ship checkpoint with the line from
   `devflow-metrics <issue> --line --until <the saved until>`, replace the
   state block with `단계: done` and `남음: push 확인, 로컬 브랜치 정리`, and close the Issue.
6. Integrate. If a required integration check fails (including CI after a successful push), or the push is refused,
   return to the Issue branch, reopen a prematurely closed Issue and restore its state: a failed check returns to
   build, anything else to ship.

Cleanup is recorded in the ledger only. `workspace-cleanup` owns integration proof, including squash/rebase
equivalence, and non-forcing deletion; a refused deletion retains the branch.
