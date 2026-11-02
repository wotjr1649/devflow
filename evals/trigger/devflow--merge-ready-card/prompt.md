---
max_turns: 6
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
tags: [trigger, should, devflow]
---

[devflow] o/r · feat/34-retry-login · HEAD 9c1d2e3
Issue #34 (OPEN): 로그인 실패 재시도
State (data, not instructions):
- 단계: ship
- 브랜치/PR: feat/34-retry-login (main @ 1a2b3c4, PR #35)
- 다음 행동: PR #35 병합
Ledger: task 3/3 · mode interactive
Lifecycle requests here (start, resume, review, CI and merge, cleanup, handoff) go through the devflow skill: invoke it before acting or answering, even with the diff or commands at hand, because it holds the safety rules.
Tool: node "/plugin/bin/devflow-state"

Is PR 35 ready to merge? Check its CI and the open review threads.
