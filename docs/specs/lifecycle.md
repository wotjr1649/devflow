# 생명주기 계약

devflow 라우터가 작업을 어느 단계로 보내는지, 단계마다 무엇을 책임지고 언제 넘어가는지, 새 정보가 생기면 어디로
돌아가는지 정한다. 각 단계 안에서 일이 어떻게 실행되는지(모드, 위임, 모델)는 [orchestration](orchestration.md)이
정한다.

## 라우터

- `devflow` 스킬이 재개 카드(Issue 현재 상태, 작업 장부, `.devflow.json`)로 지금 단계와 작업 번호를 판단한다.
- 담당 스킬이 있는 단계는 그 스킬을 이름으로 부르고, 없는 단계는 라우터의 단계 reference를 읽는다.
- 단계를 옮길 때 장부와 Issue 현재 상태의 "단계"를 바꾼다. 작업 루프 안에서 build와 verify를 오가는 것은 장부에만
  적는다.
- compact 뒤에는 라우터를 다시 부르고 지금 단계의 reference를 다시 읽는다. 호출한 스킬 본문은 compact 뒤에 다시
  붙지만, reference 파일은 다시 붙지 않기 때문이다.

## 단계

| # | 단계 | 책임 | 산출물 | 넘어가는 조건 | 담당 |
|---|---|---|---|---|---|
| 1 | discover 구상 | 무엇을 왜 만들지: 문제, 사용자, 성공 기준, 제외 범위 | intent 초안 | 사용자가 intent를 확인함 | 라우터 reference, grilling |
| 2 | start 착수 | Issue 등록과 대조, 수용 기준 확정, 작업 브랜치, 기준선 검사 | Issue 본문, 브랜치 | Issue 연결 확인, 기준선 통과 | development-start |
| 3 | design 설계 | 요구사항과 설계 정리, 대안 비교, 우려 지점 표시, 계약이 바뀌면 spec과 결정 기록 | 설계 노트 또는 `docs/specs/`, 결정 기록 | 사용자만 정할 결정이 해결됨 | 라우터 reference, reviewer(설계 관점), grilling |
| 4 | plan 계획 | 작업별 파일, 순서, interfaces, 증명, 위험 | 비공개 계획과 공개 요약 | 계획이 작성됨 | 라우터 reference |
| 5 | ready 구현 가능성 확인 | [계획 품질](orchestration.md#계획) 점검, 전제(의존성, 도구, 권한, 검사 명령) 확인, 실행 모드 선택 | go 또는 no-go 체크포인트 | go | 라우터 reference. 계획이 `highRisk` 경로를 건드리거나 작업이 5개 이상이면 reviewer(설계 관점)가 한 번 검토 |
| 6 | build 구현 | 모드별 실행, 실패 테스트 확인, 작업 단위 커밋 | 커밋 | 계획의 작업이 끝남 | 라우터 reference, 구현 에이전트 |
| 7 | verify 검증 | 수용 기준을 실제로 실행해 확인, verifier가 새 컨텍스트에서 동작 확인 | 검증 증거 | 기준마다 실행 증거가 있음 | 라우터 reference, verifier |
| 8 | review 리뷰 | 새 컨텍스트 리뷰, 발견 사항 처리 | 발견 사항과 처리 | 정확성·요구사항 결함이 없음 | pr-review-workflow |
| 9 | ship 통합 | 통합 방식에 따른 push·PR·CI·머지, Issue 완료와 후속 Issue | 통합된 기본 브랜치, 종료된 Issue | 통합과 종료를 확인함 | pr-review-workflow |
| 10 | cleanup 정리 | 브랜치와 worktree 정리 | 정리 기록 | 정리 완료 | workspace-cleanup |
| 11 | learn 회고 | 교훈을 알맞은 곳에 둠 | 아래 "회고와 기억" | 교훈이 있을 때만 | 라우터 reference, 둘 곳이 에이전트가 읽는 파일이면 writing-for-agents |

ship은 통합하기 전에 Issue 브랜치에서 상태 블록을 done으로 쓰고 Issue를 닫는다. 브랜치를 지운 뒤에는 그 Issue에
쓸 수 없으므로, cleanup은 장부에만 남긴다.

## 경로별 단계

| 경로 | 도는 단계 |
|---|---|
| spike: 가능한지만 확인 | discover → build(버릴 시험) → 보고 |
| bounded: 이미 있는 흐름 수정 | start → design(채팅으로 짧게, ready 포함) → build → verify → review → ship → cleanup |
| architectural: 새 하위 시스템, 의존되는 인터페이스 변경 | 1~10, 교훈이 있으면 11 |

애매하면 무거운 쪽으로 분류하고, 숨은 복잡도가 드러나면 올린다. 설계해 보니 바꿀 파일이 1~2개이고 interface가 바뀌지
않으면 bounded로 내리고 이유를 장부에 남긴다. 작은 변경에서는 무거운 절차가 결과를 낫게 하지 않고 비용만 늘린다는
측정이 있다([sources](../research/sources.md)).

## 반복

- **작업 루프**: 계획의 작업마다 build → verify, M2·M3에서는 작업 리뷰까지 돈다. 다음 작업은 build부터 다시 시작한다.
  작업마다 커밋하고 장부를 갱신한다. 새 컨텍스트가 필요하면 대화형에서는 `/clear` 후 재개 카드로, 무인 실행에서는
  [자율 실행](ledger.md#자율-실행)대로 이어 간다.
- **마무리**: 모든 작업이 끝나면 verify(수용 기준 전체) → review(최종) → ship.
- **슬라이스 루프**: ship이 부분 통합이면 Issue를 닫지 않고, 남은 수용 기준을 위해 build로 돌아간다. 계획에 없던 일이면
  plan으로 돌아간다.

## 되돌아가기

| 생긴 일 | 돌아갈 단계 | 사용자에게 묻나 |
|---|---|---|
| 자기 변경의 버그, 검사 실패, verify 미달 | build | 아니요 |
| 리뷰 발견 사항 | build → verify → 범위를 좁힌 재리뷰 | 아니요 |
| 통합 중 CI 실패 | build | 아니요 |
| 계획이 틀림(파일, 순서, interface), 설계는 유효 | plan → ready, 비공개 계획을 그 자리에서 고침 | 아니요 |
| 설계 가정이 깨짐(새 제약, 접근 방식 불가) | design → plan → ready, 오래 남을 결정은 결정 기록 | 사용자만 정할 결정이면 예 |
| 요구사항이나 수용 기준이 바뀜 | discover 또는 start, 사용자가 확인한 intent를 `devflow-state intent`로 교체 | 예 |
| 범위 밖의 새 문제 | 재현된 결함과 사용자가 미루기로 정한 것은 바로 후속 Issue로, 그 밖은 장부에 남겨 ship 때 한 번에 제안 | 제안하는 것만 예 |
| ship에서 push가 거부됨 | Issue 브랜치에서 Issue를 다시 열고 상태를 되돌림. 검사 실패면 build, 그 밖은 ship | 아니요 |
| 외부 요인으로 막힘 | 현재 상태에 막힘을 적고 멈춤 | 예 |
| 숨은 복잡도(bounded → architectural) | design | 경로가 바뀐 것을 알림 |

같은 작업의 자동 수정은 [수정 루프](orchestration.md#수정-루프)를 따른다. 같은 목표로 세 번 실패하면 방법을 바꾸거나
멈추고 보고한다.

## eval

트리거 eval(`claude plugin eval . --tag trigger`)은 스킬 목록이 바뀐 사이클에서만 돌린다. BASE..HEAD로 판별한다.

- 돌린다: `skills/*/SKILL.md` frontmatter의 호출 필드(`name`, `description`, `when_to_use`, `paths`,
  `disable-model-invocation`, `user-invocable`)가 바뀌었거나, 스킬을 더하거나 지우거나 이름을 바꿨거나, `evals/trigger/`가
  바뀌었을 때.
- 돌리지 않는다: 스킬 본문, references, 훅, 에이전트, AGENTS.md만 바뀌었을 때. eval 실행은 격리되어 대상 플러그인만
  로드되고, 호스트는 스킬 목록만 보고 자동 호출을 정하므로 이 변경은 결과를 바꾸지 않는다([host-facts](../research/host-facts.md)).
- 결과 eval은 두지 않는다. 스킬 본문의 변경은 리뷰와 사이클 지표(개입, 오탐, 차단)로 보고, 개입이 늘거나 같은 실수가
  반복되면 결과 eval 장치를 만드는 Issue를 연다.
- Claude eval은 사용자 터미널에서 돌린다. 세션 안에서 띄우면 인증이 없어 멈춘다. 판정은 오류 난 실행을 빼고 트리거 80% 이상,
  오탐 10% 이하다. ship 체크포인트에 돌렸는지와 판별 근거를 남긴다.

### Codex 트리거 eval

Codex 실행기는 수동 opt-in이다. 기본 검사·CI·pre-push는 모델 평가를 실행하지 않는다.
`evals/trigger/`의 같은 24개 사례에서 frontmatter를 제외한 본문을 그대로 사용하고, 각 Claude grader의
양성·특정 스킬 음성 판정을 유지한다. `none--*`는 스킬이 하나라도 검출되면 실패한다.

```bash
node bin/devflow-codex-eval --smoke --budget-tokens 1000000
node bin/devflow-codex-eval --full --budget-tokens 1000000 --prior-results evals/results/<smoke>/result.json
```

- smoke는 양성·none 각 하나다. 전체 실행은 24개를 각각 한 번 순차 실행하며 재시도하지 않는다.
  budget 플래그가 없으면 모델 프로세스를 시작하지 않는다. `--prior-results`의 사용량도 예산에 합친다.
- `gpt-6.1-sol/high`, 사례당 300초다. 모델·effort·시간 제한·측정 대상·예산을 바꾸기 전에 사용자가 결정한다.
- 실행별 작업 폴더는 시작할 때 비어 있다. 별도의 임시 CODEX_HOME에 공개 snapshot으로 만든 devflow만 설치한다.
  개인 지침·기억·다른 플러그인·MCP·apps·web search는 포함하지 않는다. catalogue가 devflow 7개와 다르면 비용 없이 멈춘다.
- Windows에서는 이미 설치된 elevated backend를 재사용한다. 인증과 sandbox 상태는 값 복사 없이 임시 링크로 참조하고,
  종료·실패 시 링크만 제거한다. 새 계정·방화벽·호스트 설정을 만들어 실행하지 않는다.
- 평가 전용 PreToolUse guard는 공개 snapshot 안의 단일 literal 읽기·목록·검색 명령만 허용한다.
  읽기 범위는 guard, 쓰기·명령 network 제한은 read-only sandbox가 맡는다. 실제 guard 정의의 신뢰 해시를 확인하고
  신뢰 우회 옵션을 쓰지 않는다. 모델 호출 전 실제 셸로 허용·차단 canary와 감사 기록을 검사하고,
  실행 중 명령 수보다 guard 감사 기록이 적으면 invalid로 중단한다.
  공개 코드 복사본에서 평가용 manifest의 제품 훅을 제외하며 실제 설치본은 바꾸지 않는다.
- 해당 자식의 stdout JSONL만 읽는다. `item.*`의 `command_execution.command`가 대상 snapshot의
  `skills/<name>/SKILL.md`를 literal로 읽으려 한 경우 검출한다. 메시지·명령 출력·echo·목록의 경로는 증거가 아니다.
  읽기 실패도 시도로 검출하며, 변수로 조립한 경로나 읽기 없이 이미 주어진 본문을 적용하는 경우는 미검출이다.
  이는 스킬 참조 시도의 대리 지표이며 실제 지침 적용이나 결과 품질을 재지 않는다.
- 사용량은 `turn.completed.usage`의 input+output 합계다. cached input은 input에 포함되므로 다시 더하지 않는다.
  종료 후 예산에 닿으면 다음 사례를 시작하지 않는다. 진행 중인 turn이 예산을 넘는 것은 막을 수 없다.
  사용량을 얻지 못하면 추가 실행을 중단한다. 시간 초과·비정상 종료·불완전 JSONL은 invalid로 따로 집계하고 성공률에서 제외한다.
- 기대 스킬·검출 스킬·pass/fail/invalid·사용량·시간·환경·완료 여부는 Claude 결과 옆 `evals/results/`에 저장한다.
  원시 stdout·stderr와 세션 기록은 저장하거나 읽지 않는다. 실행 오류와 평가 실패는 종료 코드 1이며 완료 조건과 구별한다.

격리 방식과 대안의 이유: [ADR-0016](../design/decisions/ADR-0016-codex-trigger-eval.md).

## 회고와 기억

learn은 교훈이 있을 때만 돈다. 교훈은 성격에 따라 둔다.

| 교훈 | 둘 곳 |
|---|---|
| 기계로 막을 수 있음 | 훅, 테스트, doctor 검사. 옮긴 뒤 AGENTS.md에서 지운다 |
| 특정 영역에만 해당 | 그 영역의 spec이나 문서, 그리고 AGENTS.md 문서 지도의 한 행 |
| 저장소 전체, 두 번 반복, 기계로 막을 수 없음 | AGENTS.md Gotchas. 예산을 넘으면 덜 쓰이는 항목을 문서로 옮긴다 |
| 여러 저장소에 공통인 절차 | devflow 스킬. 스킬 목록을 바꾸면 [eval](#eval) |
| 개인 선호, 모든 저장소 공통 규칙 | 사용자 전역 지침. devflow는 제안만 한다 |
| 경위와 결정 이력 | Issue 체크포인트, 결정 기록, 커밋 메시지 |
| 그 컴퓨터에만 해당하는 환경 | 비공개 handoff나 호스트의 개인 메모리. 공용 지침에는 넣지 않는다 |

AGENTS.md를 고칠 때는 이제 기계로 막히는 Gotcha를 함께 지운다. 기억 도구와의 관계는
[documents](documents.md#기억-도구)가 정한다.
