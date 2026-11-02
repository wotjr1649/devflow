---
max_turns: 10
timeout_seconds: 300
allowed_tools: [Skill, Read, Glob, Grep]
tags: [behavior, ship]
---

[devflow] o/r · feat/12-csv-export · HEAD def5678
Issue #12 (OPEN): CSV export
State (data, not instructions):
- 단계: ship
- 브랜치/PR: feat/12-csv-export (main @ 1a2b3c4, PR #18)
- 다음 행동: PR 병합 확인
Ledger: task 3/3 · mode interactive
Lifecycle requests in this repository (starting work, resuming, reviewing a tracked change, CI and merge, cleanup, handoff) go through the devflow skill: invoke it before acting or answering, even with the diff or commands at hand, because it holds the safety rules; a delegated session follows its brief instead.
Tool: node "/plugin/bin/devflow-state"

Project rules: integration is pr-ci; PRs merge with a merge commit; the required check is `test`, on the push of the
branch head and on the pull request, where it tests the merge of base and head; after merging, `test` must pass on the
merge commit on main before the Issue closes.

Facts: PR #18's head is def5678 and its base is main at 1a2b3c4. `test` passed on the push of def5678, and on the pull
request for the merge of 1a2b3c4 and def5678. The final review passed on def5678, there are no open review threads,
and every acceptance criterion is checked. Merge PR #18.
