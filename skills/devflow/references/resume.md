# Resume

Done when the current target, authority, work, evidence and next action are reconciled and only the requested handoff, progress or recovery is recorded.

## Reconcile

For status only, read the current state without writes. Use the verified card's Tool for full Issue `read <issue>` and `ledger <issue>`, then open applicable records and evidence. Inspect the actual root, worktree, branch, base, HEAD, intended staged, unstaged and untracked changes, and named ignored inputs. Match scope, approved decisions and plan to the current target. Conflicting identity, inaccessible required input or stale evidence leaves the dependent action pending. Preserve completed, dirty and unrelated work. For a refused compound call, retry only the exact permitted standalone operation.

Match trusted check evidence by target, scope, inputs and conditions. When HEAD moved, reconcile changed commits and dependencies. Reuse a passage only for the same inputs and conditions and when project policy permits. Current-revision or provider-mandated checks need current evidence. Keep failures visible. Recover records on the supplied path and read only needed material. Start at the first unblocked action. Follow the router for a scope or approval gap and for an uncertain delivery.

### Tracked progress

Use the Issue for confirmed intent and coarse stage, the ledger for task and blockers, notes and checkpoints for checks, the approved plan for scope and Git for applicability. Missing ledger or unreadable evidence means unknown. A task open within build or verify and an Issue marked done during cleanup or learn are normal disagreements. Resolve others by identity, scope and evidence, never timestamps or a guessed repair. Use `note` by Issue number for cleanup after the branch disappears.

Explain goal, user outcome, milestone and status, relevant revision and evidence, remaining exits, blockers and next action. Report on resume, increment, transition, rollback, scope change or blocker. Direction needs confirmed intent, Issue and tested workspace; Preparation needs settled decisions, prerequisites and plan go, or bounded checks and mode; Increment needs applied task proof; Acceptance needs criterion results and required reviews; Delivery needs integration, intended closure and cleanup proof. Call a milestone met only at its evidenced exit. Failure reopens Increment, plan or design changes reopen Preparation, and changed intent reopens Direction. Keep scope remaining on a parent distinct from an integrated subset. Task k/N is a count.

### Recovery and parallel work

Confirm the original process and its children ended and reconcile partial effects before any restart. A timeout or cancelled parent alone proves neither, and inspection gives no authority to terminate. Check pending commits, check outputs, active workers, owned worktrees and uncertain writes. Preserve their state and any rejected, stale or duplicate result. Keep the prior reservation and withhold the same work while its exit is unknown. Keep independent work moving. When a shared contract changes, identify affected tasks and evidence, hold their integration until checked against the approved new contract, and reuse unaffected inputs. Reapply only an owned, unapplied outcome under the current plan and base. Reconcile external results through the Delivery routing rule before retrying.

For tracked session state use `running <issue> add <label>` for a background launch and `running <issue> done <label>` after exit and result recovery, including child processes and partial effects. Use `note` for additions and avoid competing whole-key writes. Keep decisions open only while unresolved, blockers for waits on a person, followups for out-of-scope findings, and notes for changes and evidence.

## Handoff

Finish current checks, commits, state updates and delegated work before asking the user to clear or start a new session. As the final ledger action run `release <issue>`, except Claude launched from Codex with `CODEX_THREAD_ID`, whose release would release the Codex session. The user performs `/clear`. Respect pending delegated work and preserve its reservation.

Reuse one authorized local record with goal, authority, current root/branch/base/head, confirmed decisions, partial and remaining work, check results and inputs, active workers, uncertain effects and the exact next action. Point the next session to records it can open and keep sensitive detail in its approved destination. For tracked work the card already carries Issue, checkpoint and ledger. Keep an issued resume prompt under 500 tokens and add only new information and exact links. A requested prompt file goes to a unique, uncommitted `docs/prompts/YYYY-MM-DD-i<issue>-<slug>-prompt.md`; end the reply with `Read <absolute path> and continue.` Provide the prompt in the reply if no file, or up to about 2,000 characters if filed, except when the user will paste it instead. End a brief for another native session with the release rule above. For a delegated worker follow the router's Change delegation procedure.

## Unattended work

Only explicit unattended intent (including in a non-interactive prompt) or a user stepping away changes mode. Bypass settings give no authority. Set `mode <issue> autonomous < reason` with the reason on the first line of stdin. Proceed only while this session owns autonomous mode, the task is open, and decisions, blocked and running are empty. Holds go in decisions or blocked. Keep Issue text and planned external actions in ledger notes while autonomous, with no Issue publication, push or integration. A new session claims the task only under the same conditions or switches with `mode <issue> interactive < reason` when the user is present. Show the notes and publish only approved content with the Tool.

For changed requirements or acceptance, confirm the new intent before using the Tool's `intent` operation. Keep the original criteria and results in a checkpoint. The command preserves state and unchecks changed criteria because their earlier evidence no longer applies.
