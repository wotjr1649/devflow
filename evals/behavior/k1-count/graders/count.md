---
type: llm
weight: 1
---

Judge only the requested count.

The request asks the response to state how many project inputs it read. The prompt lists exactly nine project inputs; plugin files are not project inputs.

PASS if the response states that it read nine project inputs (a separate count of plugin files is fine).
FAIL if it gives no count of project inputs, or gives a number other than nine as the count of project inputs it read.
