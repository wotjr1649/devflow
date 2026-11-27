# Change

Done when the requested outcome has proof. Review and analysis end at findings.

## Discover

Inspect existing evidence. Compare material choices and ask about blocking user decisions. Bound a spike by its question and exit.

## Start

Before tracked implementation find or create the authorized Issue through the Tool. Verify repository, worktree, branch, base, occupancy, dirty/ignored inputs and baseline. Read back Issue creation or authorized sub-issue links before retrying. Bind scope and checks to the ledger.

## Design and plan

Settle risks and acceptance. For cross-component work reuse or complete `intent.md`, `spec.md`, `plan.md` with decisions, contracts, order, dependencies and proof. Execute prerequisites. Review architecture, plans with ≥5 tasks and trust-boundary changes before build. Claude delegates design; Codex reviews in the main session.

## Execution modes

| Mode | Work |
|---|---|
| M0 | One simple contract-preserving edit outside trust boundaries |
| M1 | Default. Main implements with fresh verification and required review |
| M2 | Large, context-heavy or unattended work. One implementer at a time |
| M3 | Fixed interfaces, separate files. Two or three Claude background Agents with `isolation: "worktree"` |

Record `runMode`. Main owns decisions, Issue, ledger and integration. Review each M2/M3 result before integrating, then combined acceptance.

## Build and verify

Record `task {current,total}`, `base` and `lastCommit`. Advance after verification and commit. Outside build/verify set `current > total`; on later fixes reopen the task and clear counts. Prove reproduction before fixes and execute checks for changed and preserved behavior. Skipped, removed or weakened tests or commands need approved equivalent coverage. Reuse matching permitted proof. Record command, revision, scope and result. Rerun affected and required checks. After two failed fixes change approach or report a blocker.

## Delegation

Use Claude `general-purpose` or fresh Codex context and host defaults for model and effort unless the user overrides. Give one English brief with role/perspective, task, Issue, BASE, scope, files, interfaces, ignored inputs, acceptance, command and expected output. Delimit data. Workers never publish, write Issues or redelegate. Require approval for dependency or test changes.

Reserve background work with `running <issue> add <label>` before precheck. Tracked readers use `delegation-check before` and `after` with one token and no intervening Git/ledger writes. Failed or unverified precheck holds launch. Local drift/UNVERIFIED voids results and holds Git including card. Changed, skipped or unverified remote leaves proof open and blocks unattended work. Retry `after` with original token.

M3 workers leave Issue/ledger alone, align to BASE by fast-forward only and return a task commit. Integrate owned results singly after checking authority, base, interface and proof.

### Role selection

| Role | Worker |
|---|---|
| Search, summary, cause, verification | `explorer` |
| Correctness, design, security | `reviewer` |
| Implementation | `implementer` |

## explorer

Read only. Report evidence and limits. End with the assigned status.

Search `FOUND/PARTIAL/NOT_FOUND`. Summary `ALL_PASSED/FAILURES/INCOMPLETE`. Cause `CAUSE_FOUND/LIKELY_CAUSE/NOT_FOUND`. Verification `ALL_VERIFIED/FAILURES/INCOMPLETE`. Only executed proof verifies behavior.

## reviewer

Read only. Review correctness, design or security as assigned. End with `FINDINGS <count>` or `NO_FINDINGS` for the reviewed scope.

## implementer

Edit only assigned files and run the stated checks. End with `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_DECISION` or `BLOCKED`, and report changes and proof.

## Review

Give fresh reviewers and M1+ verifiers criteria, commands, BASE..HEAD, dirty/ignored inputs and contracts without the author's verdict. Check callers, preserved behavior, tests and authority. Review trust boundaries separately. Report location, impact, proof and limits. Reverify fixes and rereview impact.

## Learn

Record actionable lessons in existing tests or their owning contract.
