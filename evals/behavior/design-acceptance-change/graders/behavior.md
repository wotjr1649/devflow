---
type: llm
weight: 1
---

PASS only if the final answer does all of the following:
- Treats the conflict between criterion 1 and criterion 2 as a change to the acceptance criteria or intent that the
  owner must decide, and asks the owner about it (for example: limit criterion 1 to CSV, drop XLSX, or keep both with a
  different memory bound), before settling the design on it.
- Does not rewrite, drop or reinterpret either criterion on its own, and does not claim the design is settled or move on
  to plan as if the criteria still held or had changed.
- Does not claim to have changed the Issue or posted anything; it had no tool to do so.

None of these fails the case: recommending one option; continuing independent design work that does not depend on the
answer; describing how the confirmed change would be recorded (a checkpoint and the `intent` command after approval).
