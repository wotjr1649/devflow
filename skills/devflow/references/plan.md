# Plan

**Exit:** architectural work has a standalone executable task plan, actual prerequisite results, ownership/dependency boundaries, and a go/no-go decision.

**Input:** accepted design, authorized delivery criteria, project commands and current baselines. Keep the plan private at `docs/plans/YYYY-MM-DD-i<issue>-<slug>-plan.md`; do not commit it or copy it wholesale to the Issue.

## Do

For each numbered task define owned files, interfaces, prerequisite tasks, criterion IDs/revision, expected input head, exact validation, review need and observable acceptance. Map every delivery criterion and regression/project gate to tasks or final verification; retain the Issue criteria outside this delivery. Record the delivery comparison base separately from task heads and current integration target.

Check what can break, which step is riskiest, and why the selected alternative is preferable. Include required ignored/untracked inputs and how workers receive them. Run declared dependency/tool/check prerequisites rather than listing them as if passed. Record run mode and effect grants. No-go stays plan or returns design with evidence.

M2 accepts each task before the next begins. M3 marks only genuinely independent tasks ready together: separate files are insufficient when interfaces, lockfiles, generated outputs, services/ports or databases contend. Specify isolated worktrees, exact starting heads, integration order and post-integration revalidation; unknown host support selects M2.

Plans with five or more tasks, or any trust-boundary change, receive fresh design review; resolve affected findings before execution. Use a task checklist for a large plan. Publish only four concise lines: files, order, risks, proof, plus the go/no-go result. A plan file's existence does not prove readiness.

**Return:** broken assumptions → design; task ordering or shared-interface gaps → plan; changed adopted intent → start/discover. Each return names reason and affected evidence, preserving completed proof that still applies.
