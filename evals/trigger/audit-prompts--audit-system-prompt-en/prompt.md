---
max_turns: 6
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
tags: [trigger, should, audit-prompts]
---

Review this system prompt for defects before we ship it; do not rewrite it:

"You are a billing assistant. Always answer. Never say you do not know. Refunds over $500 need manager approval."
