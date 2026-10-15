# Sessions

Ledger and Issue operations that apply only at these moments; the [devflow](../skills/devflow/SKILL.md) router points
here.

## Counting interventions

Count as it happens, not at the end: when the user corrects the stage, path, method or an output, or a devflow guard
blocked something legitimate, run `metric <issue> interventions` or `metric <issue> filterFalsePositives` with a
one-line note on stdin ([수동 지표](../docs/specs/metrics.md#수동-지표)). Guard blocks themselves are logged automatically.

## Notes and closed branches

`ledger-update` replaces whole keys, so two sessions adding notes through it would drop one; add a note with `note`.
After the Issue branch is gone (cleanup on main), `note` and `metric` still take the Issue's number, as long as its
ledger exists.

## Handing off

Before handing off, including asking the user to `/clear`, finish the work's checks, commits and state updates, wait
for its delegated work to finish, then run `release <issue>` as the last ledger action. Report the next step and let
the user clear: Codex may keep the old thread alive after `/clear`
([동시 세션](../docs/specs/ledger.md#동시-세션)).

## Unattended work

[자율 실행](../docs/specs/ledger.md#자율-실행) says when the ledger's `mode` becomes `autonomous` and what waits while
it is. The Stop hook decides from `mode`, `stage`, `task`, `decisions`, `blocked` and `running` whether unattended work
continues. Set the mode with `mode <issue> autonomous < reason`, giving the reason on the first line of stdin; the command keeps
the reason and change time. When the user is back, run `mode <issue> interactive < reason`, show the queued posts with
`pending`, and `flush` them once the user has read them.

## Changed requirements

When the requirements or acceptance criteria change, show the user the new intent (the body above the state block)
and, once they approve the text, post it with `intent`, never by hand: the command keeps the state block and unchecks
criteria whose text changed, since their evidence no longer applies.
