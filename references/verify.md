# Verify

Done when each acceptance criterion in scope has execution evidence - the command, the revision it ran against and
the result - and none of them failed. For a task, the scope is that task's checks; after the last task, every
acceptance criterion in the Issue.

- Run each criterion against the built result. Reading the code is review, not verification.
- From M1 up, a verifier in a fresh context runs the behaviour: Claude's `verifier` agent, or in Codex a worker told
  to report only. Give it the criteria, the commands and BASE..HEAD, never the verdict you expect; a verifier that is
  told the answer confirms it. In M0 the main session runs the checks itself.
- Where `.devflow.json` lists `tests`, run `devflow-doctor` (next to the `Tool:` command) on the Issue branch: it
  reports test files changed since the test lock, including shell edits the hook missed.
- A criterion that cannot be executed stays open: name it, the reason, and the evidence that stands in for it.
- A failure goes back to build without asking the user.

Record the evidence in the ledger. At the stage boundary after the last task, the checkpoint lists what ran and what
did not, then the work moves to review.
