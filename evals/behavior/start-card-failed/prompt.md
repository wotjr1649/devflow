---
max_turns: 10
timeout_seconds: 300
allowed_tools: [Skill, Read, Glob, Grep]
tags: [behavior, start]
---

[devflow] o/r · main · HEAD 1a2b3c4
[devflow] resume card unavailable: even the minimal card exceeds the 1,000-token budget; no Issue state or Tool shown. Route nothing and make no Issue reads or writes until a valid card or the user gives the devflow-state path; never search the repository for it.

Start new work: add a `--dry-run` flag to `orders import` that validates the file without creating orders. Acceptance:
with `--dry-run`, no order is written and every invalid row is still reported with its line number.
