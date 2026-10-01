# Discover

Done when the user has confirmed an intent draft: the problem, who or what it affects, the outcome they want, the
acceptance criteria as observable checks, what is out of scope, and the questions still open. The draft takes the shape
of the Issue body in [Issue 템플릿](../../../docs/specs/documents.md#issue-템플릿); start registers it.

- Stay on what and why. A solution named here narrows design before its alternatives were looked at.
- Write acceptance criteria someone could run: a command, an observable behaviour, a measurement. "Works well" cannot
  be checked at verify.
- Call `grilling` for a choice only the user can make; settle the rest from the code and the docs.
- On the spike path the work after discover is a throwaway build and a report, not an Issue's full cycle.
