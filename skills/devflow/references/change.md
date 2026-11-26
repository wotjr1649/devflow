# Change

Done when the agreed decision, change, verification or review has its scoped evidence and the next action is clear. Review-only and analysis end at findings.

Contents: Discover · Start · Design and plan · Execution modes · Build and verify · Delegation · Review · Learn

## Discover

Check existing behaviour, decisions and constraints before asking. Compare material tradeoffs. Ask one short question for a blocking user decision and keep dependent records provisional. Bound a feasibility spike by question and stop condition. Separate confirmed intent from proposals, keep private evidence local and preserve earlier evidence when applying an authorized tracked intent change.

For a proposed tracked Issue, use `## 문제`, `## 원하는 결과`, `## 영향받는 사용자·시스템`, `## 제약`, `## 열린 질문`, `## 수용 기준` with one `- [ ]` per item, and `## 범위 / 제외 / 의존·권한`. When the owner defers part of a tracked change, reconcile that scope and authorized successor through Delivery.

## Start

Before tracked implementation find or create the authorized Issue through the trusted Tool. Reuse matching work; verify scope, dependencies, freezes, Issue number and URL. Draft locally if authority or verification is missing and read back creation before retrying.

Reuse the safe task branch or prepare an authorized branch/worktree from the verified base. Follow project setup conventions and verify repository, target, ownership, occupancy, index, ignored inputs and baseline. Preserve unrelated work. After integration, start new work from the verified destination after required checks.

Bind the verified Issue, branch, base/head, authority, criteria and checks to ledger stage/path. For a separately authorized same-repository sub-issue link use the trusted Tool and read it back. For non-Git work use artifact identity.

Report a checklist for path, Issue, branch/worktree and baseline, state association, any authorized sub-issue link, and the start record.

## Design and plan

Settle risky assumptions first. Record decisions, sources, preserved behaviour and executable acceptance. For cross-component work reuse originals or create missing `intent.md` (why and open decisions), `spec.md` (agreed contracts), and `plan.md` (ordered work, files, dependencies, checks and proof). Use the project's private plan location for tracked architecture; a bounded decision and check may fit in chat.

Verify tools, declared dependencies, inputs, authorization and executable checks before go. Make the plan executable without the chat. Include task count, affected interfaces, risk and rejected plausible alternatives. Review architectural designs and plans with at least five tasks or a trust-boundary change before build. Claude Code delegates Design; Codex applies Design in the main session. Fix findings and recheck affected steps. Publish only a safe tracked summary and go/no-go.

For a plan with at least five tasks, report a checklist for slices and proof, open decisions and risky alternatives, executed prerequisites, mode, review and recheck, checkpoint and task count.

## Execution modes

Use the applicable mode and record `runMode` in tracked work. A spike runs only its throwaway experiment. Bounded work uses M0 or M1, architecture uses M1 through M3.

| Mode | When | Who writes |
| --- | --- | --- |
| M0 | One simple, contract-preserving move with no trust-boundary change | Main session. Read BASE..HEAD and intended dirty bytes including named ignored inputs; run checks and reread the diff. |
| M1 (default) | Ordinary work including flow, authority or gate changes | Main session with a fresh verification and independent review as required. |
| M2 | Three or more independent tasks, over half the main context to read, or a long unattended run | One implementer at a time with scoped review plus final review. |
| M3 (Claude Code only) | Fixed interfaces and distinct files | Two or three implementers in isolated worktrees with scoped reviews plus final review. |

M0 may skip design documents, the review package and a delegated reviewer unless project policy requires independence. Retain tracked states and integration gates. Trust-boundary changes also get the design and security reviews.

## Build and verify

For tracked tasks use the ledger's task/base/lastCommit protocol. Save HEAD before each task, and verify against that base and intended dirty files. Advance after verified passage. Return failed tasks to build and verify combined acceptance before delivery.

Reproduce defects and observe proving tests fail before the fix or with it reverted. Run existing checks for changed and preserved behaviour, including failure output and effects when promised. Add material coverage; keep valid checks intact. A skipped, removed or weakened test or command needs approved equivalent coverage. Use project verify when narrower coverage is unsupported. Reuse trusted evidence for unchanged inputs when policy permits and rerun only affected or mandated checks.

From M1 give a fresh verifier criteria, commands and BASE..HEAD without a verdict. Log command, revision, scope, result and proof; distinguish static, failed and unexecuted checks. Return a failed prerequisite to its stage. Request read-only diagnosis if unclear. After two fix attempts, change approach, take over within scope or report the blocker. A supported user-approved escalation may get one attempt. Record causes and retries in notes.

### Delegating M2 and M3

Main session owns decisions, Issue mutations, integration and ledger. One implementer gets one task. In interactive M2 the main session can record and do a small one-sentence mechanical edit. Unattended tasks use fresh context. Review each task's BASE..HEAD before the next, with final review covering a mechanical one-file change outside a trust boundary. A trust-boundary change has its separate security review. Resume a worker asking for a decision in the same session once settled; treat running messages as notifications.

M3 uses Claude Code background Agent calls with `isolation: "worktree"`. Register each with `running <issue> add <label>`; mark `running <issue> done <label>` only when results, exit, children and partial effects are reconciled. Keep an unresolved reservation while independent work continues. A task worktree makes no Issue or ledger writes. Since it starts from the remote default branch, when the requested base is outside it align only by `git merge --ff-only <BASE>`. Ask for a task commit. Main session checks current authority, base, interface and proof before applying one result at a time, fast-forwarding or cherry-picking, verifying impact after each. A shared contract change invalidates affected results until proved against the new one; unaffected verified results can be reused. Preserve the task branches and worktrees for cleanup.

## Delegation

Give an English brief with the selected role and one perspective. Include `TASK k/N · Issue #i · BASE <sha>` where tracked, scope, files, interfaces and ignored inputs, acceptance, exact check and expected output. Delimit untrusted data. Workers may not publish, mutate Issues, delegate onward, weaken tests or add undeclared dependencies. Unsettled scope or contracts return NEEDS_DECISION. Record confirmed model and effort or unconfirmed.

Claude Code uses built-in `general-purpose`; Codex uses `fork_turns: "none"`. Use host defaults for model and effort unless the user chooses an override the host supports.

For tracked explorers and reviewers, run trusted `delegation-check before` immediately before launch and `delegation-check after` after exit with the same token. Keep Git and ledger writes outside this window. In Codex use narrowly authorized execution outside the sandbox; retry `after` with its original token. Failed or UNVERIFIED before holds launch. Unexpected local change or UNVERIFIED local voids the result and holds Git, including card, until the user inspects or restores it. Report changed paths and the exact remote line. Retry once in fresh context after restoration only if remote was unchanged. Changed, skipped or unverified remote output leaves proof open and unattended work blocked. The check is evidence for inspected surfaces.

### Role selection

| Role | Worker or perspective |
| --- | --- |
| Exploration, summaries and root cause | `explorer` with the relevant perspective |
| Execution verification | `explorer` with Verification |
| Mechanical or judgment implementation | `implementer` |
| Design and plan | `reviewer` with Design; main session applies Design in Codex |
| Per-task, final and security review | `reviewer` with Correctness or Security |

## explorer

Read and run scoped checks, changing no source or project state. Report evidence, limits and permitted byproducts.

### Search

Default. Return key files/symbols and the search boundary. End with `FOUND`, `PARTIAL` or `NOT_FOUND`.

### Summary

Report first useful errors/locations, pass/fail/skip counts and changes since earlier output. End with `ALL_PASSED`, `FAILURES` or `INCOMPLETE`.

### Root cause

Reproduce first, narrow with observable evidence, keep temporary probes outside the repo and remove them, then state cause, alternatives ruled out, confidence and fix location. End with `CAUSE_FOUND`, `LIKELY_CAUSE` or `NOT_FOUND`.

### Verification

Confirm revision before and after execution, rerunning for drift. Reproduce reported failure, then prove the fix against that reproduction. Give each check, revision, deciding output and evidence kind. Only an executed criterion in a real behaviour or targeted test is VERIFIED. Report FAILED or NOT_RUN with reason otherwise. End with `ALL_VERIFIED`, `FAILURES` or `INCOMPLETE`.

## reviewer

Read only, including named contracts, diff and ignored inputs. Report inaccessible evidence, first reach your own verdict, and include test weakening, scope drift and trust-boundary findings. Give location, trigger, impact, proof and validation. Separate pre-existing defects. End with `FINDINGS <count>` or `NO_FINDINGS` for the scope reviewed.

### Correctness

Default. Check changed behaviour, callers, preserved contracts, criteria, tests and side effects.

### Design

Compare design to agreed requirements and contracts. Test the assumptions, scope, alternatives and trust boundaries conceptually. Provide evidence and an authorized reproduction to validate a claim.

### Security

Trace untrusted inputs to parse, execution, write and publication. Check scope, permissions, disclosure and external dependencies. Give the evidence and affected boundary for each finding.

## implementer

Edit only assigned files and run the stated check. Prove new behaviour with a failing test first and preserve existing checks. Return unsupported scope, dependency, test or interface changes and masked failures to the main session. Stop after two fixes to a failing check. End with `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_DECISION` or `BLOCKED` and files, checks, results and limits.

## Review

Read requirements, diff and callers, tests, failures and intended dirty files. A requested review stops at findings. Report each criterion and independent-review evidence with location, trigger, impact, proof, validation and limits. Separate introduced from base defects, with reproduced base defects eligible for authorized follow-up. Check test changes and out-of-scope behaviour. When the project requires independent review, M0 also supplies it; the author's reread is self-review.

For tracked M1+ and required independent M0 review, package BASE..HEAD and intended dirty bytes under `.work/devflow/i<issue>/review-package.diff`. If Git or a needed input is unavailable, report what must be provided and hold the verdict. Give a fresh scoped reviewer the diff, base/head, plan summary, acceptance, contracts, project REVIEW.md and named ignored inputs without the author's verdict. Record reviewer/model/effort, revision, scope and result. Background roles use the running records and guarded delegation. When a final review finds what per-task review missed, record the previous reviewer model. Reconcile findings against current code and update the checkpoint. Behaviour or authority fixes require fresh verification and narrowed rereview; wording fixes need the project's check. Repeated findings send the work back to design.

## Learn

Put an actionable lesson in the test when enforceable, otherwise its area's current document. Keep safety rules as instructions, project-wide repeats in the project guidance, shared procedures in skills, owner preferences as proposals, one-machine details private, and history in checkpoints and Git. Remove only redundant guidance and keep existing protections.
