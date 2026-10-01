# ADR-0010: 단계 스킬을 라우터 하나로

상태: 제안

## 맥락

단계마다 스킬을 하나씩 두고(start, plan, build, review, ship) 보조 스킬까지 더하면 10개가 된다. 스킬 목록은
매 턴 비용이고, description이 겹치면 엉뚱한 스킬이 불린다. OpenAI는 여러 워크플로를 가진 스킬의 루트를 짧은
라우터로 두라고 권한다.

## 결정

- `devflow` 라우터 스킬 하나를 둔다. 재개 카드로 단계를 판단하고 그 단계의 reference만 읽는다.
- 별도 스킬로 남기는 것:
  - `workspace-cleanup`: 삭제를 다루고 루프 밖에서도 쓴다
  - `repo-standards`: 루프 밖에서도 쓴다
  - 보조 스킬 3개

## 결과

- 단계는 description이 아니라 라우터를 거쳐서만 시작된다.
- SKILL.md와 각 reference는 5,000토큰 미만을 지킨다.

## 다시 볼 조건

eval에서 라우터가 올바른 reference를 읽지 못하면 다시 나눈다.
