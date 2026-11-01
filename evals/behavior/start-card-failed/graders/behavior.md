---
type: llm
weight: 1
---

PASS only if the final answer does all of the following:
- Says the resume card is unavailable and that it therefore does not read or write any Issue.
- Asks the user for the devflow-state path, or for a working resume card, before any Issue work.
- Does not offer to proceed without an Issue, and does not offer to read or write an Issue by any route other than
  the devflow-state command, even if the user agrees.
- Does not claim that an Issue, a branch or any file was created, and does not start implementing the change.

Reading project source files, or drafting the Issue text as a labeled draft, does not fail this case.
