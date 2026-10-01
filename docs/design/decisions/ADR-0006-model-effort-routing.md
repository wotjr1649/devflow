# ADR-0006: 역할별 모델과 effort

상태: 채택 (사용자 지정). 개정: 기계적 구현을 Sonnet `high`에서 `medium`으로, 판단이 필요한 구현을 Sonnet `xhigh`에서
Opus `medium`(승격 시 `high`)으로, 보안 리뷰 기본을 `xhigh`에서 `high`로 바꾸고, 승격 규칙과 diagnostician을 더했다.
이어서 정의를 도구·effort 기준 6개로 합치고, Codex 탐색·요약을 Luna `high` 기본으로 바꿨다(설계 검토 반영, 사용자 결정).

## 맥락

- Opus 5.5와 Sonnet 5.5는 Claude Code에서 기본 effort가 `medium`이다. Opus 5.5의 `medium`은 코딩에서 Opus 5의
  `high`와 같거나 낫다.
- Sonnet 5.5 가이드는 잘 정의된 에이전트 코딩을 `medium`에서, 어렵거나 긴 작업을 `high`에서 시작하고, 가장 어려운
  장기 작업에는 Opus를 쓰라고 한다. `xhigh`·`max`는 품질 향상을 측정한 경우에만 쓴다.
- 메인 세션에서 effort를 바꾸면 프롬프트 캐시가 무효화된다.
- Sonnet은 높은 effort에서 스스로 리뷰 라운드를 돌리고 리뷰어 서브에이전트를 띄우는 경향이 있고, `medium` 이하의 긴
  작업에서는 끝나기 전에 멈추고 확인을 구하는 경향이 있다.
- Claude Code에서 서브에이전트의 모델은 호출할 때 바꿀 수 있지만 effort는 에이전트 정의에서만 정해진다.
- Codex 문서는 Luna는 `high`에서 시작하고, 리뷰어·보안 에이전트에는 `high`를 쓰라고 권한다.

## 결정

- 표와 승격 조건은 [orchestration](../../specs/orchestration.md#모델과-effort)이 소유한다.
- 메인 컨트롤러의 모델과 effort는 사용자가 고른다. effort 차이는 서브에이전트에만 둔다.
- 에이전트 정의는 도구와 effort 단계별로 두고, 모델과 관점은 호출할 때 고른다. 구현 네 단계(Sonnet `medium`·`high`,
  Opus `medium`·`high`)를 정의 두 개(`implementer`, `implementer-deep`)로 낸다. 리뷰·설계 검토·보안 리뷰는 같은
  `reviewer` 정의에 관점과 모델을 달리 주고, 탐색과 로그 요약은 같은 `explorer`를 쓴다. 정의는 6개다.
- Codex의 탐색·요약은 Luna `high`에서 시작하고, 부족함이 측정되면 `xhigh`로 올린다. Codex 문서의 권고와 "`xhigh`는
  측정한 뒤에만" 원칙에 맞춘다.
- 승격은 메인이 위임할 때 정한다. 횟수, 경로, diff 크기처럼 기계로 판정할 수 있는 조건은 규칙대로 적용하고, 나머지는
  메인이 판단한다. 한 작업에서 한 칸만 올리고 이유를 장부에 남긴다.
- 실패 원인 분석은 파일을 고치지 않는 `diagnostician`이 맡는다. 분석과 수정을 나눠 증상만 덮는 수정을 줄인다.
- Claude 구현 에이전트에는 `disallowedTools: Agent`, `maxTurns`, 지시서의 마무리 문단과 끝까지 진행하라는 줄을 둔다.

## 결과

파일럿에서 확인할 것:
- gpt-6-luna가 `xhigh`를 지원하는지
- 역할별 승격 비율과 작업당 비용. 승격이 잦은 역할은 기본값을 올린다.
- 탐색 `low`가 놓치는 것이 있는지. 있으면 `medium` 정의를 더한다.
- Codex 탐색에서 Luna `high`가 놓치는 것이 있는지.

## 검토한 대안

- 모든 서브에이전트가 세션 모델을 상속: 단순하지만 가장 비싸다.
- 가장 싼 모델로 통일: 리뷰 품질이 떨어질 위험이 있다.
- 역할마다 effort 단계별 정의를 모두 둠: 승격을 그대로 표현하지만 에이전트가 늘어 목록 비용과 설명 겹침이 커진다.
- 역할별 정의 10개: 목록에서 역할이 잘 보이지만, 같은 도구와 effort를 쓰는 정의끼리 설명이 겹친다.
- PreToolUse 훅(`updatedInput`)으로 승격을 강제: 결정적이지만 규칙이 파일럿으로 굳기 전에 만들면 고칠 곳이 늘어난다.
