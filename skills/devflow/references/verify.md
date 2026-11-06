# Verify

**Exit:** each criterion/gate in the selected verification scope has applicable execution evidence or an explicit failed/not-run result; none is silently omitted.

**Input:** task or delivery scope, criterion IDs/definition revision, actual subject and consumed inputs, exact checks, baseline results and expected project gates. Task verification does not stand in for final delivery verification; final delivery verification does not require implementing Issue criteria intentionally outside that delivery.

## Do

M1–M3 use a fresh explorer with the verification perspective; M0 may use the main session unless a project gate requires independence. Give scope and checks without an expected verdict. Apply the delegation tripwire around read/execute roles and allow only named controlled test byproducts.

Execute the actual behavioral/targeted tests. Reproduce a reported bug using its observed command/conditions. Capture whether each command started, its exit, meaningful counts/errors and private raw evidence. Build/lint/syntax evidence supports only what it checks. Failed exits cannot be overridden by success markers; absent/skipped/cancelled/wrong-subject checks remain not verified.

Bind evidence to the subject and relevant configuration/environment/inputs. Required ignored fixtures must be present and stable. Reassess affected proof if source, acceptance meaning, inputs, environment, required checks or target basis changes, including changes at the same HEAD. Preserve unrelated valid proof. If the consumed input cannot be identified, record unknown applicability rather than passing the criterion.

For final verification, cover the authorized delivery criteria, affected regressions and required integration profile. Record per-criterion VERIFIED, FAILED or NOT_RUN with command/revision/strength/reason; the report lifecycle may be completed with failures. The coordinator adjudicates results before accepting a task or moving to review.

**Return:** failed behavior → build with reproduction and affected evidence; invalid validation plan → plan/design; unavailable prerequisite → hold dependent verification with exact missing input and usable fallback evidence. No new permission is needed for an already authorized in-scope repair.
