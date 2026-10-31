# 평가 계약

## eval

트리거 eval(`claude plugin eval . --tag trigger --no-publish`)은 스킬 호출의 회귀를 확인하는 선택 도구다. 수용 기준이나
출시 조건이 되지 않는다([선택의 이유](../design/current-decisions.md#지침과-보호)).

- 쓸 만한 때: `skills/*/SKILL.md` frontmatter의 호출 필드(`name`, `description`, `when_to_use`, `paths`,
  `disable-model-invocation`, `user-invocable`)가 바뀌었거나, 스킬을 더하거나 지우거나 이름을 바꿨거나, `evals/trigger/`가
  바뀌었을 때.
- 결과가 바뀌지 않는 때: 스킬 본문, references, 훅, 에이전트, AGENTS.md만 바뀌었을 때. eval 실행은 격리되어 대상 플러그인만
  로드되고, 호스트는 스킬 목록만 보고 자동 호출을 정하기 때문이다([host-facts](../research/host-facts.md)).
- 스킬 본문의 변경은 리뷰와 실제 사용에서 드러난 결함으로 본다.
- 사용자 터미널에서 돌린다. 세션 안에서 띄우면 인증이 없어 멈춘다. 리포트는 `--no-publish`로 게시하지 않는다(#45). 판정은
  오류 난 실행을 빼고 트리거 80% 이상, 오탐 10% 이하다. 돌렸으면 ship 체크포인트에 결과를 적는다.
- 사례는 `evals/trigger/`에 둔다. 과거 Codex 트리거·행동 측정의 결과와 근거는 git 기록에서 찾는다.
