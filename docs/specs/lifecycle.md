# 생명주기 계약

devflow 라우터가 작업을 어느 단계로 보내는지, 단계마다 무엇을 책임지고 언제 넘어가는지, 새 정보가 생기면 어디로
돌아가는지 정한다. 각 단계 안에서 일이 어떻게 실행되는지(모드, 위임, 모델)는 [orchestration](orchestration.md)이
정한다.

## 라우터

- `devflow` 스킬이 재개 카드(Issue 현재 상태, 작업 장부, `.devflow.json`)로 지금 단계와 작업 번호를 판단한다.
- 카드가 있어도 새 작업 요청은 `development-start`가 받고 [경로](#경로별-단계)를 가른다. spike나 문제와 수용 기준이
  확인되지 않은 일은 discover로 보낸다([ADR-0018](../design/decisions/ADR-0018-new-work-goes-to-development-start.md)).
- 담당 스킬이 있는 단계는 그 스킬을 이름으로 부르고, 없는 단계는 라우터의 단계 reference를 읽는다.
- review·ship은 `pr-review-workflow`를 진입점으로 유지한다. devflow 전용 순서는 공통
  [review](../../skills/pr-review-workflow/references/review.md)와 [ship](../../references/ship.md)이 소유한다.
  일반 PR 관문은 담당 스킬의 references를 적용하며, review-only는 ship·cleanup으로 확대하지 않는다.
- 단계를 옮길 때 장부와 Issue 현재 상태의 "단계"를 바꾼다. 작업 루프 안에서 build와 verify를 오가는 것은 장부에만
  적는다.
- compact 뒤에는 라우터를 다시 부르고 지금 단계의 reference를 다시 읽는다. 호출한 스킬 본문은 compact 뒤에 다시
  붙지만, reference 파일은 다시 붙지 않기 때문이다.

## 사용자 탐색

스킬 진입점 7개와 내부 단계 10개 및 done은 유지한다. 사용자에게는 아래 다섯 milestone으로 현재 위치를 설명한다.
이름은 중립적으로 쓰고 상태(진행 중·충족·막힘·미확인)를 따로 표시한다. 단계에 들어왔다는 이유로 충족으로 표시하지
않는다. 충족은 해당 범위의 exit 증거가 있을 때만 쓰며, 막힘은 의존 행동에만 적용한다.

| Milestone | 내부 단계 | 나가는 데 필요한 증거 |
|---|---|---|
| 방향 (Direction) | discover, start | 확인된 intent·수용 기준, Issue 연결, 작업 브랜치와 기준선 |
| 준비 (Preparation) | design, plan | 해결된 주요 결정, 작업별 계획·증명, 필요한 전제와 go. bounded는 design에서 정한 한 변경·검사, 전제 확인과 `runMode` |
| 증분 (Increment) | 작업별 build ↔ verify | 현재 작업의 사용자 결과와 적용 revision에서의 검증 |
| 수용 (Acceptance) | 마지막 작업 뒤 전체 verify, review | 범위 전체 수용 기준의 실행 증거와 필수 리뷰·발견 사항 처리 |
| 전달 (Delivery) | ship, cleanup, 필요할 때 learn; done은 Issue 종료 상태 | 실제 통합 범위와 Issue 종료, 남은 로컬 정리 확인 |

bounded는 plan 단계와 go 체크포인트 없이 전제 확인을 design 안에서 처리하므로, 계획 파일이나 go가 없다는 이유로 준비를
미확인으로 두지 않는다. 작업 검증과 전체 수용 검증은 scope로 구별한다.
부분 통합은 전달된 부분만 설명하며 상위 범위의 충족을 뜻하지 않는다. Issue done과 로컬 closeout은 구별하고, learn은
교훈이 있을 때만 한다. milestone은 새 저장 상태·승인 관문·Issue 게시 주기가 아니다.

이 표시는 `devflow`가 연결을 확인한 기존 Issue의 재개(`/clear`·compact 뒤 포함), 단계 종료, 되돌림에 적용한다.
신규 pre-Issue 진입, 다른 스킬의 직접 진입·반환, 카드 renderer와 축약 방식은 이 계약의 구현 범위에 포함하지 않는다.
카드가 없거나 연결이 미확인이라면 기존 라우팅 제한을 유지한다. 축약된 카드는 완전한 상태가 아니므로 원 소유자의
읽기 경로로 복구한다. 이는 카드 축약 자체의 수정이 아니다.

의미 있는 경계(재개, 단계 종료, 증분 완료, milestone 전환, 되돌림, 범위 변경, 막힘)에서 목표·현재 증분의 사용자 결과·현재 위치와
상태·완료 증거·남은 exit·다음 행동·막힘/미결 결정·적용 revision을 짧게 설명한다. 작업 k/N은 개수이며 완료율이 아니다.
Issue의 confirmed intent·큰 단계와 체크포인트의 검증 기록, 장부의 작업 루프·막힘·검증 증거 notes, 계획의 작업/증명
연결(bounded는 design의 결정), 그것들이 가리키는 원시 근거([문서](documents.md)의 근거)와 Git revision이 각 사실을
소유한다. milestone용 필드나 별도 상태 문서를 만들지 않고 [sessions](../../references/sessions.md#progress-and-returns)로
대조한다. 누락·오래된 증거·진짜 충돌은 미확인으로 표시하고 의존 행동을 보류한다. 최신 timestamp만으로 충돌을 지우거나
이전 FAIL을 PASS로 바꾸지 않는다. 기존 경계 업데이트를 쓰고 매 응답마다 긴 진행표를 만들지 않는다.

복귀는 아래 [되돌아가기](#되돌아가기)를 그대로 따른다. 동작 실패는 증분, 계획 오류는 준비의 plan, 설계 가정
실패는 준비의 design으로 돌아간다. intent·수용 기준 변경은 방향에서 기존 사용자 확인을 거친다. 이유·보존할 증거·다시
충족할 exit·다음 행동을 알리고, 같은 범위의 수정에 새 인터뷰를 요구하지 않는다.

## 단계

| # | 단계 | 책임 | 산출물 | 넘어가는 조건 | 담당 |
|---|---|---|---|---|---|
| 1 | discover 구상 | 무엇을 왜 만들지: 문제, 사용자, 성공 기준, 제외 범위. 관측·주장·추정·미확인을 나누고, 무엇을 만들지 열려 있으면 컨셉과 최소 범위를 비교 | intent 초안, 또는 조사 결과·보류/중단 이유와 재개 조건 | 사용자가 intent를 확인하면 start. 문제와 관측 가능한 수용 기준을 이미 담은 구현 요청은 그 자체가 확인된 intent라 재인터뷰 없이 start. spike는 버릴 시험과 보고로 끝남. Issue가 생기기 전의 조사·초안만·보류·중단은 결과를 보고하고 끝나며 Issue·브랜치·장부·제품 변경을 만들지 않음 | 라우터 reference, grilling |
| 2 | start 착수 | Issue 등록과 대조, 수용 기준 확정, 작업 브랜치, 기준선 검사 | Issue 본문, 브랜치 | Issue 연결 확인, 기준선 통과 | development-start |
| 3 | design 설계 | 요구사항과 설계 정리, 대안 비교, 우려 지점 표시, 계약이 바뀌면 spec과 결정 기록 | 설계 노트 또는 `docs/specs/`, 결정 기록 | 사용자만 정할 결정이 해결됨 | 라우터 reference, reviewer(설계 관점), grilling |
| 4 | plan 계획 | 작업별 파일, 순서, interfaces, 증명, 위험. [계획 품질](orchestration.md#계획) 점검, 전제(의존성, 도구, 권한, 검사 명령) 확인, 실행 모드 선택 | 비공개 계획, 공개 요약과 go 또는 no-go 체크포인트 | go | 라우터 reference. 계획이 신뢰 경계(인증·권한·비밀·훅·외부 입력 처리)를 바꾸거나 작업이 5개 이상이면 reviewer(설계 관점)가 한 번 검토 |
| 5 | build 구현 | 모드별 실행, 실패 테스트 확인, 작업 단위 커밋 | 커밋 | 계획의 작업이 끝남 | 라우터 reference, 구현 에이전트 |
| 6 | verify 검증 | 수용 기준을 실제로 실행해 확인, [실행 모드](orchestration.md#실행-모드)에 따른 동작 확인 | 검증 증거 | 기준마다 실행 증거가 있음 | 라우터 reference, 모드에 따른 실행 검증(explorer) |
| 7 | review 리뷰 | [실행 모드](orchestration.md#실행-모드)에 따른 최종 검토, 발견 사항 처리 | 발견 사항과 처리 | 정확성·요구사항 결함이 없음 | pr-review-workflow |
| 8 | ship 통합 | 통합 방식에 따른 push·PR·CI·머지, Issue 완료와 후속 Issue | 통합된 기본 브랜치, 종료된 Issue | 통합과 종료를 확인함 | pr-review-workflow |
| 9 | cleanup 정리 | 브랜치와 worktree 정리 | 정리 기록 | 정리 완료 | workspace-cleanup |
| 10 | learn 회고 | 교훈을 알맞은 곳에 둠 | 아래 "회고와 기억" | 교훈이 있을 때만 | 라우터 reference, 둘 곳이 에이전트가 읽는 파일이면 writing-for-agents |

ship은 Issue 브랜치에서 상태 블록을 done으로 쓰고 Issue를 닫는다. `local-merge`는 통합 전에, `pr-ci`는 병합 결과를 확인한
뒤에 한다. 범위가 남은 부분 통합은 닫지 않고 남은 범위를 상태에 둔다. 브랜치를 지운 뒤에는 그 Issue에
쓸 수 없으므로, cleanup과 그 뒤의 learn은 장부에만 남긴다.

표의 에이전트 역할은 [호스트별 역할](orchestration.md#모델과-effort)을 따른다. 설계·계획 검토는 Claude의 reviewer,
Codex의 메인이 맡는다.

## 경로별 단계

| 경로 | 도는 단계 |
|---|---|
| spike: 가능한지만 확인 | discover → build(버릴 시험) → 보고 |
| bounded: 이미 있는 흐름 수정 | start → design(채팅으로 짧게, 전제 확인 포함) → build → verify → review → ship → cleanup |
| architectural: 새 하위 시스템, 의존되는 인터페이스 변경 | 1~9, 교훈이 있으면 10 |

애매하면 무거운 쪽으로 분류하고, 숨은 복잡도가 드러나면 올린다. 설계해 보니 바꿀 파일이 1~2개이고 interface가 바뀌지
않으면 bounded로 내리고 이유를 장부에 남긴다. 작은 변경에서는 무거운 절차가 결과를 낫게 하지 않고 비용만 늘린다는
측정이 있다([sources](../research/sources.md)).

## 반복

- **작업 루프**: 계획의 작업마다 build → verify, M2·M3에서는 작업 리뷰까지 돈다. 다음 작업은 build부터 다시 시작한다.
  작업마다 커밋하고 장부를 갱신한다. 새 컨텍스트가 필요하면 대화형에서는 [인계](ledger.md#동시-세션)를 마치고 `/clear` 후 재개 카드로, 무인 실행에서는
  [자율 실행](ledger.md#자율-실행)대로 이어 간다.
- **마무리**: 모든 작업이 끝나면 verify(수용 기준 전체) → review(최종) → ship.
- **슬라이스 루프**: ship이 부분 통합이면 Issue를 닫지 않고, 남은 수용 기준을 위해 build로 돌아간다. 계획에 없던 일이면
  plan으로 돌아간다.

## 되돌아가기

| 생긴 일 | 돌아갈 단계 | 사용자에게 묻나 |
|---|---|---|
| 자기 변경의 버그, 검사 실패, verify 미달 | build | 아니요 |
| 리뷰 발견 사항 | build → verify. 동작이나 권한을 바꾼 수정이면 범위를 좁힌 재리뷰, 문구·형식 수정이면 CI([재검증](orchestration.md#리뷰)) | 아니요 |
| 통합 중 CI 실패 | 조기 종료한 Issue를 다시 열고 상태를 build로 되돌림 | 아니요 |
| 계획이 틀림(파일, 순서, interface), 설계는 유효 | plan, 비공개 계획을 그 자리에서 고침 | 아니요 |
| 설계 가정이 깨짐(새 제약, 접근 방식 불가) | design → plan, 오래 남을 결정은 결정 기록 | 사용자만 정할 결정이면 예 |
| 요구사항이나 수용 기준이 바뀜(원래 기준과 결과는 체크포인트에) | discover 또는 start, 사용자가 확인한 intent를 `devflow-state intent`로 교체 | 예 |
| 범위 밖의 새 문제 | 재현된 결함과 사용자가 미루기로 정한 것은 바로 후속 Issue로, 그 밖은 장부에 남겨 ship 때 한 번에 제안 | 제안하는 것만 예 |
| ship에서 push가 거부됨 | Issue 브랜치에서 Issue를 다시 열고 상태를 되돌림. 검사 실패면 build, 그 밖은 ship | 아니요 |
| 외부 요인으로 막힘 | 현재 상태에 막힘과 필요한 입력을 적고 의존 행동만 보류. 범위 안의 독립 작업은 계속 | 사용자만 정할 결정이나 미승인 효과가 있을 때만 |
| 숨은 복잡도(bounded → architectural) | design | 경로가 바뀐 것을 알림 |

같은 작업의 자동 수정은 [수정 루프](orchestration.md#수정-루프)를 따른다. 같은 목표로 세 번 실패하면 방법을 바꾸거나
멈추고 보고한다.

## eval

트리거 eval은 선택이며, 실행 조건과 방법은 [eval](eval.md)이 정한다.

## 회고와 기억

learn은 교훈이 있을 때만 돈다. 교훈은 성격에 따라 둔다.

| 교훈 | 둘 곳 |
|---|---|
| 테스트로 확인할 수 있음 | 테스트. 옮긴 뒤 AGENTS.md에서 지운다. 안전 하한선은 남긴다([documents](documents.md#에이전트가-읽는-글) 10번) |
| 특정 영역에만 해당 | 그 영역의 spec이나 문서, 그리고 AGENTS.md 문서 지도의 한 행 |
| 저장소 전체, 두 번 반복, 테스트로 확인할 수 없음 | AGENTS.md Gotchas. 예산을 넘으면 덜 쓰이는 항목을 문서로 옮긴다 |
| 여러 저장소에 공통인 절차 | devflow 스킬. 스킬 목록을 바꾸면 [eval](#eval)을 선택해 돌릴 수 있다 |
| 개인 선호, 모든 저장소 공통 규칙 | 사용자 전역 지침. devflow는 제안만 한다 |
| 경위와 결정 이력 | Issue 체크포인트, 결정 기록, 커밋 메시지 |
| 그 컴퓨터에만 해당하는 환경 | 비공개 handoff나 호스트의 개인 메모리. 공용 지침에는 넣지 않는다 |

AGENTS.md를 고칠 때는 이제 기계로 막히는 Gotcha를 함께 지운다(안전 하한선 제외). 기억 도구와의 관계는
[documents](documents.md#기억-도구)가 정한다.
