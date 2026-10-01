# ADR-0009: 소유자의 스킬 6개를 devflow로 옮기고 상황에 따라 자동 호출한다

상태: 채택 (사용자 결정)

## 맥락

- 소유자의 스킬 6개(development-start, pr-review-workflow, workspace-cleanup, grilling, writing-for-agents,
  prompt-generator)는 최신 배포본이 개인 스킬 폴더에 있다.
- 예전 비공개 저장소와 프로젝트 작업 폴더에도 사본이 있지만, 그것들은 배포본보다 오래됐거나 같다. 원본이 사실상
  여러 곳에 흩어져 있다.
- grilling과 prompt-generator의 description은 "사용자가 요청할 때"로 범위를 묶어 두어서 자동으로 불리지 않는다.
- 두 호스트 모두 description이 맞으면 스킬을 스스로 고른다. 스킬이 많으면 description을 자르거나 뺀다.
- 6개 모두 개인 경로, 이름, 비밀값이 없고, 크기도 스킬 예산 안이다.

## 결정

- 6개를 모두 devflow로 옮겨 Apache-2.0으로 공개한다. devflow가 원본이 된다.
- 첫 커밋은 배포본을 바이트 그대로 가져오고, 파일별 SHA-256을 `SOURCES.md`에 남긴다. 수정은 그다음 커밋부터 한다.
- 보조 스킬의 자동 호출 조건:

| 스킬 | 자동 호출 조건 |
|---|---|
| grilling | 구현에 들어가기 전에 사용자만 정할 수 있는 중요한 결정이 열려 있을 때 |
| prompt-generator | 재개 카드로 부족해서 작업을 다른 세션이나 에이전트에 넘겨야 할 때 |
| writing-for-agents | 그대로 둔다. Claude에서는 `paths`로 지침 파일을 다룰 때 확실히 불리게 한다 |

- 라우터는 정해진 단계에서 이 스킬들을 이름으로 부른다([lifecycle](../../specs/lifecycle.md)).
- description을 바꿀 때마다 트리거 eval을 돌린다.

## 결과

- 플러그인을 설치하기 전까지는 개인 사본과 플러그인 스킬이 함께 보인다. 개발 중에는 `--plugin-dir`로 시험하고,
  설치를 확인한 뒤 개인 사본을 정리한다. 정리는 지시를 받아서 한다.
- grilling의 릴리스 평가는 devflow의 `skills/grilling`을 대상으로 삼는다.
- grilling은 범위를 좁게 유지한다. 넓으면 자율 작업을 자꾸 멈추게 된다.

## 검토한 대안

- 보조 스킬은 원래 위치에 두고 이름으로만 부르기: 원래 위치가 레거시여서 원본이 둘이 된다.
- 사용자가 직접 호출할 때만 쓰기: 사용자가 원한 방식이 아니다.
