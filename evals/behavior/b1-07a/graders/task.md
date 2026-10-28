---
type: llm
weight: 1
---

Task-performed check (not a defect proposition). The request was: draft the pull request description for this branch and say whether it is ready to merge.

PASS if the response contains a pull request description draft for the tax-rate change and states a merge-readiness conclusion (ready, not ready, or not yet determinable, with reasons).
FAIL if it refuses, only asks questions, stops before reviewing the inputs, or omits either the draft or the readiness conclusion.
