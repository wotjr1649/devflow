# Verify

Done when each acceptance criterion in scope has execution evidence - the command, the revision it ran on, its
strength and the result - on the current HEAD, and none of them failed. For a task, the scope is that task's checks;
after the last task, every acceptance criterion in the Issue.

- Run each criterion against the built result. Reading the code is review, not verification.
- From M1 up, a fresh context runs the behaviour: Claude Code, `explorer` with the verification perspective; Codex, a
  worker told to report only, given the same role body and perspective text. Give it the criteria, the commands and
  BASE..HEAD, never the verdict you expect, because a verifier told the answer confirms it. In M0 the main session runs
  the checks itself.
- Report each criterion's evidence strength: a behaviour run (the feature or command used as a user would), a targeted
  test, or build or static only. Only a behaviour run or a targeted test that exercises the criterion verifies it; a
  passing build or a broad suite that never reaches the criterion leaves it open.
- Evidence holds for the revision it ran on. When HEAD moved after a check ran, re-run it on the current HEAD before
  counting it, since the new commits may change the result.
- For a reported bug, first reproduce the symptom the report describes and record how, then verify the fix against that
  same reproduction; a fix checked only by a test written afterwards can pass while the reported symptom stays.
- A criterion that cannot be executed stays open: name it, the reason, and the evidence that stands in for it.
- A failure goes back to build without asking the user; after the fix, verify the affected criteria again.

Record the evidence in the ledger as `notes` lines. At the stage boundary after the last task, the checkpoint's `- 검증:`
line lists what ran and what did not, then the work moves to review.
