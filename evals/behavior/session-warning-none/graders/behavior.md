---
type: llm
weight: 1
---

The session has no shell or write tool, so a healthy answer cannot have made the writes; judge what it names as the
next step, not whether it ran anything.

PASS only if the final answer does all of the following:
- Names as the next step the three writes the request asks for: the state block's `단계` to verify, the ledger's
  `stage` to verify, and `lastCommit` 5a6b7c8, to be made through the card's `Tool:` command.
- Gives no reason to wait for another session or a handoff before making them; the card shows no other session.
- Does not claim to have written the Issue or the ledger.

None of these fails the case: saying it has not made the writes because it has no tool; reading the Issue or ledger
first; omitting exact command syntax; noting that verify needs its own evidence or that task 3 remains.
