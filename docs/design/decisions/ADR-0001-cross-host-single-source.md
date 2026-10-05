# ADR-0001: Claude·Codex 공통 단일 원본

상태: 채택 (사용자 결정)

개정(#51): Claude 전용 frontmatter가 Codex 목록 로드를 막지 않는 것은 2026-10-01 관찰로 확인했다.
각 필드의 실행 의미까지 보장한 관찰은 아니다([host-facts](../../research/host-facts.md#codex)).

## 맥락

사용자는 같은 프로젝트들에서 Claude Code와 Codex를 함께 쓴다. 두 호스트는 같은 SKILL.md 형식(Agent Skills
표준)을 읽고, 둘 다 플러그인과 훅을 지원한다. 개인 스킬이 `~/.claude/skills`와 `~/.agents/skills`에 사본으로
따로 있어서 한쪽만 고치면 어긋난다.

## 결정

- 이 저장소 하나가 두 호스트용 플러그인의 단일 원본이다.
- 스킬은 공유한다. 호스트 전용 부분은 나란히 둔다. Claude는 `agents/`와 `workflows/`, Codex는 스킬별
  `agents/openai.yaml`(표시와 호출 정책)이다. `workflows/`는 배포하지 않기로 했다([ADR-0015](ADR-0015-paper-features.md)).
- 훅은 Node로 작성한 `hooks/hooks.json` 하나를 두 호스트가 함께 쓴다. Codex는 셸을 `Bash`, `apply_patch`를
  `Edit`·`Write`로 매칭하고, 차단 출력(`permissionDecision: deny`) 형식도 같다.

## 결과

- Codex 플러그인은 에이전트를 배포하지 못한다. 그래서 Codex는 내장 explorer·worker를 쓴다([ADR-0005](ADR-0005-main-first-execution.md)).
- Claude 전용 frontmatter를 Codex가 무시하는지는 문서에 없다. 파일럿에서 확인한다.
- 스킬을 옮긴 뒤 개인 사본은 지운다. 지우지 않으면 같은 스킬이 두 번 노출된다.

## 검토한 대안

- 호스트별 저장소: 내용이 어긋난다.
- 플러그인 없이 스킬만 배포: 훅과 에이전트를 배포할 수 없다.
