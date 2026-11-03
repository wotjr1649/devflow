# Sessions

Done when the session operation at hand - a note, a progress report or return, a handoff, a mode switch or an intent
change - is complete, with every ledger or Issue write (`note`, `mode`, `intent`, `release`) made through the card's
`Tool:` command and nothing guessed.

## Notes and closed branches

After the Issue branch is gone (cleanup on main), `note` still takes the Issue's number, as long as its ledger exists.

## Progress and returns

For verified tracked work entering through devflow, explain the position by five milestones and their exit evidence:

- Direction (discover, start): confirmed intent and acceptance, linked Issue, working branch, baseline.
- Preparation (design, plan): decisions settled, per-task plan with proof, prerequisites, go; bounded: the change, check
  and `runMode` set in design, no plan or go.
- Increment (build and verify per task): the task's user outcome, verified at the applied revision.
- Acceptance (full verify, review): evidence for every criterion in scope; required reviews and findings handled.
- Delivery (ship, cleanup, learn if needed): the integrated scope, the Issue closed, local cleanup confirmed.

Status (in progress, met, blocked, unconfirmed) is shown apart from the name: met only with exit evidence, never because
the stage was entered; blocked only for dependent actions. Report the goal, the increment's user result, milestone and
status, observed evidence, remaining exits, the next action, blockers or open decisions, and the applicable revision;
task k/N is a count, not a percentage. Refresh at resume, stage or increment completion, milestone changes, rollback,
scope changes or blockers, not in every message. Pre-Issue entry and other skills' direct returns are outside this
procedure.

Where each fact comes from:
- Confirmed intent and coarse state: the card's Tool `read <issue>`. Task progress and blockers of the same Issue:
  `ledger <issue>`. A missing or unreadable ledger means unknown progress and blockers, not none.
- Verification evidence: the ledger's notes and the Issue's checkpoints; open the raw evidence they point to as needed.
- Task and proof scope: the linked plan (bounded: the one change and checks set in design). Revision applicability: Git.
  When HEAD differs from `lastCommit`, check the changed commits; a successful log alone proves no applicability.
- Create no milestone fields, duplicate status records or routine public posts; keep private paths and logs local.

Reconciling:
- Issue `build` with ledger task `verify` is the normal loop; Issue `done` with cleanup or learn is normal closeout.
  Reconcile other differences by repository, Issue and branch identity, scope and applicable revision, not by the newest
  timestamp.
- Missing or stale evidence, or unclear task versus full verification, leaves acceptance unpassed. Keep warnings and
  failed results.
- Before relying on what a truncated card omits, recover the full Issue and ledger, then the local plan and evidence,
  through their readers. Do not guess completion or repair state automatically.
- If identity or a conflict stays unresolved, show the position as unverified, hold the dependent effect and name the
  cheapest owner read or evidence comparison as the next step; continue independent covered work.

A return by the router's going-back rule reopens a milestone: a behaviour failure Increment, a plan error or broken
assumption Preparation, changed intent or acceptance Direction (through the existing confirmation). Explain why, the
evidence and decisions kept, the exits reopened and the next action; a fix in the same scope needs no new interview.
Review-only stops at findings.

Keep the delivered subset, the parent scope, Issue closure and local closeout apart. After branch deletion use the
closed-branch rules above, without reopening an Issue to match a label. Issue `done` or a deleted branch alone proves
neither integration nor completed cleanup; Delivery stays open until its scoped exits have evidence. Learning is
optional.

## Handing off

Before handing off, including asking the user to `/clear`, finish the work's checks, commits and state updates, wait for
its delegated work to finish, then run `release <issue>` as the last ledger action. Report the next step and let the
user clear: Codex may keep the old thread alive after `/clear`.

The resume card already brings back the Issue, its latest checkpoint and the ledger, so a resume prompt or a brief for
another session carries only what they lack: instructions and decisions made since the last checkpoint, under 500
tokens, pointing at the Issue rather than restating it - restating costs output now and input in every session that
reads it.

- A subagent brief, in English, gives the task, BASE, goal, acceptance, files it may change, git-ignored inputs by path
  and the check; puts push, Issue writes, spawning subagents, deleting or weakening tests and new dependencies out of
  scope, with a test change, dependency, or scope or interface change it does not settle ending in `NEEDS_DECISION`;
  asks for one end status (`DONE`, `DONE_WITH_CONCERNS`, `NEEDS_DECISION`, `BLOCKED`) with files changed and checks
  run or not; and ends with stop and report once checked, with no extra rounds. One for another session
  (`codex exec`, `claude -p`) ends with that session running `release <issue>`.
- A prompt file goes to `docs/prompts/YYYY-MM-DD-i<issue>-<slug>-prompt.md`, never under a name that already exists,
  since concurrent sessions can pick the same name. Leave it uncommitted, and end the reply with `Read <absolute path>
  and continue.`, because a relative path resolves only from where it was written.
- Without a file, the reply carries the prompt in full. With one, the reply also carries the prompt up to about 2,000
  characters; past that, only what counts as done and the closing line, unless a person will paste the reply instead of
  opening the file.

## Unattended work

The ledger's `mode` becomes `autonomous` only when the user steps away or orders an unattended run, or a prompt launched
non-interactively says so; bypass or yolo settings do not show whether a person is present. Set it with
`mode <issue> autonomous < reason`, giving the reason on the first line of stdin; the command keeps the reason and time.
While it is autonomous, nothing is posted to Issues, pushed or integrated: `devflow-state` refuses Issue writes, so keep
what would have been posted in the ledger's notes for the next interactive turn. The Stop hook decides from `mode`,
`stage`, `task`, `decisions`, `blocked` and `running` whether unattended work continues. A new session taking over
an autonomous task switches it to interactive when the user is present, or claims it with `mode <issue> autonomous` to
continue unattended. When the user is back, run `mode <issue> interactive < reason`, show the notes, and post what the
user approves.

## Changed requirements

When the requirements or acceptance criteria change, show the user the new intent (the body above the state block) and,
once they approve the text, post it with `intent`, never by hand: the command keeps the state block and unchecks
criteria whose text changed, since their evidence no longer applies.
