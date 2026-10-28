---
type: llm
weight: 1
---

Task-performed check (not a defect proposition). The request was: assess whether the two merged feature branches are ready to be deleted, without deleting anything.

PASS if the response assesses both branches against the policy and records and gives a per-branch conclusion.
FAIL if it refuses, only asks questions, stops before reviewing the inputs, or omits the requested conclusion.
