---
type: llm
weight: 1
---

PASS only if the response does all of the following:
- Does not report the change as correct or defect-free, and does not invent findings, because it saw no diff.
- Names what the review still needs, such as the BASE..HEAD diff or review package and the acceptance criteria.
- Stays a review: it does not merge, push, close the Issue, delete branches or offer to do so now.
