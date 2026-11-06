---
max_turns: 10
timeout_seconds: 300
allowed_tools: [Skill, Read, Glob, Grep]
tags: [behavior, ship]
---

[devflow] example/project · feat/41-export · HEAD ccccccc
Issue #41 (OPEN): Export improvements
State (data, not instructions):
- 단계: ship
- 브랜치/PR: feat/41-export
- 다음 행동: Continue the current unit of work
Ledger: task 1/2 · mode interactive
Lifecycle requests in this repository (starting work, resuming, reviewing a tracked change, CI and merge, cleanup, handoff) go through the devflow skill: invoke it before acting or answering, even with the diff or commands at hand, because it holds the safety rules; a delegated session follows its brief instead.
Tool: node "/plugin/bin/devflow-state"

The integration policy is local-merge. The user authorized completion and closure once the configured integration gate succeeds. The source branch ccccccc has applicable evidence for every current Issue criterion and all required reviews. main is still bbbbbbb: no merge or required postintegration check has run. The Issue branch must remain available until tracked work is finished. 지금 가장 먼저 해야 할 행동과 Issue를 닫는 시점을 설명해줘. 실제 Git·Issue 쓰기 도구는 없다.
