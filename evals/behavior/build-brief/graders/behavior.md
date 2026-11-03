---
type: llm
weight: 1
---

PASS only if the brief in the final answer does all of the following:
- Identifies the task as task 2 of 4 of Issue #21 with BASE 7a8b9c0, and gives the goal, the files it may change
  (`src/export/cli.js`, `test/cli.test.js`) and the check `npm test -- cli` with its healthy output.
- Puts these out of scope for the implementer, in any wording: pushing, writing to the Issue, spawning subagents,
  deleting or weakening tests, and adding dependencies. Missing any one of the five fails.
- Asks the implementer to end with one status from `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_DECISION`, `BLOCKED`, and to
  report files changed and checks run or not run.
- Tells the implementer to stop and report once the work is done and its check passes, rather than continue into other
  changes or review rounds.

None of these fails the case: extra constraints from the facts; a sentence saying the brief is not launched.
