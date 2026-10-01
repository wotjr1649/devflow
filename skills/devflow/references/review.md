# Review

Done when the review found no defect that affects correctness or the requirements, or each one went back through build
and verify and a narrowed re-review passed. `pr-review-workflow` runs the review; this is what devflow hands it.

- From M1 up the final review runs in a fresh context: the `reviewer` agent, or in Codex a worker told to report only.
  Write the package first: `git diff <base>..HEAD > .work/devflow/i<issue>/review-package.diff`, with the ledger's
  `base`. Give the reviewer that file, the acceptance criteria, the plan summary and REVIEW.md if the project has one -
  and no verdict, because a reviewer told the answer confirms it.
- In M0 the main session rereads the diff against the criteria instead; the change was small enough to say in one
  sentence.
- A change to a `.devflow.json` `highRisk` path also gets the security perspective from [perspectives](perspectives.md).
- Fix findings that change behaviour or break a requirement; a reviewer asked to find something finds something, and
  fixing every remark over-builds the change. Record the disposition of each finding in the checkpoint.

## Before integrating

Measure the cycle on the Issue branch before ship moves to the default branch: worktree reflogs and old host records
disappear later, and `devflow-state` writes only to the branch's Issue. Rules: [metrics](../../../docs/specs/metrics.md).

1. Bring the ledger's `metrics` up to date for the whole cycle - user corrections and false blocks by devflow's own
   guards, each with its `notes` line - from the ledger, the checkpoints and the session.
2. From the Issue's work tree, run `devflow-metrics <issue>` (next to the card's `Tool:` command) and save its output as
   `artifacts/metrics/i<issue>.json` in the main work tree.
3. Put the line from `devflow-metrics <issue> --line --until <the saved until>` in the ship checkpoint.
