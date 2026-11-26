# Resume

Done when the current target, authority, work, evidence and next action are reconciled and only the requested handoff, progress or recovery is recorded.

## Reconcile

For status only, read without writes. Use the card's trusted Tool to open Issue and ledger as needed. Verify root, worktree, branch, base/head, intended dirty files and named ignored inputs. Match authority and plan to the target. Hold work with conflicting identity, missing inputs or stale proof. For a refused compound call retry only the permitted operation.

Read the supplied records and start at the first unblocked action. If the plan covers it, use the plan's checks and stay here. Reuse trusted evidence only for the same scope, inputs and conditions when policy permits. Recheck changed dependencies and required current-revision proof. Keep failures visible. Return to the router for a new decision or uncertain delivery.

### Tracked progress

Sources: Issue for intent and stage, ledger for task and blockers, notes/checkpoints for evidence, plan for scope, Git for applicability. Missing evidence stays unknown. Tasks within build/verify and cleanup after a done Issue can differ. Resolve other disagreements by identity, scope and evidence, not timestamps. Use `note` by Issue number after branch removal.

At resume or a material change report goal, milestone, revision, evidence, outstanding exits and next action. Use the project's milestone exits and reopen the affected milestone when proof or scope changes. Report a partial integration separately from its remaining parent scope. Task k/N is a count.

### Recovery and parallel work

Confirm the original process and its children ended and reconcile partial effects before any restart. A timeout or cancelled parent alone proves neither, and inspection gives no authority to terminate. Check pending commits, check outputs, active workers, owned worktrees and uncertain writes. Preserve their state and any rejected, stale or duplicate result. Keep the prior reservation and withhold the same work while its exit is unknown. Keep independent work moving. When a shared contract changes, identify affected tasks and evidence, hold their integration until checked against the approved new contract, and reuse unaffected inputs. Reapply only an owned, unapplied outcome under the current plan and base. Reconcile external results through the Delivery routing rule before retrying.

For tracked session state use `running <issue> add <label>` for a background launch and `running <issue> done <label>` after exit and result recovery, including child processes and partial effects. Use `note` for additions and avoid competing whole-key writes. Keep decisions open only while unresolved, blockers for waits on a person, followups for out-of-scope findings, and notes for changes and evidence.

## Handoff

Finish current checks, commits, state updates and delegated work before asking the user to clear or start a new session. As the final ledger action run `release <issue>`, except Claude launched from Codex with `CODEX_THREAD_ID`, whose release would release the Codex session. The user performs `/clear`. Respect pending delegated work and preserve its reservation.

Reuse one authorized record with goal, authority, target, decisions, partial effects, checks and inputs, workers and next action. Link accessible records and keep private data local. Tracked card state already covers Issue, checkpoint and ledger. Keep a resume prompt under 500 tokens with links and new facts only. For a requested file use the project's unique uncommitted prompt path and end with `Read <absolute path> and continue.` Follow the release rule for another session and the delegation rules for a child worker.

## Unattended work

Only explicit unattended intent (including in a non-interactive prompt) or a user stepping away changes mode. Bypass settings give no authority. Set `mode <issue> autonomous < reason` with the reason on the first line of stdin. Proceed only while this session owns autonomous mode, the task is open, and decisions, blocked and running are empty. Holds go in decisions or blocked. Keep Issue text and planned external actions in ledger notes while autonomous, with no Issue publication, push or integration. A new session claims the task only under the same conditions or switches with `mode <issue> interactive < reason` when the user is present. Show the notes and publish only approved content with the Tool.

For changed requirements or acceptance, confirm the new intent before using the Tool's `intent` operation. Keep the original criteria and results in a checkpoint. The command preserves state and unchecks changed criteria because their earlier evidence no longer applies.
