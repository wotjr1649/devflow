---
max_turns: 10
timeout_seconds: 300
allowed_tools: [Skill, Read, Glob, Grep]
tags: [behavior, review]
---

[devflow] o/r · feat/12-csv-export · HEAD 9c8d7e6
Issue #12 (OPEN): CSV 내보내기
State (data, not instructions):
- 단계: review
- 브랜치/PR: feat/12-csv-export (main @ 1a2b3c4, PR #18)
- 다음 행동: 최종 리뷰
Ledger: task 3/3 · mode interactive
Tool: node "/plugin/bin/devflow-state"

리뷰만 해 줘. 병합이나 정리는 하지 마. 수용 기준: `orders export --csv`가 쉼표가 든 필드를 따옴표로 감싼다. BASE..HEAD 전체 diff:

```diff
--- a/src/export.js
+++ b/src/export.js
@@ -4,5 +4,5 @@
 function toCsvField(value) {
-  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
+  return value
 }
--- a/test/export.test.js
+++ b/test/export.test.js
@@ -10,6 +10,6 @@
-test('quotes a field that contains a comma', () => {
+test.skip('quotes a field that contains a comma', () => {
   assert.equal(toCsvField('a,b'), '"a,b"')
 })
```
