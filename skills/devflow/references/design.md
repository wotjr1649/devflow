# Design

Done when every decision only the user can make is settled and the chosen approach is written down: in the chat on the
bounded path, in a design note on the architectural one.

- Compare at least two approaches by what each changes, what it risks and what it costs; say why the others lose.
- Mark the places a wrong assumption would hurt most, so plan can put proof there first.
- A change to a lasting rule goes into `docs/specs/`, because the spec owns it; update the current choice and its reason
  in the project's `docs/design/current-decisions.md`. Change history stays in the Issue checkpoint and git.
- On the architectural path, review before plan with the Design perspective. Main reads delegation and only the
  reviewer role via the router. Claude Code delegates to its supported general-purpose reviewer; Codex may perform
  this design review in main. Record actual agent/model/effort or inherited/unconfirmed settings; a project-required
  independent result needs a separate reviewer.
- A design that moves a trust boundary - loosening a filter that guards public text, or taking paths, permissions or
  write targets from repository files, git metadata or tool output - gets that review on any path, before plan or
  build, with the reviewer trying to break it. Confirm or refute each bypass the review claims with the real renderer
  or command, not by argument; fix and review again until no claimed bypass stands.
- If the design turns out to touch one or two files with no interface change, move to the bounded path and add a
  `notes` line with the reason. Hidden complexity moves the work the other way, and the user is told the path changed.
- On the bounded path there is no plan stage, so run its prerequisite checks here before build: declared dependencies
  install, the tools exist, the check commands start and fail or pass as expected, and every needed effect is covered by
  standing permission or an instruction. Then pick the run mode by the
  router's Execution modes table and record `runMode` through guarded control. Select the delivery ACs and fixed
  original review base before the first task; a task base must never overwrite that range.
