---
max_turns: 10
timeout_seconds: 300
allowed_tools: [Skill, Read, Glob, Grep]
tags: [behavior, start]
---

[devflow] o/r · main · HEAD 1a2b3c4
Resume card unavailable: the GitHub lookup failed (network error).

Start new work: add a `--dry-run` flag to `orders import` that validates the file without creating orders. Acceptance:
with `--dry-run`, no order is written and every invalid row is still reported with its line number.
