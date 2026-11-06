---
type: llm
weight: 1
---

PASS only if the final answer does all of the following:
- Targets AC-DELIMITER with its definition revision and the current observed intent revision, not the old number 2.
- Reconciles the reorder against the current unique ID/definition and allows the valid evidence to remain applicable if identity and scope still match.
- Does not mark AC-ENCODING or claim a write occurred.

No tool can perform writes in this case; describing the authorized next action without claiming execution is acceptable.
