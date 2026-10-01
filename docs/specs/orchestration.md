# 오케스트레이션 계약

작업이 어떤 단계로 흐르고, 누가 코드를 쓰고, 언제 위임하며, 어떤 모델과 effort로 돌리는지 정한다.

## 단계와 경로

단계, 경로(spike, bounded, architectural), 반복, 되돌아가기는 [lifecycle](lifecycle.md)이 정한다. 이 문서는 그 안에서
일이 어떻게 실행되는지 정한다. 경로별 실행 모드는 이렇다: spike는 버릴 시험만 하고, bounded는 M0 또는 M1,
architectural은 M1~M3로 구현한다.

## 계획

architectural 경로의 계획은 대화를 보지 못한 엔지니어가 계획만 읽고 구현할 수 있을 때 끝난다. 작업마다 바꿀 파일,
순서, interfaces(consumes / produces), 그 작업을 증명할 검사를 적는다. 계획 전체에는 프로젝트 공통 제약(버전 하한,
의존성 제한, 이름 규칙)과 테스트가 다루지 않는 입력 가운데 사용자가 겪을 가능성이 큰 것을 적는다.

확정하기 전에 세 가지를 묻는다. 무엇이 깨질 수 있는가, 가장 위험한 단계는 무엇인가, 택하지 않은 대안은 무엇이고 왜
버렸는가. 이 중 사용자만 정할 수 있는 결정이 남으면 그 결정에 한해 grilling을 쓴다.

구현이 계획에서 벗어나면 같은 커밋에서 계획을 고친다.

## 구현과 검증

- 실행할 수 있는 코드를 바꾸면, 그 변경을 실제로 실행하는 검사(테스트, 타입 검사, 빌드, 바뀐 명령)를 돌린 뒤에 완료로
  보고한다. 구문 검사나 시작하지 못한 검사는 검증으로 치지 않는다.
- 빠진 것이 프로젝트에 선언된 의존성뿐이면 프로젝트의 패키지 매니저와 lockfile로 설치한다. sudo나 시스템 패키지
  매니저는 쓰지 않는다.
- 검사를 돌릴 수 없으면 어떤 검사를 왜 못 돌렸는지 보고한다.
- 새 동작의 테스트는 수정 전에, 또는 수정을 되돌린 상태에서 실패하는 것을 한 번 확인한다. 테스트를 먼저 쓸지 나중에
  쓸지는 프로젝트 규칙을 따른다. 어느 쪽이든 실패를 확인하지 않은 테스트는 그 수정을 증명하지 못한다.
- 버그 수정은 재현 테스트를 먼저 만들어 실패를 확인한 뒤 코드를 고친다. 이때 그 테스트는 고치지 않는다. 프로젝트가
  원하면 수정 작업 중 테스트 파일 편집을 PreToolUse 훅으로 막는다.

## 실행 모드

결정과 쓰기는 메인 한 곳에서 한다. 여러 에이전트가 동시에 쓰면 각자의 행동에 담긴 드러나지 않은 결정이 충돌한다.
서브에이전트는 맥락을 보호하고 새 시각으로 검증하는 데 쓴다.

| 모드 | 언제 | 누가 쓰나 | 서브에이전트 |
|---|---|---|---|
| **M0** | 변경 내용을 한 문장으로 설명할 수 있다 | 메인 | 없음 |
| **M1** (기본) | 그 밖의 일반 작업 | 메인 | 탐색, 테스트·로그 요약, 원인 분석, verifier, 최종 리뷰 (모두 읽기 전용) |
| **M2** | 독립적으로 테스트할 수 있는 작업이 3개 이상이거나, 읽을 양이 메인 컨텍스트의 절반을 넘을 것으로 보이거나, 자율 장시간 실행 | 구현 서브에이전트가 한 번에 하나씩 | 작업별 리뷰, 최종 리뷰 |
| **M3** (Claude 전용) | 파일이 겹치지 않고 인터페이스가 계획에 고정되어 있다 | worktree별 구현 에이전트, 동시에 2~3개까지 | 작업별 리뷰, 최종 리뷰 |
| **M4** (Claude 전용) | 수십 개 파일에 같은 기계적 변경, 또는 저장소 전체 감사 | Workflow 스크립트 | 결과를 서로 검증하는 단계 포함. 사용자가 직접 실행 |

M3에서는 메인이 결과를 하나씩 머지하고, 머지할 때마다 전체 검사를 돌린다.

## 메인이 맡는 일

- Issue 상태, 계획, 작업 장부
- 위임 지시서 범위 밖의 모든 결정
- 결과 통합과 최종 검증
- 체크포인트 기록
- 원격 쓰기 확인 요청, 사용자와의 소통

## 위임 지시서

```
TASK k/N · Issue #i · BASE <sha>
Goal:
Acceptance:
Files you may change: …  (leave every other file as it is)
Interfaces: consumes … / produces …
Check: <command>  (healthy output: …)
Out of scope for you: push, Issue writes, spawning subagents, deleting or weakening tests, adding dependencies
End with one status: DONE | DONE_WITH_CONCERNS | NEEDS_DECISION | BLOCKED
Report: files changed, checks run with results, checks not run and why
Keep working until the brief is done; stop early only with NEEDS_DECISION or BLOCKED.
When the work in this brief is done and its checks pass, stop and report. Do not start extra
rounds of review or changes outside the listed files; mention anything worth doing at the end.
```

지시서는 에이전트가 읽는 글이라 영어로 쓴다([documents](documents.md#에이전트가-읽는-글) 9번).

BASE는 위임하기 전에 기록한다. `HEAD~1`로 대신하면 커밋이 여러 개인 작업의 앞부분이 리뷰에서 빠진다.

## 서브에이전트의 질문

서브에이전트는 사용자에게 직접 묻지 못한다(Claude Code는 서브에이전트에서 `AskUserQuestion`을 제거한다).
실행을 계속하면서 답을 기다리는 동작은 두 호스트 모두 문서로 보장되지 않으므로 **멈추고 재개**한다.

1. 지시서 범위 안의 구현 세부는 스스로 정한다.
2. 범위 변경, 인터페이스 변경, 새 의존성, 테스트 삭제·완화, 허용되지 않은 파일 수정이 필요하면
   `NEEDS_DECISION`으로 종료한다. 질문 하나, 선택지, 추천, 근거를 함께 낸다.
3. 메인이 결정한다. 사용자만 정할 수 있는 결정이나 원격 쓰기라면 그때만 사용자에게 묻는다.
4. 메인이 같은 에이전트를 재개한다. Claude는 `SendMessage`로 재개하고 대화 기록과 모델 설정이 유지된다.
   Codex는 같은 에이전트에 후속 작업을 보낸다.
5. 실행 중 메시지는 알림으로만 쓴다. 결정을 짐작해서 진행하지 않는다.

서브에이전트 캐시는 기본 5분 TTL로 동작한다. 사용자 답을 기다리는 일이 잦으면 `subagentPromptCacheTtl`을
`1h`로 올리는 것을 검토한다.

## 수정 루프

1. 검사나 CI 실패의 원인이 분명하지 않으면 diagnostician이 먼저 원인과 증거를 보고한다. diagnostician은 파일을
   고치지 않는다. 분석과 수정을 나눠 증상만 덮는 수정을 줄이기 위해서다.
2. 같은 작업에서 구현 에이전트가 최대 2회 고친다.
3. 그래도 실패하면 [승격](#승격)을 한 칸 올려 한 번 시도한다.
4. 그래도 실패하면 메인이 직접 맡거나 막힌 지점을 보고한다.

## 리뷰

- 최종 리뷰는 항상 새 컨텍스트에서 한다. 리뷰어에게는 BASE..HEAD diff 파일(`review-package`), 수용 기준,
  계획 요약, REVIEW.md를 넘기고 판정은 넘기지 않는다.
- 정확성과 요구사항에 영향을 주는 결함만 보고하게 한다. 리뷰어는 찾으라고 하면 무언가를 찾는다. 모든 지적을
  고치면 과잉 설계가 된다.
- M2와 M3에서는 작업마다 범위가 좁은 리뷰를 추가한다.
- 단순성 관점의 리뷰는 ponytail이 설치되어 있으면 사용자가 `/ponytail-review`로 실행한다. 코드를 직접 고치는
  단순화 에이전트(pr-review-toolkit의 code-simplifier)는 쓰지 않는다.
- ponytail은 켜져 있으면 모든 서브에이전트에 자기 규칙을 주입한다(`PONYTAIL_SUBAGENT_MATCHER`로 범위를 좁힐 수 있다).
  devflow는 ponytail에 의존하지 않는다.

## 자율 실행

자율 모드로 시작했거나 M2·M3 위임 중일 때만 Stop 훅이 계속을 요청한다.

- 조건: 체크리스트에 열린 항목이 있고, 막힘을 밝히지 않았고, 원격 쓰기 확인이나 사용자 결정을 기다리는 중이 아니다.
- 같은 작업에 최대 2회. 그 뒤로는 멈추고 검토를 받는다.
- 작업 하나가 끝나면 검사, 커밋, 체크포인트를 남긴다. 필요하면 `/clear` 후 재개 카드로 다음 작업을 시작한다.

대화형 작업에서는 이 훅이 꺼져 있다.

## 모델과 effort

메인 컨트롤러의 모델과 effort는 사용자가 고른다. devflow는 메인에서 실행되는 스킬에 `effort`를 지정하지 않는다.
메인에서 effort가 바뀌면 프롬프트 캐시가 무효화되기 때문이다. effort 차이는 캐시를 따로 쓰는 서브에이전트에만 둔다.

Claude Code에서 서브에이전트의 effort는 에이전트 정의에서만 정해지고, 모델은 호출할 때 `model`로 바꿀 수 있다(호출
값이 정의보다 우선한다). 그래서 에이전트 정의는 effort 단계별로 두고 모델은 호출할 때 고른다.

| 역할 | Claude 기본 | Claude 승격 | Codex |
|---|---|---|---|
| 탐색 | `explorer` Sonnet 5.5 `low` | — | gpt-6-luna `xhigh` (지원하지 않으면 `high`) |
| 테스트·로그 요약 | `runner` Sonnet 5.5 `low` | 원인 분석은 diagnostician이 맡는다 | gpt-6-luna `xhigh` (지원하지 않으면 `high`) |
| 실패 원인 분석 | `diagnostician` Sonnet 5.5 `high` | `model: opus` → Opus 5.5 `high` | gpt-6.1-sol `high`, worker에 보고만 하도록 지시 |
| 기계적 구현 | `implementer` Sonnet 5.5 `medium` | `implementer-deep` + `model: sonnet` → Sonnet 5.5 `high` | gpt-6.1-sol `high` |
| 판단이 필요한 구현 | `implementer` + `model: opus` → Opus 5.5 `medium` | `implementer-deep` → Opus 5.5 `high` | gpt-6.1-sol `high` |
| 설계 대안, 계획 검증 | `architect` Opus 5.5 `high` | — | 메인이 수행 |
| 실행 검증 | `verifier` Sonnet 5.5 `medium` | — | worker에 보고만 하도록 지시 |
| 작업별 리뷰 | `task-reviewer` Sonnet 5.5 `high` | — | gpt-6.1-sol `high` |
| 최종 리뷰 | `reviewer` Opus 5.5 `high` | — | gpt-6.1-sol `high` |
| 보안·고위험 리뷰 | `security-reviewer` Opus 5.5 `high` | — | gpt-6.1-sol `high` |

Claude 구현 에이전트에는 `disallowedTools: Agent`와 `maxTurns`를 둔다. Sonnet은 높은 effort에서 스스로 리뷰
라운드를 돌리고 리뷰어를 띄우는 경향이 있어서, 지시서의 마지막 문단과 함께 구조적으로 막는다. 반대로 `medium`
이하의 긴 작업에서는 끝나기 전에 멈추고 확인을 구하는 경향이 있어서, 지시서에 끝까지 진행하라는 줄을 둔다.

### 승격

메인이 위임할 때 정한다. 한 작업에서 한 칸만 올리고, 올린 이유를 체크포인트에 한 줄 남긴다.

| 조건 | 판정 | 결과 |
|---|---|---|
| 같은 작업에서 2회 고쳐도 실패 | 횟수 | 승격 열로 한 칸 ([수정 루프](#수정-루프)) |
| 검사·CI 실패의 원인이 분명하지 않음 | 메인 | diagnostician. 원인을 찾지 못하면 `model: opus`로 한 번 더 |
| 작업이 여러 모듈의 interface를 바꾸거나 계획에 설계 판단이 남아 있음 | 계획 | 판단이 필요한 구현으로 분류 |
| 지시서가 모호함 | 구현 에이전트 | 승격하지 않고 `NEEDS_DECISION`으로 종료 |
| `.devflow.json`의 `highRisk` 경로를 바꿈 | 경로 | security-reviewer 실행 |
| 한 파일 안의 기계적 변경이고 `highRisk` 경로가 아님 | diff | 작업별 리뷰를 생략. 최종 리뷰가 확인한다 |

다른 역할의 effort 승격(탐색 `medium`, 통합 직전 검증 `high`, 설계·리뷰·보안 `xhigh`)은 파일럿에서 부족함이
확인되면 그 effort의 에이전트 정의를 더해서 넣는다. 승격 조건을 PreToolUse 훅(`updatedInput`)으로 강제하는 것도
그때 검토한다. Codex는 띄울 때 지시문에 모델과 effort를 적으므로, 같은 조건을 지시문으로 적용한다.

## 두 호스트

| 장치 | Claude Code | Codex |
|---|---|---|
| 구현·리뷰 에이전트 | 플러그인 `agents/` (`model`, `effort`, `tools`, `disallowedTools`, `maxTurns`, `isolation`) | 내장 explorer·worker, 띄울 때 지시문에 모델·effort 명시 |
| 질문 후 재개 | `SendMessage` | 같은 에이전트에 후속 작업 |
| 병렬 쓰기 (M3) | worktree 격리 | 사용하지 않음 |
| 대규모 변경 (M4) | 플러그인 `workflows/` | 사용하지 않음 |
| 재개 카드, 보호 경로, 자율 계속 | `hooks/hooks.json` | 같은 파일 |
