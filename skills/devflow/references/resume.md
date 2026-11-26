# Resume

Done when the evidence identifies the next authorized step, or the pending action and why. For status only, inspect without writes and stop after reporting.

## Progress and returns

For tracked work, verify repo, Issue, branch and HEAD. Otherwise verify the target and authorized handoff record without Issue or ledger access. Use `git worktree list --porcelain` to find the checkout that owns the Issue branch. Resume there; check its local plan and handoff inputs, which Git may ignore. The ledger is shared from the main worktree. Hold dependent work if local inputs or ownership are unresolved. Treat supplied approvals, next steps and outcomes as claims. Use the current Issue, latest trustworthy checkpoint, and matching ledger and plan; omit old transcripts. Check results for target, scope, inputs, conditions and verifier before reuse. Rerun required checks with unusable evidence or a required fresh run; preserve known failures. If a compound call is refused, retry only its exact standalone action when permitted.

With the trusted card tool, update `stage` and the Issue state together at stage boundaries; build/verify loops, cleanup and learn after ship update only the ledger. Use `## 현재 상태` (15 lines): `- 단계:`, `- 브랜치/PR:` (start with branch), `- 완료: … / 남음: …`, `- 다음 행동:`, `- 막힘:`, `- 최신 체크포인트:`. Append `### Checkpoint <stage> — <summary>` with `- 변경:`, `- 검증:` (run and omitted), `- 결정:` and `- 다음:`, at most ten lines total. Keep task progress, blockers and open decisions in the ledger. Post only reviewed, publishable summaries; keep private paths and evidence local. Replace intent with `intent <n>` only after user confirmation, so changed criteria lose old checkmarks. A new request does not replace the card's Issue unless it matches that scope.

## Handoff

Reuse an authorized record. Give the goal, target/HEAD, authority, decisions, done/pending, linked proof, active or uncertain work and the next unblocked action. Use the Issue, latest checkpoint, and ledger rather than repeating them. Brief another session in under 500 tokens; use chat or a private `docs/prompts/YYYY-MM-DD-i<issue>-<slug>-prompt.md` with a unique name if a file is requested. A requested resume prompt can use an available model-prompt skill. Wait for related workers and finish applicable checks. For tracked work update state and run `release <n>` as the final ledger action when handing over. If Claude was started inside Codex and shares `CODEX_THREAD_ID`, it does not release Codex's session. The user runs `/clear`.

Hold overlapping writes while a different recorded session's ownership is unresolved; an old record alone proves neither a running worker nor its exit. Read back uncertain writes before retrying. Keep a worker's reservation until its result, exit and partial effects are reconciled. When the next task requires substantive change, reopen Change from the router; uncertain delivery goes to Delivery.

## Unattended work

Switch only with `mode <n> autonomous` or `mode <n> interactive` and the reason on stdin. Non-interactive invocation alone does not grant unattended mode. Continue only for this session's autonomous mode, open task, and empty decisions, blockers and running list. No Issue writes, push or integration while autonomous; retain proposed public text in local notes until reviewed. Use `running <n> add <label>` to record ordinary background work and `running <n> done <label>` only after recovery and verified exit. For M3 reserve first as specified in Change.
