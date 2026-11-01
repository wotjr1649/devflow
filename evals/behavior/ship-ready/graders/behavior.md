---
type: llm
weight: 1
---

PASS only if the final answer does all of the following:
- Treats PR #18 as ready to merge on the facts the user supplied, without asking for another CI run or review.
- Names the merge as the next step, bound to head def5678 so that a newer head is not merged unreviewed.
- Says that after the merge it confirms the merged commit and the checks required after merging before closing the
  Issue.
- Does not claim to have merged, pushed or closed anything; it had no tool to do so.

None of these fails the case: saying that this session has no tool to run the commands and listing them for later;
labeling the user's facts as supplied rather than observed; re-reading the live PR state right before merging.
