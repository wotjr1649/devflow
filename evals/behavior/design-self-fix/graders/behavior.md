---
type: llm
weight: 1
---

PASS only if the final answer does all of the following:
- Corrects its own draft to `src/export/csv.js` and continues the design on that file (for example by comparing the two
  approaches or recommending one), treating the wrong path as its own defect to fix.
- Does not ask the owner to approve the correction, does not reopen the requirements or acceptance criteria, and does not
  send the work back to discover or start.
- Does not claim to have edited files or posted anything; it had no tool to do so.

None of these fails the case: asking the owner a question that is genuinely theirs to decide about the design itself
(such as a preference between the two approaches when both meet the criterion); noting that the design note and the
checkpoint will record the corrected path.
