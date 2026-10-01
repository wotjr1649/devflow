# 생명주기 계약

devflow 라우터가 작업을 어느 단계로 보내는지, 단계마다 무엇을 책임지고 언제 넘어가는지, 새 정보가 생기면 어디로
돌아가는지 정한다. 각 단계 안에서 일이 어떻게 실행되는지(모드, 위임, 모델)는 [orchestration](orchestration.md)이
정한다.

## 라우터

- `devflow` 스킬이 재개 카드(Issue 현재 상태와 `.devflow.json`)로 지금 단계와 작업 번호를 판단한다.
- 담당 스킬이 있는 단계는 그 스킬을 이름으로 부르고, 없는 단계는 라우터의 단계 reference를 읽는다.
- 단계를 옮길 때 Issue 현재 상태의 "단계"를 바꾼다.
- compact 뒤에는 라우터를 다시 부르고 지금 단계의 reference를 다시 읽는다. 호출한 스킬 본문은 compact 뒤에 다시
  붙지만, reference 파일은 다시 붙지 않기 때문이다.

## 단계

| # | 단계 | 책임 | 산출물 | 넘어가는 조건 | 담당 |
|---|---|---|---|---|---|
| 1 | discover 구상 | 무엇을 왜 만들지: 문제, 사용자, 성공 기준, 제외 범위 | intent 초안 | 사용자가 intent를 확인함 | 라우터 reference, grilling |
| 2 | start 착수 | Issue 등록과 대조, 수용 기준 확정, 작업 브랜치, 기준선 검사 | Issue 본문, 브랜치 | Issue 연결 확인, 기준선 통과 | development-start |
| 3 | design 설계 | 요구사항과 설계 정리, 대안 비교, 우려 지점 표시, 계약이 바뀌면 spec과 결정 기록 | 설계 노트 또는 `docs/specs/`, 결정 기록 | 사용자만 정할 결정이 해결됨 | 라우터 reference, architect, grilling |
| 4 | plan 계획 | 작업별 파일, 순서, interfaces, 증명, 위험 | 비공개 계획과 공개 요약 | 계획이 작성됨 | 라우터 reference |
| 5 | ready 구현 가능성 확인 | [계획 품질](orchestration.md#계획) 점검, 전제(의존성, 도구, 권한, 검사 명령) 확인, 실행 모드 선택 | go 또는 no-go 체크포인트 | go | 라우터 reference, architect(새 컨텍스트 검토) |
| 6 | build 구현 | 모드별 실행, 실패 테스트 확인, 작업 단위 커밋 | 커밋 | 계획의 작업이 끝남 | 라우터 reference, 구현 에이전트 |
| 7 | verify 검증 | 수용 기준을 실제로 실행해 확인, verifier가 새 컨텍스트에서 동작 확인 | 검증 증거 | 기준마다 실행 증거가 있음 | 라우터 reference, verifier |
| 8 | review 리뷰 | 새 컨텍스트 리뷰, 발견 사항 처리 | 발견 사항과 처리 | 정확성·요구사항 결함이 없음 | pr-review-workflow |
| 9 | ship 통합 | 통합 방식에 따른 push·PR·CI·머지, Issue 완료와 후속 Issue | 통합된 기본 브랜치, 종료된 Issue | 통합과 종료를 확인함 | pr-review-workflow |
| 10 | cleanup 정리 | 브랜치와 worktree 정리 | 정리 기록 | 정리 완료 | workspace-cleanup |
| 11 | learn 회고 | 교훈을 알맞은 곳에 둠 | 아래 "회고와 기억" | 교훈이 있을 때만 | writing-for-agents |

## 경로별 단계

| 경로 | 도는 단계 |
|---|---|
| spike: 가능한지만 확인 | discover → build(버릴 시험) → 보고 |
| bounded: 이미 있는 흐름 수정 | start → design(채팅으로 짧게, ready 포함) → build → verify → review → ship → cleanup |
| architectural: 새 하위 시스템, 의존되는 인터페이스 변경 | 1~10, 교훈이 있으면 11 |

애매하면 무거운 쪽으로 분류한다. 숨은 복잡도가 드러나면 올리기만 하고 내리지 않는다.

## 반복

- **작업 루프**: 계획의 작업마다 build → verify, M2·M3에서는 작업 리뷰까지 돈다. 다음 작업은 build부터 다시 시작한다.
  작업마다 커밋과 체크포인트를 남기고, 필요하면 `/clear` 후 재개 카드로 이어 간다.
- **마무리**: 모든 작업이 끝나면 verify(수용 기준 전체) → review(최종) → ship.
- **슬라이스 루프**: ship이 부분 통합이면 Issue를 닫지 않고, 남은 수용 기준을 위해 build로 돌아간다. 계획에 없던 일이면
  plan으로 돌아간다.

## 되돌아가기

| 생긴 일 | 돌아갈 단계 | 사용자에게 묻나 |
|---|---|---|
| 자기 변경의 버그, 검사 실패, verify 미달 | build | 아니요 |
| 리뷰 발견 사항 | build → verify → 범위를 좁힌 재리뷰 | 아니요 |
| 통합 중 CI 실패 | build | 아니요 |
| 계획이 틀림(파일, 순서, interface), 설계는 유효 | plan → ready, 계획은 같은 커밋에서 고침 | 아니요 |
| 설계 가정이 깨짐(새 제약, 접근 방식 불가) | design → plan → ready, 오래 남을 결정은 결정 기록 | 사용자만 정할 결정이면 예 |
| 요구사항이나 수용 기준이 바뀜 | discover 또는 start, Issue intent 수정 | 예 |
| 범위 밖의 새 문제 | 체크포인트에 후속 후보로 남기고 ship 때 후속 Issue 제안 | 예 |
| 외부 요인으로 막힘 | 현재 상태에 막힘을 적고 멈춤 | 예 |
| 숨은 복잡도(bounded → architectural) | design | 경로가 바뀐 것을 알림 |

같은 작업의 자동 수정은 [수정 루프](orchestration.md#수정-루프)를 따른다. 같은 목표로 세 번 실패하면 방법을 바꾸거나
멈추고 보고한다.

## 회고와 기억

learn은 교훈이 있을 때만 돈다. 교훈은 성격에 따라 둔다.

| 교훈 | 둘 곳 |
|---|---|
| 기계로 막을 수 있음 | 훅, 테스트, doctor 검사. 옮긴 뒤 AGENTS.md에서 지운다 |
| 특정 영역에만 해당 | 그 영역의 spec이나 문서, 그리고 AGENTS.md 문서 지도의 한 행 |
| 저장소 전체, 두 번 반복, 기계로 막을 수 없음 | AGENTS.md Gotchas. 예산을 넘으면 덜 쓰이는 항목을 문서로 옮긴다 |
| 여러 저장소에 공통인 절차 | devflow 스킬, 바꾼 뒤 eval |
| 개인 선호, 모든 저장소 공통 규칙 | 사용자 전역 지침. devflow는 제안만 한다 |
| 경위와 결정 이력 | Issue 체크포인트, 결정 기록, 커밋 메시지 |
| 그 컴퓨터에만 해당하는 환경 | 비공개 handoff나 호스트의 개인 메모리. 공용 지침에는 넣지 않는다 |

AGENTS.md를 고칠 때는 이제 기계로 막히는 Gotcha를 함께 지운다. 기억 도구와의 관계는
[documents](documents.md#기억-도구)가 정한다.
