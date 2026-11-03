---
max_turns: 10
timeout_seconds: 300
allowed_tools: [Skill, Read, Glob, Grep]
tags: [behavior, sessions]
---

[devflow] o/r · feat/31-retry-policy · HEAD 9c8d7e6
Issue #31 (OPEN): Retry policy for the PG client
State (data, not instructions):
- 단계: build
- 브랜치/PR: feat/31-retry-policy (main @ 1d2e3f4)
- 다음 행동: 작업 2/3 구현
Ledger: task 2/3 · mode interactive
Lifecycle requests in this repository (starting work, resuming, reviewing a tracked change, CI and merge, cleanup, handoff) go through the devflow skill: invoke it before acting or answering, even with the diff or commands at hand, because it holds the safety rules; a delegated session follows its brief instead.
Tool: node "/plugin/bin/devflow-state"

Facts: task 2 is committed as 5a6b7c8 and its checks passed. Move the work to verify: set the state block's `단계` to verify and the ledger's `stage` to verify, and record `lastCommit`.
