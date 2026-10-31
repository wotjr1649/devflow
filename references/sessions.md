# Sessions

Ledger and Issue operations that apply only at these moments; the [devflow](../skills/devflow/SKILL.md) router points
here.

## Notes and closed branches

`ledger-update` replaces whole keys, so two sessions adding notes through it would drop one; add a note with `note`.
After the Issue branch is gone (cleanup on main), `note` still takes the Issue's number, as long as its ledger exists.

## Progress and returns

For verified tracked work entering through `devflow`, use the [lifecycle mapping](../docs/specs/lifecycle.md#사용자-탐색).
Explain the goal, current increment's user result, milestone and separate status, observed evidence, remaining exit
conditions, next primary action, blockers/open decisions and applicable revision. Task k/N is a count, not a percentage.
Refresh at resume, stage completion, increment completion, milestone transitions, rollback, scope changes or blockers,
not every message.
Pre-Issue entry and other skills' direct returns are outside this procedure; a missing card does not authorize routing.

Read confirmed intent and coarse state with the card's Tool `read <issue>`, and the same Issue's task progress and
blockers with `ledger <issue>`. Recorded verification evidence is in the ledger's notes and the Issue's checkpoints;
open the raw evidence they point to only when needed. Open the linked plan for task/proof scope (bounded: the one
change and checks set in design) and Git for revision applicability. Keep original evidence in place. Use existing
boundary updates; create no milestone fields, duplicate status record or routine public posts. Keep private paths/logs
local.

Issue build with ledger task verify can be the normal loop; Issue done with cleanup/learn can be normal closeout.
Reconcile other differences by repository/Issue/branch identity, scope and applicable revision, not the newest
timestamp. Check changed commits when HEAD differs from lastCommit; a successful log alone proves no applicability.
Missing/unreadable ledger means unknown task progress and blockers, not none. Missing/stale verification evidence or
unclear task versus full verification leave acceptance unpassed. Preserve lookup/writer/branch/history warnings and
failed results.
For a truncated card, recover the full filtered Issue and ledger, then the relevant local plan/evidence through their
existing readers before relying on omitted facts. Do not guess completion or repair state automatically. If identity
or conflict remains unresolved, show position unverified, hold the dependent effect and name the cheapest owner read
or evidence comparison next; continue independent covered work. Card truncation follows the card budget rules in [issues](../docs/specs/issues.md#예산과-의미-보존).

Apply the lifecycle's return rules: behavior failure to Increment; plan error to plan in Preparation; broken
assumption to design in Preparation; changed intent/acceptance to Direction through the existing confirmation path.
Explain why, retained evidence/decisions, reopened exit conditions and next action. Same-scope fixes need no new
interview. Review-only stops at findings. Separate delivered subset, parent scope, Issue closure and local closeout;
after branch deletion use the closed-branch rules above, without reopening an Issue to match a label. Issue done or
branch deletion alone proves neither integration nor completed cleanup; keep Delivery open until its scoped exits
have evidence. Learning is optional.

## Handing off

Before handing off, including asking the user to `/clear`, finish the work's checks, commits and state updates, wait
for its delegated work to finish, then run `release <issue>` as the last ledger action. Report the next step and let
the user clear: Codex may keep the old thread alive after `/clear`
([동시 세션](../docs/specs/ledger.md#동시-세션)).

## Unattended work

[자율 실행](../docs/specs/ledger.md#자율-실행) says when the ledger's `mode` becomes `autonomous` and what waits while
it is. The Stop hook decides from `mode`, `stage`, `task`, `decisions`, `blocked` and `running` whether unattended work
continues. Set the mode with `mode <issue> autonomous < reason`, giving the reason on the first line of stdin; the command keeps
the reason and change time. While it is autonomous, `devflow-state` posts no Issue text: keep what would have been posted
in the ledger's notes. When the user is back, run `mode <issue> interactive < reason`, show the user those notes, and
post what they approve.

## Changed requirements

When the requirements or acceptance criteria change, show the user the new intent (the body above the state block)
and, once they approve the text, post it with `intent`, never by hand: the command keeps the state block and unchecks
criteria whose text changed, since their evidence no longer applies.
