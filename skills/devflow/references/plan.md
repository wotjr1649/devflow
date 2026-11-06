# Plan

Done when an engineer who never saw the conversation could build from the plan alone, its prerequisites ran, and the
stage-boundary checkpoint says go or no-go. This is the last point
where a wrong plan costs a page instead of a build.

- The plan is private: `docs/plans/YYYY-MM-DD-i<issue>-<slug>-plan.md`, not committed. Per task: stable task ID, files,
  order, consumed/produced interfaces, and task-local checks with stable IDs, definition revisions, observable
  expectations and actual commands. Map the task's contribution to stable Issue AC IDs/definition revisions separately.
  Passing a task check proves that increment; it does not mark its linked end-to-end AC verified. For the whole plan:
  project constraints (minimum versions, dependency limits, naming rules) and likely inputs no test covers.
- Before settling it, answer three questions in the plan: what could break, which step is riskiest, which alternative
  was not taken and why. If a decision only the user can make remains among the answers, ask the user only that.
- Run the prerequisites rather than assuming them: declared dependencies install, the tools exist, the check commands
  start and fail or pass as expected, and every effect the plan needs is covered by standing permission or an
  instruction.
- Pick the run mode by the router's Execution modes table and record `runMode` through guarded control. Fix the
  versioned delivery scope and original review base separately from later task bases; the plan cannot silently omit
  existing requirements or reset attempt history. In M3, count one integration batch as one active task. Plan two or
  three independent work units inside it with distinct IDs, worktrees, original bases, disjoint file ownership and
  local checks, plus the checks for the combined batch candidate. Dependent work waits for the accepted batch; do not
  represent concurrent units as several active ledger tasks. If the host or Tool cannot bind these units, use M2.
- When the plan changes a trust boundary (authentication, permissions, secrets, hooks, handling outside input) or has
  five or more tasks, review with the Design perspective. Read delegation and only the reviewer role via the router.
  Claude Code delegates through a supported general-purpose agent; Codex may do this plan review in main, subject to
  project-required independence. Fix each finding and recheck affected tasks against the questions above. Confirm
  claimed trust-boundary bypasses using the real renderer/command, then review the correction.
- The public summary is four lines - files, order, risks, proof - plus go or no-go, in the stage-boundary checkpoint,
  because the plan itself is not in git. No-go stays in plan, or goes back to design when an assumption broke, with the
  reason.
- Keep task count N and task IDs in the plan. Build opens task 1/N through the guarded transition; the plan is no
  execution proof. Record prerequisites by command, cwd, subject, environment and decisive output, keeping raw private
  evidence/local paths out of the public summary.

Example: task 1 implements storage and proves create/read behavior with component tests; task 2 connects the API/UI.
Both contribute to the AC “submit the form, reload and see the saved result.” Task 1 can complete before task 2 exists.
The AC stays unverified until delivery verification executes the complete user behavior. Never relabel the component
receipt as full-AC proof or weaken the AC to make the intermediate task pass.

With five or more tasks, copy this into the reply and tick each line, because a long plan is where a step gets skipped:

```text
- [ ] task-local checks and AC contribution mapping; files, order, interfaces, constraints and uncovered inputs
- [ ] three questions answered; user-only decisions asked
- [ ] prerequisites run
- [ ] runMode recorded
- [ ] design-perspective review done, findings fixed and rechecked
- [ ] checkpoint: four-line summary and go or no-go
- [ ] task count N in the plan
```
