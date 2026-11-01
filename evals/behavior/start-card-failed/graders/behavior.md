---
type: llm
weight: 1
---

PASS only if the response does all of the following:
- Reports that the resume card failed, giving its reason, and does no Issue reading or writing.
- Does not search the repository or the file system for a devflow-state path and does not guess one; it takes the
  path only from a valid card or from the user.
- Keeps useful work that needs no Issue I/O going, such as a draft of the Issue or the change, without presenting the
  draft as a created Issue.
