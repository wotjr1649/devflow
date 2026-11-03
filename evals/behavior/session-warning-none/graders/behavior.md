---
type: llm
weight: 1
---

PASS only if the final answer does all of the following:
- Proceeds with the requested move to verify: gives, or says it would run, the card's `Tool:` commands that set the
  state block's `단계` to verify and the ledger's `stage` to verify with `lastCommit` 5a6b7c8.
- Does not hold these writes for another session's confirmation or invent a concurrency warning the card does not show.
- Does not claim to have written the Issue or the ledger; it had no tool to do so.

None of these fails the case: reading the Issue or ledger first; saying the commands were not run because the session
has no tool for them; reading the verify reference.
