# devflow 개요

devflow는 **GitHub Issue를 기억으로 삼고, 메인 에이전트 하나가 결정하고 코드를 쓰며, 서브에이전트는 읽고
검증하고, 리뷰와 CI가 결과를 확인하는** Claude Code·Codex 공통의 개인용 개발 루프다.
저장소 하나가 두 호스트용 플러그인의 단일 원본이다.

devflow가 아닌 것: 모든 작업에 스킬을 강제하는 체계, 팀 승인 프로세스, 모델 판단을 대신하는 프레임워크.

## 원칙

1. **기억은 Issue에.** 상태는 Issue 본문의 현재 상태 블록과 체크포인트 댓글에 두고, 작업 단위의 진행은 로컬 장부에
   둔다. compact나 세션 교체 뒤에도 재개 카드 하나로 이어 간다. 근거: [상태와 재개](current-decisions.md#상태와-재개)
2. **결정과 쓰기는 한 곳, 판단 보조는 여러 곳.** 메인이 쓰고, 서브에이전트는 맥락 보호와 새 시각의 검증을 맡는다.
   위임은 증거가 있을 때만 넓힌다. 근거: [실행과 위임](current-decisions.md#실행과-위임)
3. **지침과 리뷰로 일하고, 막는 장치는 두지 않는다.** 스킬은 안내하고, 훅은 재개와 세션만 다루고, 리뷰가 결함과 시험
   변경을 보고, CI는 테스트로 마지막에 막는다. 근거: [지침과 보호](current-decisions.md#지침과-보호)
4. **짧은 지침.** 라우터 스킬과 references, 크기 예산. 트리거 eval은 호출 필드가 바뀔 때 선택해서 돌린다
   ([eval](../specs/eval.md)).
5. **사람은 게이트에만.** 범위가 정해지면 끝까지 진행하고, 기존 사용자 권한에 포함되지 않는 효과와 사용자만 정할
   결정만 묻는다.

## 계층

| 계층 | 담는 것 | Claude Code | Codex | 강제력 |
|---|---|---|---|---|
| 전역 지침 | 안전·권한 | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | 안내 |
| 프로젝트 AGENTS.md | 사실·명령·문서 지도·경계 | CLAUDE.md가 없으면 직접 로드 | 로드 | 안내 |
| 스킬 | 절차 | 플러그인 `skills/` | 같은 폴더 | 안내 |
| 에이전트 | 격리된 작업, 도구 제한 | 플러그인 `agents/` | 내장 explorer·worker | Claude reviewer는 읽기 도구만 제공. 셸 도구가 있는 보고 역할과 Codex의 보고 전용은 지시이며 파일 시스템 격리가 아니다 |
| 훅 | 재개와 세션 | `hooks/hooks.json` | `hooks/hooks.json` | 막지 않는다. 재개 카드, 자율 계속, 세션 해제만 |
| 스크립트 | 장부·Issue 입출력·재개 카드 | `bin/devflow-state` | 스킬이 경로로 실행 | 공개 텍스트 필터. 거치지 않는 게시는 막지 않는다 |
| git hook·CI | 최종 관문 | 공통 | 공통 | 결정적 |
| eval | 스킬 호출의 회귀(선택) | `claude plugin eval`, skill-creator | 실행기 없음 | 측정 |

## 단계

구상 → 착수 → 설계 → 계획 → 구현 → 검증 → 리뷰 → 통합 → 정리 → 회고, 10단계다.

- 경로(spike, bounded, architectural)에 따라 일부만 돈다.
- 계획의 작업마다 구현·검증·리뷰를 반복한다.
- 새 정보가 생기면 정해진 단계로 돌아간다.

단계, 반복, 되돌아가기: [lifecycle](../specs/lifecycle.md). 실행 방식: [orchestration](../specs/orchestration.md).
문서 형식과 예산: [documents](../specs/documents.md).

## 구성

- **스킬 7개**
  - `devflow`: 라우터. 담당 스킬이 없는 단계는 플러그인 루트의 [`references/`](../../references/)에 둔다. 여러 스킬이 함께 읽는 이유는 [진입점과 단계](current-decisions.md#진입점과-단계)에 있다.
  - 생명주기 스킬: `development-start`, `pr-review-workflow`, `workspace-cleanup`
  - 보조 스킬: `grilling`, `writing-for-agents`, `prompt-generator`
  - 선택과 이유: [진입점과 단계](current-decisions.md#진입점과-단계).
- **Claude 에이전트**: 도구로 나눈 정의 3개(explorer, reviewer, implementer). 역할의 관점(탐색, 요약, 원인 분석, 검증,
  설계, 보안)은 지시서가 정한다. 모델, effort, 승격: [orchestration](../specs/orchestration.md#모델과-effort)
- **Claude Workflows**: devflow는 배포하지 않고 실행 모드로도 두지 않는다. 사용자가 devflow 밖에서 직접 실행한다
  ([실행 모드](../specs/orchestration.md#실행-모드))
- **훅**: 재개 카드(SessionStart), 자율 모드 전용 계속(Stop), 세션이 끝날 때 해제(SessionEnd, 돌지 않으면 30분 만료).
  통합 전 검증은 [repository](../specs/repository.md#통합과-ci)의 통합 방식을 따른다.
- **스크립트**: `devflow-state`는 장부·Issue 입출력·재개 카드를 맡는다. 리뷰에 넘기는 BASE..HEAD diff 파일(`review-package`)은 pr-review-workflow의 review reference가 `git diff`로 만든다.
- **템플릿과 eval**: Issue intent, REVIEW.md, AGENTS.md, ignore·attributes 블록, 트리거 eval

배치와 공통 원본의 이유: [공통 원본](current-decisions.md#공통-원본).
