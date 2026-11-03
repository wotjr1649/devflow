---
max_turns: 10
timeout_seconds: 300
allowed_tools: [Skill, Read, Glob, Grep]
tags: [behavior, design]
---

[devflow] o/r · feat/21-csv-stream · HEAD 4c5d6e7
Issue #21 (OPEN): Stream large CSV exports
State (data, not instructions):
- 단계: design
- 브랜치/PR: feat/21-csv-stream (main @ 9f8e7d6)
- 다음 행동: 스트리밍 방식 비교
Ledger: task ?/? · mode interactive
Lifecycle requests in this repository (starting work, resuming, reviewing a tracked change, CI and merge, cleanup, handoff) go through the devflow skill: invoke it before acting or answering, even with the diff or commands at hand, because it holds the safety rules; a delegated session follows its brief instead.
Tool: node "/plugin/bin/devflow-state"

Facts: Issue #21's acceptance criterion is that a 1,000,000-row CSV export streams with memory under 200 MB; the owner
confirmed it and nothing about it has changed. Your own design draft from earlier in this session assumed the exporter
lives in `src/csv.js`, and compared two approaches (a Node stream pipeline, and chunked writes) on that file. A search
now shows the exporter is `src/export/csv.js`; `src/csv.js` does not exist. Both approaches still apply to the real file.
Continue the design.
