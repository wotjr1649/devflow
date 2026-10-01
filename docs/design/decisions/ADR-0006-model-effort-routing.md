# ADR-0006: 역할별 모델과 effort

상태: 채택 (사용자 지정)

## 맥락

- Opus 5.5와 Sonnet 5.5는 기본 effort가 `medium`이다.
- 메인 세션에서 effort를 바꾸면 프롬프트 캐시가 무효화된다.
- Sonnet은 높은 effort에서 스스로 리뷰 라운드를 돌리고 리뷰어 서브에이전트를 띄우는 경향이 있다.
- Codex 문서는 Luna는 `high`에서 시작하고, 리뷰어·보안 에이전트에는 `high`를 쓰라고 권한다.

## 결정

- 표는 [orchestration](../../specs/orchestration.md#모델과-effort)이 소유한다.
- 메인 컨트롤러의 모델과 effort는 사용자가 고른다. effort 차이는 서브에이전트에만 둔다.
- Claude 구현 에이전트에는 `disallowedTools: Agent`, `maxTurns`, 지시서의 마무리 문단을 둔다.
- 같은 작업에서 2회 실패하면 모델을 한 단계 올린다.

## 결과

파일럿에서 확인할 것:
- gpt-6-luna가 `xhigh`를 지원하는지
- Sonnet `xhigh`와 Opus의 작업당 비용 차이

## 검토한 대안

- 모든 서브에이전트가 세션 모델을 상속: 단순하지만 가장 비싸다.
- 가장 싼 모델로 통일: 리뷰 품질이 떨어질 위험이 있다.
