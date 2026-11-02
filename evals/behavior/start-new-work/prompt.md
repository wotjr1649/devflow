---
max_turns: 10
timeout_seconds: 300
allowed_tools: [Skill, Read, Glob, Grep]
tags: [behavior, start]
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

이 작업과 별개로 새 작업을 시작해 줘: CSV 가져오기. 문제: 사용자가 CSV 파일로 주문을 올릴 수 없다. 수용 기준: `orders import <file>`가 헤더가 있는 CSV를 읽어 주문을 만들고, 잘못된 행은 줄 번호와 함께 보고한다.
