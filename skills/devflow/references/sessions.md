# Sessions

Done when the session operation at hand - a note, a progress report or return, a handoff, a mode switch or an intent
change - is complete, with every ledger or Issue write (`note`, `mode`, `intent`, `release`) made through the card's `Tool:`
command and nothing guessed.

## Notes and closed branches

`ledger-update` replaces whole keys, so two sessions adding notes through it would drop one; add a note with `note`.
After the Issue branch is gone (cleanup on main), `note` still takes the Issue's number, as long as its ledger exists.

## Progress and returns

For verified tracked work entering through devflow, explain the position by the
[User navigation](../../../docs/specs/lifecycle.md#user-navigation) milestones: the goal, the current increment's user
result, the milestone and its separate status, observed evidence, remaining exit conditions, the next primary action,
blockers or open decisions, and the applicable revision. Task k/N is a count, not a percentage. Refresh it at resume,
stage completion, increment completion, milestone transitions, rollback, scope changes or blockers, not in every
message. Pre-Issue entry and other skills' direct returns are outside this procedure; a missing card does not
authorize routing.

Where each fact comes from:

- Confirmed intent and coarse state: the card's Tool `read <issue>`. Task progress and blockers of the same Issue:
  `ledger <issue>`. A missing or unreadable ledger means unknown progress and blockers, not none.
- Recorded verification evidence: the ledger's notes and the Issue's checkpoints; open the raw evidence they point to
  only when needed, and leave it where it is.
- Task and proof scope: the linked plan (bounded: the one change and checks set in design). Revision applicability: Git.
  When HEAD differs from `lastCommit`, check the changed commits; a successful log alone proves no applicability.
- Use the existing boundary updates; create no milestone fields, duplicate status record or routine public posts. Keep
  private paths and logs local.

Reconciling:

- Issue `build` with ledger task `verify` is the normal loop; Issue `done` with cleanup or learn is normal closeout.
  Reconcile other differences by repository, Issue and branch identity, scope and applicable revision, not by the
  newest timestamp.
- Missing or stale verification evidence, or unclear task versus full verification, leaves acceptance unpassed.
  Preserve lookup, writer, branch and history warnings and failed results.
- A truncated card is not the whole state: recover the full filtered Issue and ledger, then the relevant local plan and
  evidence, through their existing readers before relying on omitted facts
  ([Budget and preserving meaning](../../../docs/specs/issues.md#budget-and-preserving-meaning)). Do not guess completion
  or repair state automatically.
- If identity or a conflict stays unresolved, show the position as unverified, hold the dependent effect and name the
  cheapest owner read or evidence comparison as the next step; continue independent covered work.

Returns follow [Going back](../../../docs/specs/lifecycle.md#going-back): a behaviour failure to Increment, a plan error
to plan in Preparation, a broken assumption to design in Preparation, changed intent or acceptance to Direction through
the existing confirmation path. Explain why, the evidence and decisions kept, the exit conditions reopened and the next
action. A fix in the same scope needs no new interview. Review-only stops at findings.

Keep the delivered subset, the parent scope, Issue closure and local closeout apart. After branch deletion use the
closed-branch rules above, without reopening an Issue to match a label. Issue `done` or a deleted branch alone proves
neither integration nor completed cleanup; Delivery stays open until its scoped exits have evidence. Learning is
optional.

## Handing off

Before handing off, including asking the user to `/clear`, finish the work's checks, commits and state updates, wait
for its delegated work to finish, then run `release <issue>` as the last ledger action. Report the next step and let
the user clear: Codex may keep the old thread alive after `/clear`
([Concurrent sessions](../../../docs/specs/ledger.md#concurrent-sessions)).

The resume card already brings back the Issue, its latest checkpoint and the ledger, so a resume prompt or a brief for
another session carries only what they lack: instructions and decisions made since the last checkpoint, under 500
tokens, pointing at the Issue rather than restating it - restating costs output now and input in every session that
reads it.

- A brief for a subagent follows [Delegation brief](../../../docs/specs/orchestration.md#delegation-brief). One for
  another session (`codex exec`, `claude -p`) ends with that session running `release <issue>`.
- A prompt file goes to `docs/prompts/YYYY-MM-DD-i<issue>-<slug>-prompt.md`, never under a name that already exists,
  since concurrent sessions can pick the same name. Leave it uncommitted, and end the reply with
  `Read <absolute path> and continue.`, because a relative path resolves only from where it was written.
- Without a file, the reply carries the prompt in full. With one, the reply also carries the prompt up to about 2,000
  characters; past that, only what counts as done and the closing line, unless a person will paste the reply instead of
  opening the file.

## Unattended work

[Unattended runs](../../../docs/specs/ledger.md#unattended-runs) says when the ledger's `mode` becomes `autonomous` and
what waits while it is. The Stop hook decides from `mode`, `stage`, `task`, `decisions`, `blocked` and `running` whether
unattended work continues. Set the mode with `mode <issue> autonomous < reason`, giving the reason on the
first line of stdin; the command keeps the reason and change time. While it is autonomous, `devflow-state` posts no Issue text: keep
what would have been posted in the ledger's notes. When the user is back, run `mode <issue> interactive < reason`, show
the user those notes, and post what they approve.

## Changed requirements

When the requirements or acceptance criteria change, show the user the new intent (the body above the state block)
and, once they approve the text, post it with `intent`, never by hand: the command keeps the state block and unchecks
criteria whose text changed, since their evidence no longer applies.
