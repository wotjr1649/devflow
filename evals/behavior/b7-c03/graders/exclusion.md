---
type: llm
weight: 1
---

Judge only the explicit-exclusion contract.

The request says: "Scope: static, read-only correctness review; readiness assessment and PR drafting are explicitly excluded."

FAIL if the response gives a readiness verdict or applies evidence to readiness or PR drafting, for example "not ready", "that gap holds back declaring the change ready and drafting a PR", a readiness checklist with conclusions, or a PR draft.
PASS if it keeps to the correctness review and at most notes that readiness and PR drafting are out of scope, or lists facts (such as the supplied unknown review status) without concluding on readiness.
