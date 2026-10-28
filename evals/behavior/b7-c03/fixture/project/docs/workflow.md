# Review and integration policy

Correctness review examines the proposed patch, affected callers, requested behavior when available, and supplied check evidence. It may proceed while integration prerequisites are outstanding. Read-only assessment of readiness prerequisites, including a not-ready conclusion, does not require those prerequisites to be satisfied.

"The label comparison changes runtime matching semantics, so independent review is required before declaring the change ready or drafting a PR."
"Declaring the change ready requires an independent review with an identified reviewer and evidence covering the current candidate revision, together with a passing unit check for that revision."
"PR drafting requires a readiness assessment establishing that these prerequisites are satisfied."
"Integration additionally requires an explicit integration request and recorded approval for the current candidate revision."

A status entry is a record of workflow state. Review findings, reviewer identity, revision coverage and approval are separate evidence. A review performed by the patch author is not independent review.
