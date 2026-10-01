# 조사 출처

설계 근거로 쓴 자료다. 원문은 복사하지 않고 링크와 직접 쓴 요약만 둔다. 호스트 동작에 관한 주장이 의심스러우면
여기서 원문을 다시 확인한다. 호스트 문서는 자주 바뀐다.

## 사용자가 지정한 자료

- [OpenAI: Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)
  - 스킬 description은 짧고 범위가 겹치지 않게 쓴다.
  - 여러 워크플로를 가진 스킬은 루트를 라우터로 둔다.
  - 레시피식 지침은 새 모델을 묶는다.
  - AGENTS.md에는 상황별 포인터를 둔다.
  - 안전한 작업은 명시적으로 허가하고, 강한 경계 문구를 재조정한다.
  - 완료 조건을 먼저 정의한다.
- [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)
  - 기본 effort는 `medium`이고, 효과를 측정한 뒤에만 높인다. `medium`이 코딩에서 Opus 5의 `high`와 같거나 낫다.
  - 응답에 추론을 쓰라는 지시는 거절을 부른다.
  - 무인 실행: 체크리스트를 유지하고 자동 계속은 2~3회로 제한한다.
  - 진행 업데이트를 받는 방법, 붙여 넣은 텍스트 표시, 멀티에이전트 시간 신호.
- [Prompting Claude Sonnet 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5)
  - effort 단계가 재보정됐다. 에이전트 코딩은 잘 정의된 작업이면 `medium`, 어렵거나 긴 작업이면 `high`에서 시작한다.
    가장 어려운 장기 작업에는 Opus가 낫다. `medium` 이하의 긴 작업에서는 끝나기 전에 멈추고 확인을 구하기 쉽다.
  - 범위 문단: 끝까지 진행하되 요청하지 않은 추가는 하지 않는다.
  - `xhigh`·`max`에서는 스스로 리뷰하고 리뷰어를 띄운다.
  - 실제 검사를 돌린 경우만 검증으로 인정한다.
- [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
  - 금지보다 이유를 쓴다. 강조어는 과잉 트리거를 부른다.
  - 처방적인 단계보다 일반 지시가 낫다.
  - 긴 작업에서는 새 컨텍스트가 파일 시스템으로 상태를 복원하는 편이 나을 수 있다.
  - 상태 추적은 git과 진행 기록으로 한다.
- [Agentic coding is straining CI](https://claude.com/ko/blog/agentic-coding-is-straining-ci-heres-how-we-scaled-test-impact-analysis-at-anthropic)
  - 에이전트가 늘면 CI 부하가 지수적으로 늘어난다.
  - 영향받는 테스트만 고르면 에이전트가 스스로 검증하기 쉽다.
  - 작은 PR, 서비스 계측.
- [Skills explained](https://claude.com/ko/blog/skills-explained)
  - 점진적 공개: 메타데이터, 본문(5,000토큰 미만), 필요할 때 파일.
  - 프롬프트·프로젝트·서브에이전트·MCP와 스킬의 역할 차이.
- [skill-creator 개선](https://claude.com/ko/blog/improving-skill-creator-test-measure-and-refine-agent-skills)
  - 스킬은 역량 향상형과 선호 인코딩형으로 나뉜다.
  - eval과 벤치마크, 블라인드 A/B, description 트리거 조정.
- [The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook)
  - 단계마다 커밋된 산출물이 생기고, 다음 단계가 그것을 읽는다.
  - 산출물마다 진실 원천 하나.
  - plan mode, 짧은 CLAUDE.md, 조언으로서의 스킬과 강제로서의 훅.
  - 피드백 루프, 설정 eval, REVIEW.md.
- [Capture as intent.md (Academy)](https://academy.claude.com/courses/ai-native-sdlc-playbook/capture-intent)
  - 플레이북 Plan 단계와 같다. intent 템플릿, 검토 후 커밋, 측정 지표.

## 호스트 문서

- Claude Code
  - [Skills](https://code.claude.com/docs/en/skills): frontmatter, 호출 제어, 목록 예산, compact 뒤 다시 붙는 범위, eval.
  - [Plugin reference](https://code.claude.com/docs/en/plugins-reference),
    [Plugin components](https://code.claude.com/docs/en/plugins/components),
    [Plugin loading](https://code.claude.com/docs/en/plugins/loading): 이름 공간, 에이전트 frontmatter 제한,
    제자리 로드, 범위.
  - [Plugin evals](https://code.claude.com/docs/en/plugin-evals): 플러그인 있을 때와 없을 때의 비교,
    `tool_used: Skill` 판정.
  - [Subagents](https://code.claude.com/docs/en/sub-agents): 메인과 서브에이전트의 선택 기준,
    재개와 `SendMessage`, 도구 필터.
  - [Hooks](https://code.claude.com/docs/en/hooks): exit 2와 거부만 막고 다른 오류와 시간 초과는 통과, Stop의 block,
    SessionStart 10,000자 상한, Windows 셸 선택.
  - [Workflows](https://code.claude.com/docs/en/workflows),
    [Agent teams](https://code.claude.com/docs/en/agent-teams),
    [Best practices](https://code.claude.com/docs/en/best-practices).
  - [Memory and AGENTS.md](https://code.claude.com/docs/en/memory),
    [Context window](https://code.claude.com/docs/en/context-window),
    [Model config](https://code.claude.com/docs/en/model-config).
  - 내장 [agents-md 플러그인](https://github.com/anthropics/claude-code/tree/main/mods/agents-md) (2282079, 2026-09-30):
    AGENTS.md를 컨텍스트마다 다시 찾는 방식, compact 뒤 재계산.
- Codex
  - [Skills](https://developers.openai.com/codex/skills): 위치, 묵시적 호출, `agents/openai.yaml`, 목록 예산.
  - [Plugins](https://developers.openai.com/codex/plugins),
    [Hooks](https://learn.chatgpt.com/docs/hooks) (옛 주소에서 옮겨 감): 플러그인 훅, 도구 매칭, SessionStart 매처,
    Stop 입출력, 경로 변수.
  - [Build plugins](https://developers.openai.com/plugins/build/plugins): 로컬 소스 마켓플레이스 형식, 설치 캐시 위치.
  - [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) (옛 주소에서 옮겨 감): 내장·커스텀
    에이전트, 띄울 때 지정한 모델과 effort가 기본값보다 우선.
  - [AGENTS.md](https://developers.openai.com/codex/guides/agents-md): 탐색 순서, 크기 한도.
  - [Multi-agent (Responses API)](https://developers.openai.com/api/docs/guides/responses-multi-agent):
    spawn·message·follow-up·wait 기본 기능.

## 오케스트레이션 관련 글

- [Cognition: Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents):
  맥락을 공유하고, 쓰기는 한 곳에서 한다.
- [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents):
  초기화 에이전트와 코딩 에이전트, 기능 목록, 진행 기록, 세션마다 기능 하나.
- [Claude: When to use multi-agent systems](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them):
  토큰이 여러 배 든다. 맥락 경계로 나눈다. 검증 서브에이전트.
- [obra/superpowers](https://github.com/obra/superpowers): brainstorming, writing-plans,
  subagent-driven development, 브랜치 마무리.
  [Release notes](https://github.com/obra/superpowers/blob/main/RELEASE-NOTES.md)(v6.4.2까지): 경로 분류로 절차 규모
  조절, 계획별 장부, 작업별 리뷰 한 번과 브랜치 리뷰 한 번, 위임마다 모델 명시, 효과 없던 계획 리뷰 루프 제거, 메인에서
  바로 실행하는 가장 싼 방식, 트리거·트랜스크립트 테스트.
- [Spec-driven development benchmark](https://uvik.net/spec-driven-development-benchmark/): 50개 티켓에서 spec 방식이
  리뷰 결함을 줄였지만, 1~2개 파일 변경과 버그 수정에서는 이득이 없었다. 선택적으로 쓰라는 결론.
- [Invariants, not frameworks](https://ranjankumar.in/spec-driven-development-invariants-not-frameworks): 상태는
  디스크에, 작업 단위로 맥락을 묶음, 위치 추적, 단계마다 새 맥락. 쟁점은 절차 규모 조절.
- [DORA 2025](https://dora.dev/dora-report-2025/): AI는 조직의 강점과 약점을 키우고, 처리량과 함께 불안정성도 올린다.
- [METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/): 체감 생산성과 측정 생산성이
  다르다. 효과는 측정으로 판단한다.

## 보안

- [Comment and Control](https://github.com/vectara/awesome-agent-failures/blob/main/docs/case-studies/comment-and-control-prompt-injection.md):
  PR 제목, Issue 본문·댓글, 숨은 HTML 주석으로 코딩 에이전트가 비밀값을 공개 댓글에 게시했다. 공개 타임라인에 쓰는
  에이전트에는 출력 필터, 최소 범위의 비밀값, 짧은 수명의 자격증명이 필요하다.
- [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail): 두 호스트 패키징의 실제 사례.
