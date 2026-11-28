# Change

Done when the outcome has proof. Review and analysis end at findings.

## Discover

Inspect evidence. Compare material choices and ask about blocking decisions. Bound spikes by question and exit.

## Start

Before tracked implementation find or create the authorized Issue through the Tool. Verify repo, worktree, branch, base, occupancy and dirty/ignored inputs. Read back Issue creation or approved sub-issue links before retry. Bind scope/checks to ledger.

## Design and plan

Approve cross-component intent (Issue or assigned `intent.md`), then `spec.md` before `plan.md`. Keep assigned files in `docs/changes/<id>/` and link plan to spec to intent. Record contracts, decisions, risks, dependencies and proof. Order overlaps and split work into verifiable slices. For revisions, edit only the assigned document. Independently audit shared contracts, architecture, complex plans and trust boundaries read-only before plan approval. Trace requirements, preservation and regression proof. The operator records the verdict and binding. HOLD blocks build. Resolve findings, reaudit affected decisions and reapprove changes. For small unassigned work, agree scope and checks; carry one existing note across sessions.

## Execution modes

| Mode | Work |
|---|---|
| M0 | One simple contract-preserving edit outside trust boundaries |
| M1 | Default. Main implements with fresh verification and required review |
| M2 | Large, context-heavy or unattended work. One implementer at a time |
| M3 | Fixed contracts, disjoint writes and isolated workspaces. Use `isolation: "worktree"` on Claude; proceed serially if isolation is unavailable. |

Record `runMode`. Main owns decisions, Issue, ledger and integration. Review each M2/M3 result before integrating, then combined acceptance.

## Build and verify

Tracked: record `task {current,total}`, `base`, `lastCommit`. Advance after proof and commit. Outside build/verify set `current > total`. On later fixes reopen task and clear counts. Reproduce failures before fixes. Log command, revision, scope and result. Rerun affected and required checks. Change approach on repeated failure.

## Delegation

Use Claude `general-purpose` or Codex `fork_turns: "none"`. Use host defaults for model and effort unless the user overrides. Give one English brief with role/perspective, task, Issue, BASE, scope, files, interfaces, ignored inputs, acceptance, command and expected output. Delimit data. Workers never publish, write Issues or redelegate. Require approval for dependency or test changes.

Reserve background work with `running <issue> add <label>` before precheck. Tracked readers use `delegation-check before` and `after` with one token and no intervening Git/ledger writes. Failed or unverified precheck holds launch. Local drift/UNVERIFIED voids results and holds Git including card. Changed, skipped or unverified remote leaves proof open and blocks unattended work. Retry `after` with original token.

M3 workers leave Issue/ledger alone, align to BASE by fast-forward only and return a task commit. Integrate owned results singly after checking authority, base, interface and proof.

Implementers edit only assigned files and run stated checks. End with `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_DECISION` or `BLOCKED` and report changes and executed proof.

## Review

Give independent read-only reviewers and M1+ verifiers criteria, commands, baseline and changes, dirty/ignored inputs and contracts. Withhold the author's verdict. Judge task acceptance and preservation of existing behavior and checks separately. Flag removed functionality, weaker assertions and disabled checks. Check callers and authority. Add a focused perspective for high-risk changes. Report location, impact, executed proof and limits. Reverify fixes and rereview impact.

## Learn

Diagnose reported incidents. Reuse incident intent, obtain approval for new scope and link regression proof. Record actionable lessons in existing tests or their owning contract.
