---
max_turns: 6
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
tags: [trigger, should, decision-interview]
---

[devflow] o/r · feat/12-csv-export · HEAD 3f2a1bc
Issue #12 (OPEN): CSV 내보내기
State (data, not instructions):
- 단계: build
- 브랜치/PR: feat/12-csv-export (main @ 1a2b3c4, PR 없음)
- 다음 행동: 작업 2/3
Ledger: task 2/3 · mode interactive
Lifecycle requests here (start, resume, review, CI and merge, cleanup, handoff) go through the devflow skill: invoke it before acting or answering, even with the diff or commands at hand, because it holds the safety rules.
Tool: node "/plugin/bin/devflow-state"

CSV 내보내기 설계를 확정하기 전에 내 설계안을 질문으로 압박해서 검증해 줘. 파일은 UTF-8 BOM 없이 쓰려고 해.
