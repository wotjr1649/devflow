# devflow 개요

devflow는 **GitHub Issue를 기억으로 삼고, 메인 에이전트 하나가 결정하고 코드를 쓰며, 서브에이전트는 읽고
검증하고, 결정적 장치(스크립트·훅·CI)가 규칙을 지키게 하는** Claude Code·Codex 공통의 개인용 개발 루프다.
저장소 하나가 두 호스트용 플러그인의 단일 원본이다.

devflow가 아닌 것: 모든 작업에 스킬을 강제하는 체계, 팀 승인 프로세스, 모델 판단을 대신하는 프레임워크.

## 원칙

1. **기억은 Issue에.** 상태는 Issue 본문의 현재 상태 블록과 체크포인트 댓글에 둔다. compact나 세션 교체 뒤에도
   재개 카드 하나로 이어 간다. 근거: [ADR-0003](decisions/ADR-0003-issue-as-state.md)
2. **결정과 쓰기는 한 곳, 판단 보조는 여러 곳.** 메인이 쓰고, 서브에이전트는 맥락 보호와 새 시각의 검증을 맡는다.
   위임은 증거가 있을 때만 넓힌다. 근거: [ADR-0005](decisions/ADR-0005-main-first-execution.md)
3. **규칙은 계층으로.** 스킬은 안내하고, 스크립트는 분석하고, 훅은 그 순간 막고, CI는 마지막에 막고, eval은
   설정 자체의 회귀를 잡는다. 근거: [ADR-0004](decisions/ADR-0004-enforcement-layers.md)
4. **짧은 지침, 측정되는 설정.** 라우터 스킬과 references, 크기 예산, 트리거율·통과율·작업당 토큰.
5. **사람은 게이트에만.** 범위가 정해지면 끝까지 진행하고, 원격 쓰기와 사용자만 정할 수 있는 결정만 묻는다.

## 계층

| 계층 | 담는 것 | Claude Code | Codex | 강제력 |
|---|---|---|---|---|
| 전역 지침 | 안전·권한 | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | 안내 |
| 프로젝트 AGENTS.md | 사실·명령·문서 지도·경계 | CLAUDE.md가 없으면 직접 로드 | 로드 | 안내 |
| 스킬 | 절차 | 플러그인 `skills/` | 같은 폴더 | 안내 |
| 에이전트 | 격리된 작업, 도구 제한 | 플러그인 `agents/` | 내장 explorer·worker | 도구 제한은 강제 |
| 훅 | 행동 시점 게이트 | `hooks/hooks.json` | 같은 파일 | 결정적 (Codex는 가드레일 수준) |
| 스크립트 | 검사·분석 | `bin/` | 스킬이 경로로 실행 | 결정적 |
| git hook·CI | 최종 관문 | 공통 | 공통 | 결정적 |
| eval | 스킬·훅·지침의 회귀 | `claude plugin eval`, skill-creator | 같은 프롬프트 세트 | 측정 |

## 산출물과 단계

| 단계 | 끝나면 남는 것 | 진실 원천 |
|---|---|---|
| start | intent와 수용 기준 | Issue 본문 |
| plan | 경로 분류(spike·bounded·architectural), 설계, 계획 | 계약 변경은 `docs/specs/`, 계획은 로컬 비공개 + PR 요약 |
| build | 커밋, 검사 결과, 체크포인트 | git, Issue 댓글 |
| review | 처리된 발견 사항 | PR 또는 체크포인트 |
| ship | 통합 방식에 따른 push·PR·머지, Issue 종료 | git, Issue |

문서 형식과 예산: [documents](../specs/documents.md). 단계 전환과 실행 모드: [orchestration](../specs/orchestration.md).

## 구성 (계획)

- **스킬**: `devflow`(라우터, 단계별 references), `workspace-cleanup`, `repo-standards`, `grilling`,
  `writing-for-agents`, `prompt-generator`. 라우터 통합 근거: [ADR-0010](decisions/ADR-0010-single-router-skill.md),
  보조 스킬 자동 호출: [ADR-0009](decisions/ADR-0009-auto-invoked-support-skills.md)
- **Claude 에이전트**: explorer, runner, implementer, implementer-deep, verifier, architect, reviewer,
  task-reviewer, security-reviewer. 모델과 effort: [orchestration](../specs/orchestration.md#모델과-effort)
- **Claude Workflows**: 대규모 기계적 변경과 감사(M4)
- **훅**: 재개 카드(SessionStart), 보호 경로 차단(PreToolUse), 자율 모드 전용 계속(Stop), 지침 파일 편집 시 감사
- **스크립트**: `devflow-doctor`(구조·문서 감사), `review-package`(BASE..HEAD diff를 파일로)
- **템플릿과 eval**: Issue intent, REVIEW.md, AGENTS.md, ignore·attributes 블록, 트리거·결과 eval

배치(저장소 루트 = 플러그인 루트): [ADR-0002](decisions/ADR-0002-repository-root-is-plugin-root.md).
두 호스트 공통 원본: [ADR-0001](decisions/ADR-0001-cross-host-single-source.md).
