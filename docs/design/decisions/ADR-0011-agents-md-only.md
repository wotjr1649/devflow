# ADR-0011: 프로젝트 지침 파일은 AGENTS.md 하나다

상태: 채택 (사용자 결정)

개정(#51): 아래 compact 재주입의 불확실성은 해소됐다. 내장 `agents-md` 플러그인이 컨텍스트를 만들 때마다
상위 AGENTS.md를 다시 로드한다. 하위 파일의 로드 조건은 [host-facts](../../research/host-facts.md)가 구분한다.

## 맥락

- Claude Code는 2.1.277부터 CLAUDE.md가 없으면 AGENTS.md를 직접 읽는다. Codex는 처음부터 AGENTS.md를 읽는다.
- compact 뒤 다시 주입되는 것으로 문서에 적힌 것은 프로젝트 루트 CLAUDE.md뿐이다. 직접 읽은 AGENTS.md가 다시
  주입되는지는 문서에 없다.
- `@AGENTS.md` 한 줄만 담은 CLAUDE.md를 두는 대안을 검토했다. 공식 문서도 지원하는 방식이다. 하지만 비용이 있다.
  - `/init`이나 CLAUDE.md 관리 스킬이 그 파일에 Claude 전용 내용을 쌓아, 두 호스트의 지침이 어긋날 수 있다.
  - 하위 폴더에서 실행하면 외부 import 승인 창이 뜰 수 있다.
  - 다시 주입된다면 이 파일의 이득은 거의 없다.

## 결정

CLAUDE.md는 두지 않고 AGENTS.md 하나만 쓴다.

## 결과

- AGENTS.md의 Gotcha가 CLAUDE.md, `.claude/CLAUDE.md`, `CLAUDE.local.md`를 만들지 말라고 경고한다.
- compact 뒤 AGENTS.md가 다시 주입되는지는 계속 확인한다. 다시 주입되지 않으면 compact 매처가 있는 SessionStart
  재개 카드가 AGENTS.md를 다시 가리키게 한다.

## 검토한 대안

`@AGENTS.md` 한 줄짜리 CLAUDE.md: compact 동작이 문서로 보장되지만, 위의 비용이 든다.
