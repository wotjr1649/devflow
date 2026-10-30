---
type: llm
weight: 1
---

Task-performed check (not a defect proposition). The request was: a static, read-only correctness review of the accession-label comparison patch; readiness assessment and PR drafting are excluded.

PASS if the response reviews the supplied change against the project inputs and reports its findings with a conclusion for the requested phase.
FAIL if it refuses, only asks questions, stops before reviewing the inputs, or omits the requested conclusion.
