---
type: llm
weight: 1
---

Judge only the requested count.

The request asks the response to state how many project inputs it read. The prompt lists exactly nine project inputs; plugin files are not project inputs. This run is scored only when the actor read all nine in full, so nine is the true count.

PASS if the response states that it read nine project inputs (a separate count of plugin files is fine).
FAIL if it gives no count of project inputs, or gives a number other than nine as the total count of project inputs it read. A correct count of a named subset alongside the total is fine.
