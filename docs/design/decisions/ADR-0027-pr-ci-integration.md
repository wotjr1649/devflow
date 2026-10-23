# ADR-0027: devflow 자체 통합을 PR과 서버 보호로 옮긴다

상태: 제안 (#73, 2026-10-24 사용자가 흐름을 채택, 활성화는 별도 승인). [ADR-0008](ADR-0008-license-and-integration.md)의
통합 부분을 대체하고 라이선스 결정은 유지한다.

## 맥락

ADR-0008은 리뷰할 다른 사람이 없다는 이유로 main 직접 통합(fast-forward, PR 없음)을 택했고, #30에서 로컬 pre-push의
`verify`를 통합 관문으로 두었다. 그 뒤 모든 제품 커밋을 다른 호스트가 리뷰하게 됐다(#73). 리뷰 근거·CI·통합 결과를
한 변경 단위로 묶을 기록이 Issue 체크포인트와 장부에 흩어졌다. 로컬 관문은 훅이 켜진 클론에서만 돌고, 서버는 main
갱신을 막지 않는다(2026-10-24 조회: main 보호와 ruleset 없음).

## 결정

- `.devflow.json`의 `integration`을 `pr-ci`로 바꾼다. Issue는 문제·합의·수용, 비공개 계획은 설계·실행, PR은 한 변경의
  리뷰·CI·통합 기록을 맡는다. #73 전체나 이미 통합한 증분에는 PR을 만들지 않는다.
- 흐름: 작은 증분 → 로컬 검증 → 브랜치 HEAD의 push CI → PR에 독립 리뷰 근거(리뷰한 SHA) 연결 → 최신 head와 병합
  결과의 CI 확인 → merge commit으로 통합 → 실제 main SHA와 main CI 확인 → 완료·정리.
- merge commit: 기존 제품 커밋과 그 SHA(시험 잠금·리뷰 패키지·CI 근거)가 그대로 main 이력에 남는다. squash·rebase는
  SHA를 바꿔 잠금·정리 대응을 다시 설계해야 하므로 쓰지 않는다. 선형 이력 강제와 함께 쓰지 않는다.
- 서버 보호: main에 활성 ruleset 하나(PR 경유, 승인 0, 대화 해결, merge만, 네 check의 strict 통과, 삭제·강제 push 금지,
  우회 주체 없음). 혼자 운영하므로 자기 승인을 요구하지 않고, 다른 호스트 리뷰를 GitHub 승인으로 위장하지 않는다.
- 로컬 pre-push는 브랜치 push 전 조기 관문으로 남지만 통합 관문은 서버의 ruleset과 PR check다. 서버 보호가 없거나 다르면
  통합하지 않는다. 문서만 바뀐 PR도 네 check가 필요하다.
- 전환 시점: 열린 증분을 현행 방식으로 마친 뒤, 이 결정의 커밋을 마지막 local-merge로 통합하고 곧바로 ruleset을 켠다.
  그 사이에는 통합하지 않는다. 다음 실제 증분이 이 흐름을 처음 적용한다.

## 대안

- 현행 유지: 리뷰 근거와 통합이 한 기록에 묶이지 않고 서버가 main을 지키지 않는다.
- squash/rebase: 이력이 짧아지지만 검토·잠금한 SHA가 main에서 사라진다.
- classic branch protection: ruleset과 기능이 겹치고, 둘을 함께 두면 판정이 모호하다.

## 되돌림

ruleset이 PR을 요구하므로 되돌림도 PR로 한다: 이 커밋을 revert하는 PR(그 동안 `pull_request` trigger는 유지)을 병합한
뒤, 별도 사용자 승인으로 ruleset을 끈다. 서버 보호를 먼저 끄고 빠져나오지 않는다. 바꾼 설정의 이전 값은 실행 기록에 둔다.
