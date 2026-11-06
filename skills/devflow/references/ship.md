# Ship

Done when the selected delivery passes its integration gates, the target commit is verified, and each tracker is
closed or left open according to its own evidenced scope. A completed delivery can leave its parent Issue open.

Contents: Checklist · Sequence · Integration · Completion

Enter ship only for requested integration or completion work; a review-only request ends in review. Ship writes the
Issue from the Issue branch, because `devflow-state` writes an Issue only from its branch. While the ledger's `mode` is
`autonomous`, nothing is posted, pushed or integrated: record each in the ledger notes for the next interactive turn,
until an interactive turn can apply the established authority. Already accepted authority persists; unattended mode
still defers these effects. Read the current delivery, owner epoch and control sequence before changing state. Keep the
Issue branch until the applicable gate is observed and its tracking disposition is verified; branch-bound writes are
not a reason to close early. A profile names a method, not permission to push, release or publish.

## Checklist

Copy this into the reply and tick each line, because a skipped step merges unverified code or closes an Issue early:

```text
- [ ] 1 source-candidate verify passed; record its exact subject separately from the integration result
- [ ] 2 evals noted: trigger; behavior if the project has one and stage rules or the description changed: worth running, ran or not, result
- [ ] 3 delivery scope/version, stable criterion IDs and definitions reconciled with fresh intent and evidence
- [ ] 4 ship checkpoint names the agreed local/remote/release gate; Issue and source branch remain open/retained
- [ ] 5 PR drafted: selected scope, full delivery review range/evidence, `Refs #<n>`, no closing keyword
- [ ] 6 each required check succeeded at the revision it must test for the current head
- [ ] 7 base, head, rules, CI, approvals, threads refreshed; merged with an expected-head guard
- [ ] 8 actual target commit/artifact, applicable push/release and postintegration checks observed
- [ ] 9 required successors and current full-AC/dependency evidence reconciled; eligible Issue closed after the gate
- [ ] 10 partial scope/remnants recorded; non-forcing cleanup follows verified integration and tracking disposition
```

## Sequence

1. Verify gate, on the Issue branch, by the `.devflow.json` profile. Under `pr-ci`, push the branch and take CI's
   `verify` success on that exact head, bound as in Integration, as the evidence; when CI does not run `verify` or its
   result cannot be verified, run `verify` locally and still wait for required CI. `local-merge` and `push-on-request`
   run `verify` locally. These source checks do not prove a later merge result or remote delivery. Establish the actual
   agreed completion gate from project rules and existing authorization: local integration, authorized remote push,
   release, or an explicitly agreed local artifact. For `push-on-request`, an unrequested push is not performed; say
   whether the agreed delivery is local only or requires a later authorized push. Ask only for a genuinely unresolved
   consequential choice, after preparing authorized work.
2. Evals. The trigger eval is worth running when a skill was added, removed or
   renamed, an invocation field in `skills/*/SKILL.md` frontmatter changed (`name`, `description`, `when_to_use`,
   `paths`, `disable-model-invocation`, `user-invocable`), or `evals/trigger/` changed; changes to skill bodies,
   references, hooks, agents or AGENTS.md do not change its result. It is optional, and the user runs it in an
   authenticated terminal. The ship checkpoint's `- 검증:` line says whether it ran and its result. Where the project
   has a behavior eval of its skills (for example `evals/behavior/`, `--tag behavior`) and the change alters what an
   agent does in a stage (a rule moved, removed or added, a changed routing or safety step, a changed description),
   running the cases that read the changed text three times each is worth it; wording, format and tool output changes
   are left to tests and review. A fresh-context reviewer judges those runs by their final answers and tool records,
   not the judge's score. Record whether it ran and its result, or why not. It is
   a recommendation, not a merge gate; an Issue that names behavior runs as criterion evidence is reconciled like any
   criterion, and paid runs need the user's approval.
3. Reconcile fresh Issue intent with the versioned delivery and Completion below. The supported structured check
   operation names stable criterion IDs, definition digests, evidence IDs and the observed intent revision; it rejects
   evidence for a different subject or scope. Reordering does not change a criterion; a changed definition, duplicate
   identity or removed selected criterion requires reconciliation and fresh proof. Never infer acceptance from position,
   an old checked box or a command exit code. Unmet Issue scope stays open.
4. Record the ship checkpoint and `단계: ship`, naming the pending gate in `남음:`. Keep the Issue open for every
   profile, including `local-merge` and `push-on-request`, and retain its branch. Selected AC acceptance means ready
   for the next authorized ship action, not delivered or closed. A verified two-of-five subset is eligible to ship;
   the other three remain open and a failed selected AC still blocks that delivery.
5. Integrate under Integration using the authorized method. Observe the actual target commit or artifact and every
   applicable push/release result and postintegration check. A refused or interrupted merge/push leaves the Issue
   open; a lost response leaves the effect unknown until reconciled. Return to build for failed checks/code defects,
   otherwise stay ship. Reopen any discovered premature closure, but never rely on future reopening to justify one.
6. Preserve source-branch acceptance evidence and collect integration-result evidence separately through the Tool's
   supported target-subject path. It must bind the actual resulting full OID/artifact, target ref/location, observed
   operation and required checks; it cannot relabel source receipts as runs on the merged result. Reassess changed
   inputs and execute the checks needed on the actual target. Unsupported target attestation holds closure; do not
   reset, rebase or overwrite the source branch or user work merely to satisfy a branch-bound helper.
7. After the applicable gate is observed, reconcile Completion, including every required successor and current full
   AC/dependency evidence. Refresh target/intent and reconcile intervening changes. Keep the authoritative stage at
   `ship`; from the retained Issue branch use the supported bound `close` with the actual integration receipts for a
   wholly satisfied Issue, then read back its closed disposition. Do not first project `단계: done` or request
   `ship → done`: neither is the supported path. Close records Issue closure; it does not advance the ledger stage.
   A partial integration records its delivered subset and remaining scope/next action while keeping the parent open.
   All profiles use this ordering; `pr-ci` also confirms actual merge and required target CI before closure.
8. Record other proposed follow-ups, then use the guarded `ship → cleanup` transition for this integrated delivery.
   Never enter removal just because source acceptance passed. Finish Issue writes before deleting its branch; cleanup
   records remain in the ledger afterward. Perform eligible cleanup and record removed/held targets, then use
   `cleanup → done`, or `cleanup → learn → done` when a lesson applies. Public stage projections must match the current
   authoritative stage; a closed Issue may retain its last ship projection without a fabricated early done update.
   Remaining parent work starts a separately scoped delivery and returns to build or plan when unplanned, preserving
   requirements and budgets. Cleanup proves integration (squash/rebase by change equivalence) and uses non-forcing
   deletion; a refusal keeps the target.

## Integration

Follow the project's CI policy and the agreed gate. `local-merge` needs the observed target integration and applicable
postintegration checks; include remote push or release only when required and authorized. `push-on-request` never
makes unpushed work remotely delivered. A local-only gate can finish without inventing a remote gate, while a required
but unauthorized or unobserved push/release keeps dependent completion open.

Source versus result. Keep distinct identities for the reviewed source, any synthetic merge tested before integration,
and the actual resulting target. A green source run is not evidence that a different merge result passed. Bind target
checks to the original resulting commit/artifact and relevant environment; missing or stale required result evidence
is `NOT_VERIFIED`. Retain the source branch and its receipts until authorized closure is read back; do not rewrite its
history to make a helper think the target was the source. Capture an actual target checkout through a supported path
without disturbing occupied worktrees or unrelated user changes. A target the Tool cannot attest remains unverified.

The current Tool's bounded target path is `verify-run <issue>` with `scope: "integration"` and
`targetWorktreeRoot`, plus current `expected`, full AC refs in `criteria`, the actual `command` and configuration inputs.
It runs in the clean, actual same-repository `main` checkout and requires the completed source commit as an ancestor.
Keep the source Issue worktree; main owns the ledger while the runner checks the target. The separate receipt binds
source and target identities. `check` may use integration scope; `close` requires integration receipts covering every
current AC. A `review-package` for that target prepares read-only input and proves no run. Other branch targets,
squash/cherry-pick equivalence and non-Git artifact targets are not attested by this adapter: hold dependent closure,
without rewriting the source or declaring a proxy pass. Its local result does not prove remote push, required CI or
release; observe those additional agreed gates separately before closing.

PR. Draft it with the project template: problem and outcome, scope and exclusions, acceptance, checks and limits,
links to the Issue and the completed subset, remnants left open; without remote metadata, draft it locally from the
available diff. The body holds a public summary, review evidence for the fixed delivery baseline through the reviewed head, and `Refs #<n>`; include evidence IDs
and sanitized outcomes, not private machine paths, environment contents or raw logs. Check the
platform's closing keywords while drafting: none goes in the PR body, its commits or the merge commit message, so the
platform does not close the Issue before ship verifies it. Integration needs evidence that the review stage is complete;
when the project requires independent review before integration, that covers M0 too and the author's re-read does not
count; a readiness assessment checks that evidence and does not perform the review.

Required checks. A merge needs each required check to have succeeded at the revision that check must test for the
current head: the head itself on a branch push, the merge of the current base and head on a pull request run. Report
each required check's supplied or observed state and revision, and mark it NOT_VERIFIED otherwise:

- A green run on an older head does not count. Example: head 7e1f0a2, the only green run on 3b9c4d8: NOT_VERIFIED; the
  next step is a successful run at the revision it must test for 7e1f0a2, then the merge.
- A missing, cancelled or skipped run, a run on another commit, or one with the same name from another source is not a
  pass. Assess supplied CI against the project's required checks; an unrequired check identifier stays unknown, not a
  new gate.
- Local checks and templates replace no required CI, protection, approval or review-thread gate. A PR with zero
  checks reported stays NOT_VERIFIED until local checks pass with PR evidence. A project without CI passes its
  documented local gate hook, or records the checks in the PR or the integration commit.

Without that success, do not merge, call the PR ready, or offer to merge or to accept the gap, because a result for
another revision says nothing about the code being merged.

Failed required check. Investigate and fix its cause, then get a success at the revision it must test for the final
head, and recheck; a code change makes a new head to verify. An assessment reports these steps without performing them.

Merge. Before mutating, bind each live CI run to the repository, workflow, run, attempt, event, base, head and checkout,
and to its type (synthetic merge, head or post-merge); reject unrelated runs. Resolve full original object IDs,
without local replacement refs changing the claimed commit. Evidence from different artifact bytes, configuration
or environment does not transfer merely because its short SHA or command name matches. Right before merging, refresh base, head,
rules, CI, approvals and threads. Merge by the project's method without bypass and with an expected-head guard in the
merge command itself (for example `gh pr merge <n> --merge --match-head-commit <sha>`); a head that moved holds the
merge. Then verify the result and the required post-merge checks. Bind dispatch to the reviewed target and
operation identity. A timeout or lost response is an unknown effect: reconcile the existing operation remotely
before any retry, and never send it again just because the local control update did not commit. Local compare-and-set
controls do not make external APIs atomic.

## Completion

Start's record carries the Issue, its scope and authority; verify it, or establish the repository, linked Issues,
milestones, closure gate and tracker authority.

- Keep task completion, selected delivery completion and whole-Issue completion separate. A completed task is only an
  input to delivery proof; a completed delivery is only part of whole-Issue proof when other criteria remain.
- Assess each Issue against its own stable criteria, definitions and dependencies. Close only satisfied Issues and milestones, with reviewed
  criteria and dependency evidence, resolving Issues as completed. State, checkboxes, a merge, successors or counts
  prove nothing alone.
- Every profile keeps the working Issue open until Sequence observes the applicable integration/push/release/local-
  artifact gate and required target checks. Another Issue a supplied PR or commit links: verify full or partial scope,
  and hold its closure until its applicable gates pass. Unlinked Issues keep their own
  eligibility.
- Reconcile findings and linked work. Paginate all of a milestone's Issues and PRs, moved, cancelled and unverified
  work included, and report inventory completeness and counted scope from their own evidence.
- Record evidence and remnants; other Issues stay open with a next action. Never weaken criteria; a rescope or deferral
  needs authority and keeps its blockers. Report and reopen a premature closure; post no duplicate closure or comment.
- Authorized local-only work passes the agreed install or artifact-identity gate.

Successors:

- Create them now only for user-decided deferrals and reproduced defects; propose other remnants, with the ledger's
  `followups`, as one list at ship.
- Search open and closed Issues for a match first; reuse an open one, or say why a new one or a reopen is needed.
- Each holds the problem and evidence, scope and observable criteria, dependencies, source Issue or PR, next action,
  and confirmed owner and priority or the unknowns; with authority, link both ways. Invent no backlog, private logs,
  milestones, assignments or deadlines.
- Verify that each required successor exists with its scope before closing the source; a failed or uncertain transfer
  leaves the source incomplete. Unrelated follow-ups do not block completion.

Report closed, open and unverified trackers, successor links and pending writes. A cleanup request that also asks for
tracking readiness applies this section; deletion authority and tracker closure stay separate.
