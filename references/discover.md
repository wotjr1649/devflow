# Discover

Done when the work ends in one disposition the evidence supports: start, with an intent the user confirmed; an
investigation's findings and open questions; a draft, when only a draft was asked for; or defer or stop, with the
reason and what would reopen it. A draft the user has not confirmed stays a draft.

An implementation request, not a spike, that already states the problem and observable acceptance goes straight to
start without a second interview. Research-only work can end with findings, with no Issue and no feature decision.

- Look before you ask: read the request, the decisions already made and the code or docs it touches, and reuse what
  is settled unless new evidence changes it. Keep apart what you observed, what was claimed, what you infer and what
  is unknown; a symptom alone does not establish its cause.
- Stay on what and why. When what to build is still open, compare a few concepts by user path, value, cost and risk,
  counting an existing tool or no build where plausible, and recommend the smallest useful scope with its exclusions.
  Implementation choices belong to design unless feasibility decides the concept.
- Write acceptance criteria someone could run: a command, an observable behaviour, a measurement. "Works well" cannot
  be checked at verify.
- Call `grilling` for a choice only the user can make; keep what depends on it pending and settle the rest from the
  code and the docs.
- Shape the draft as the Issue body in [Issue 템플릿](../docs/specs/issues.md#issue-템플릿): the problem, who or what
  it affects, the outcome, acceptance, what is out of scope and the open questions, marking proposed against
  confirmed. Keep private evidence, local paths and raw logs out of it.
- Report the disposition and its reason. Start hands the confirmed intent and decisions to `development-start`, which
  registers it. A draft, an investigation, a deferral or a stop creates no Issue, branch, ledger or product change;
  when tracking is unavailable, keep the draft and do not claim the start happened. Changing an existing Issue's
  intent goes through `devflow-state intent` after the user approves the text.
- On the spike path the work after discover is a throwaway build and a report, not an Issue's full cycle.
