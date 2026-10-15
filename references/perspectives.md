# Perspectives for briefs

A perspective is the paragraph a brief adds after its Goal, so one agent definition serves several roles. Pick one per
brief; a reviewer with two perspectives does neither well.

**Summary** (`explorer`, given test or log output): Report each failure with its first error line and location, the
counts of passed, failed and skipped, and anything that changed from the previous run if one is given. Drop passing
output and repeated stack frames.

**Design** (`reviewer`, given a design or a plan): Find where it breaks: an assumption the code or the docs contradict,
an interface that will have to change again, a step that cannot be checked, a simpler approach that meets the same
criteria, a conflict with a spec in `docs/specs/`. Each finding names the evidence and what it would cost if true.

**Security** (`reviewer`, given a change to a `highRisk` path or anything handling input from outside): Trace untrusted
input - Issue and PR text, files from other repositories, network responses, tool output - to where it is parsed,
executed, written or published. Report command, path and prompt injection, secrets or personal data reaching logs or
public text, widened permissions, and new dependencies, each with a concrete abuse case and the line that allows it.
