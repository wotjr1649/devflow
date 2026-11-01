# 평가 계약

## eval

eval은 `claude plugin eval`로 돌리는 선택 도구다. 수용 기준이나 출시 조건이 되지 않는다([선택의 이유](../design/current-decisions.md#지침과-보호)).
사례는 `evals/`에 두고, 결과는 모델(`--model`으로 고정)과 Claude Code 버전, 비용과 함께 그 변경의 체크포인트에 적는다.
인증된 터미널에서 돌린다(Bash 자식 프로세스에는 인증이 없어 멈춘다). 리포트는 `--no-publish`로 게시하지 않는다.
대상은 커밋한 revision의 깨끗한 worktree다. 경로를 대상으로 주면 그 아래의 플러그인 사본까지 찾아 사례를 함께 돌리므로,
`.work/` 같은 ignored 폴더에 사본이 있는 작업 트리에서는 다른 플러그인을 잰다.

**트리거 eval**(`evals/trigger/`, `--tag trigger`)은 스킬 호출의 회귀를 본다.

- 쓸 만한 때: `skills/*/SKILL.md` frontmatter의 호출 필드(`name`, `description`, `when_to_use`, `paths`,
  `disable-model-invocation`, `user-invocable`)가 바뀌었거나, 스킬을 더하거나 지우거나 이름을 바꿨거나, `evals/trigger/`가
  바뀌었을 때.
- 결과가 바뀌지 않는 때: 스킬 본문, references, 훅, 에이전트, AGENTS.md만 바뀌었을 때. 호스트는 스킬 목록만 보고 자동
  호출을 정하기 때문이다([host-facts](../research/host-facts.md)).
- Skill grader는 2-arm 실행에서 점수에 들지 않으므로 `--ablation none`으로 돌린다. 판정은 오류 난 실행을 빼고 트리거 80%
  이상, 오탐 10% 이하다.

**행동 eval**(`evals/behavior/`, `--tag behavior`)은 단계 진입 뒤 맞는 reference를 읽고 올바른 다음 행동을 하는지 본다.
스킬 본문과 references를 바꿀 때 쓸 만하다.

- 사례는 재개 카드와 요청을 프롬프트에 담고 읽기 전용 도구만 허용한다. 외부 쓰기를 하지 않는다.
- 점수는 `llm` grader가 행동(다음 행동, 거절, 지어내지 않음)으로 정한다. 어떤 reference를 읽었는지는 `tool: Read`
  grader에 `arm: with-only`를 붙여 지표로만 본다. 그러지 않으면 플러그인 없는 arm에서 실패해 Δ가 부푼다. 경로 패턴은
  구분자를 `[\\/]+`로 쓴다(Windows 경로는 JSON에서 `\\`로 이스케이프된다).
- 플러그인 없음과 현재 플러그인을 비교하는 기본 2-arm으로 돌린다. 구조를 바꾸는 변경은 같은 사례를 바꾸기 전과 뒤의
  revision에서 같은 모델로 돌려 비교한다.

역슬래시가 든 사례 파일은 셸 heredoc이 아니라 편집 도구로 쓰고 바이트를 확인한다.
