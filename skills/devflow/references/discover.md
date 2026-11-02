# Discover

Done when the work ends in one disposition the evidence supports: start, with an intent the user confirmed; an
investigation's findings and open questions; a draft, when only a draft was asked for; defer or stop, with the reason
and what would reopen it; or, on the spike path, a throwaway build whose report ends the work instead of an Issue's full
cycle. A draft the user has not confirmed stays a draft ([Stages](../../../docs/specs/lifecycle.md#stages)).

An implementation request, not a spike, that already states the problem and observable acceptance is itself the
confirmed intent: it goes straight to start without a second interview. Research-only work can end with findings, with
no Issue and no feature decision.

- Look before you ask: read the request, the decisions already made and the code or docs it touches, and reuse what is
  settled unless new evidence changes it, so the user answers only what the files cannot. Keep apart what you observed,
  what was claimed, what you infer and what is unknown; a symptom alone does not establish its cause.
- Stay on what and why. When what to build is still open, compare a few concepts by user path, value, cost and risk,
  counting an existing tool or no build where plausible, and recommend the smallest useful scope with its exclusions.
  Implementation choices belong to design unless feasibility decides the concept.
- Write acceptance criteria someone could run: a command, an observable behaviour, a measurement. "Works well" cannot
  be checked at verify.
- Shape the draft as the Issue body, under the template headings `## 문제`, `## 원하는 결과`, `## 영향받는 사용자·시스템`,
  `## 제약`, `## 열린 질문`, `## 수용 기준` (one `- [ ]` per criterion) and `## 범위 / 제외 / 의존·권한`, marking
  proposed against confirmed ([Issue template](../../../docs/specs/issues.md#issue-template)). Keep private evidence,
  local paths and raw logs out of it, since it becomes a public post.
- Report the disposition and its reason. On start, hand the confirmed intent and decisions to the start stage, which
  registers the Issue.
- Before an Issue exists, a draft, an investigation, a deferral, a stop or a spike creates no Issue, branch, ledger or
  product change. When tracking is unavailable, keep the draft, say that tracking failed and do not claim the start
  happened.
- On a tracked Issue sent back here ([Going back](../../../docs/specs/lifecycle.md#going-back)): a part of the scope the
  user defers becomes a follow-up Issue; deferring or stopping the whole Issue goes into its state block; a changed
  intent replaces the old one through `devflow-state intent` after the user approves the text, with the original
  criteria and their results kept in a checkpoint.
