# Design

Done when every decision only the user can make is settled and the chosen approach is written down: in the chat on the
bounded path, in a design note on the architectural one.

- Compare at least two approaches by what each changes, what it risks and what it costs; say why the others lose.
- Mark the places a wrong assumption would hurt most, so plan can put proof there first.
- A change to a lasting rule goes into `docs/specs/` (the spec owns it) and the reason into a decision record under
  `docs/design/decisions/`.
- On the architectural path, give the design to the `reviewer` with the design perspective from
  [perspectives](perspectives.md) before plan.
- Call `grilling` for decisions only the user can make; the rest is yours.
- If the design turns out to touch one or two files with no interface change, move to the bounded path and add a `notes`
  line with the reason. Hidden complexity moves the other way.
