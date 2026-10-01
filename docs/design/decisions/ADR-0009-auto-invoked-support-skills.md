# ADR-0009: 보조 스킬을 상황에 따라 자동 호출한다

상태: 채택 (사용자 요청). description 문구와 호출 지점은 제안이다.

## 맥락

- grilling과 prompt-generator의 description은 "사용자가 요청할 때"로 범위를 묶어 두어서 자동으로 불리지 않는다.
- writing-for-agents는 이미 상황 기반이다.
- 두 호스트 모두 description이 맞으면 스킬을 스스로 고른다. 다만 스킬이 많으면 description을 자르거나 뺀다.

## 결정

세 스킬을 플러그인으로 옮긴다.

| 스킬 | 자동 호출 조건 |
|---|---|
| grilling | 구현에 들어가기 전에 사용자만 정할 수 있는 중요한 결정이 열려 있을 때 |
| prompt-generator | 재개 카드로 부족해서 작업을 다른 세션이나 에이전트에 넘겨야 할 때 |
| writing-for-agents | 그대로 둔다. Claude에서는 `paths`로 지침 파일을 다룰 때 확실히 불리게 한다 |

라우터 references는 정해진 지점에서 이 스킬들을 이름으로 부른다. description을 바꿀 때마다 트리거 eval을 돌린다.

## 결과

- 옮긴 뒤 `~/.claude/skills`와 `~/.agents/skills`의 개인 사본을 지운다.
- grilling은 범위를 좁게 유지한다. 넓으면 자율 작업을 자꾸 멈추게 된다.

## 검토한 대안

사용자가 직접 호출할 때만 쓰기: 사용자가 원한 방식이 아니다.
