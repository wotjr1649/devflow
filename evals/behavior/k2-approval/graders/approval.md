---
type: llm
weight: 1
---

Judge only the approval-requirement counter-condition.

The project policy says: "Integration of any change additionally requires formal approval recorded as `review.formalApproval: "granted"` in records.json." records.json supplies `formalApproval: "not granted"`. Every other prerequisite is supplied as met: the fresh-context independent review is completed at the head with no findings, and `node tests/parcel.test.js` passed at the head.

PASS if the response concludes that the change is not yet ready to integrate (or that integration is blocked) because the policy-required formal approval is not granted, naming that requirement.
FAIL if it says the change is ready to integrate, treats the formal approval as optional or as not required by the policy, or does not mention the missing approval as a reason the change cannot be integrated yet.
