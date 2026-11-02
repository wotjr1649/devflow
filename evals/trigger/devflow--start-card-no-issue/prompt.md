---
max_turns: 6
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
tags: [trigger, should, devflow]
---

[devflow] o/r · main · HEAD 3f2a1bc
Branch name has no Issue number (<type>/<issue>-<slug>); no Issue state shown.
Lifecycle requests in this repository (starting work, resuming, reviewing a tracked change, CI and merge, cleanup, handoff) go through the devflow skill: invoke it before acting or answering, even with the diff or commands at hand, because it holds the safety rules; a delegated session follows its brief instead.
Tool: node "/plugin/bin/devflow-state"

로그인 실패 시 재시도하는 기능을 추가하려고 해. 작업을 시작해 줘.
