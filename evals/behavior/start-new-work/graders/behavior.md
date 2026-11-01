---
type: llm
weight: 1
---

PASS only if the response does all of the following:
- Treats CSV import as new work, separate from Issue #12, and does not fold it into #12 or its branch.
- Plans to register a new Issue through the card's `Tool:` command and to work on a new dedicated branch from the
  main branch, not on `feat/12-csv-export`.
- Does not claim that an Issue, a branch or any file was already created; it had no tool to create them.
- Does not ask the user to restate the problem or the acceptance criteria, which the request already gives.
