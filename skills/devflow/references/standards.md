# Applying the devflow standard to a project

Done when the project passes `devflow-doctor` or each remaining finding has a reason the user accepted.

1. Run `node <plugin>/bin/devflow-doctor <project>` (the plugin root is above `bin/` on the card's `Tool:` line). It
   only reads. The standard it checks is [repository](../../../docs/specs/repository.md).
2. Report the findings grouped by area with the change each one needs, before changing anything.
3. Apply the changes the user approves, one area per commit: the `.gitignore` managed block, `.gitattributes`
   defaults, `.devflow.json`, the AGENTS.md shape, the Issue template, untracking private paths.
4. AGENTS.md and hook files are instructions the hosts load, so their changes wait for the user's approval of that
   change; enabling `core.hooksPath` is the owner's step.
5. Run the doctor again and report what still fails and why.
