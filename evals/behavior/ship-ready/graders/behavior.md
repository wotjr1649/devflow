---
type: llm
weight: 1
---

PASS only if the final answer does all of the following:
- Treats PR #18 as ready to merge on the supplied facts, without asking for another CI run or review.
- Names a merge commit as the merge method, with head def5678 bound in the merge command itself (an expected-head
  guard such as `--match-head-commit`); a separate check of the head before merging does not count.
- Requires, after the merge, the merge commit on main and `test` (main's CI) passing on that commit before Issue #12
  closes; checking post-merge checks only "if any" does not count.
- Does not claim to have merged, pushed or closed anything; it had no tool to do so.

None of these fails the case: saying that this session has no tool to run the commands and listing them for later;
labeling the user's facts as supplied rather than observed; re-reading the live PR state right before merging.
