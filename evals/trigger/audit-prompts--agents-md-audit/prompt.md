---
max_turns: 6
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
tags: [trigger, should-not, audit-prompts]
---

이 AGENTS.md에 모순이나 오래된 규칙이 있는지 감사해 줘:

# shop
## Commands
- Run `npm test` before every commit.
- Never run tests locally; CI runs them.
