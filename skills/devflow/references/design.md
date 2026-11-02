# Design

Done when every decision only the user can make is settled and the chosen approach is written down: in the chat on the
bounded path, in a design note on the architectural one.

- Compare at least two approaches by what each changes, what it risks and what it costs; say why the others lose.
- Mark the places a wrong assumption would hurt most, so plan can put proof there first.
- A change to a lasting rule goes into `docs/specs/` (the spec owns it); update the current choice and reason in the project's `docs/design/current-decisions.md`. Keep the change history in the Issue checkpoint and git.
- On the architectural path, review the design before plan with the design perspective from
  [perspectives](../../../agents/reviewer.md#perspectives): Claude uses `reviewer`; in Codex the main session performs it
  ([roles](../../../docs/specs/orchestration.md#models-and-effort)).
- A design that moves a trust boundary - loosening a filter that guards public text, or taking paths, permissions or
  write targets from repository files, git metadata or tool output - gets that review on any path, with the reviewing agent
  trying to break it; check each bypass it claims with the real renderer or command
  ([Review](../../../docs/specs/orchestration.md#review)).
- Ask the user, one short question at a time, about decisions only the user can make; keep what depends on them
  pending, and settle the rest yourself.
- If the design turns out to touch one or two files with no interface change, move to the bounded path and add a `notes`
  line with the reason. Hidden complexity moves the other way.
- On the bounded path there is no plan stage: run the prerequisite checks from [plan](plan.md) here and record
  `runMode` before build.
