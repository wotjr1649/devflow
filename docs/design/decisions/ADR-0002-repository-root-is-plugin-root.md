# ADR-0002: 저장소 루트를 플러그인 루트로

상태: 채택 (사용자 결정). 로컬 배포 방식은 [ADR-0020](ADR-0020-publisher-marketplace-releases.md)으로 대체됨.

## 맥락

플러그인은 하나뿐이다. ponytail이 저장소 루트에 `.claude-plugin`, `.codex-plugin`, `.agents/plugins`를 함께
두는 구조로 두 호스트에서 실제로 동작한다. Claude 마켓플레이스 항목은 마켓플레이스 루트(`./`)를 플러그인 소스로
가리킬 수 있다.

## 결정

저장소 루트가 곧 플러그인 루트다.

- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`(소스 `./`)
- `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`
- `skills/`, `agents/`, `hooks/`, `bin/`, `workflows/`, `evals/` (`workflows/`는 [ADR-0015](ADR-0015-paper-features.md)에서 배포하지 않기로 했고, M4는 [ADR-0017](ADR-0017-drop-m4-defer-route.md)에서 실행 모드에서 뺐다)

## 결과

- 개정(#51): Claude Code는 로컬 플러그인을 제자리에서 로드하고 Codex는 캐시로 복사한다.
  설치는 작업 트리가 아닌 별도 배포 worktree(`main`의 한 커밋, 태그 없음)에서 하고, 설치본 갱신은 소유자 지시로 한다.
  Claude에서는 작업 중 편집이 다른 세션에 즉시 적용되는 것을 피하고, Codex에서는 ignore된 비공개 폴더까지 캐시로
  복사되는 것을 피한다([host-facts](../../research/host-facts.md)). 배포 worktree에는 비공개 작업을 두지 않는다.
  Claude에서 세션 하나만 시험할 때는 `--plugin-dir`을 쓴다.
- 개정(#56): 위 로컬 배포는 개발·시험 경로로 남기고 catalog 이름을 `devflow-local`로 바꾼다. 기본 배포는
  제작자 공통 원격 marketplace에서 릴리스 태그를 설치한다([ADR-0020](ADR-0020-publisher-marketplace-releases.md)).
- docs와 evals도 플러그인에 함께 포함된다. 개인용이라 감수한다.

## 다시 볼 조건

플러그인 크기나 불필요한 파일이 문제가 되거나 플러그인이 둘이 되면 `plugins/<name>/` 아래로 옮긴다.

## 검토한 대안

- 루트는 마켓플레이스, 플러그인은 `plugins/devflow/`: 산출물은 깔끔하지만 경로가 한 단계 깊어지고 지금은 얻는 것이 없다.
