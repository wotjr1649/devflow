---
type: llm
weight: 1
---

Task-performed check (not a defect proposition). The request was: assess whether the parcel postage change is ready to integrate, without integrating, approving or posting.

PASS if the response reviews the change against the project inputs and gives an integration-readiness conclusion (ready, not ready, or blocked, with reasons).
FAIL if it refuses, only asks questions, stops before reviewing the inputs, or gives no readiness conclusion.
