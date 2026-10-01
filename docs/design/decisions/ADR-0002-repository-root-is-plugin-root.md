# ADR-0002: 저장소 루트를 플러그인 루트로

상태: 채택 (사용자 결정)

## 맥락

플러그인은 하나뿐이다. ponytail이 저장소 루트에 `.claude-plugin`, `.codex-plugin`, `.agents/plugins`를 함께
두는 구조로 두 호스트에서 실제로 동작한다. Claude 마켓플레이스 항목은 마켓플레이스 루트(`./`)를 플러그인 소스로
가리킬 수 있다.

## 결정

저장소 루트가 곧 플러그인 루트다.

- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`(소스 `./`)
- `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`
- `skills/`, `agents/`, `hooks/`, `bin/`, `workflows/`, `evals/`

## 결과

- 로컬 디렉터리 마켓플레이스는 플러그인을 제자리에서 로드한다. 그래서 설치는 작업 트리가 아닌 별도 배포
  worktree(`main`의 한 커밋, 태그 없음)에서 하고, 설치본 갱신은 소유자 지시로 한다(사용자 결정). 작업 트리를
  설치하면 작업 중인 브랜치가 그 기기의 모든 세션에 적용되고, 훅과 스킬 편집이 호스트가 로드한 플러그인을 바꾸는
  일이 되기 때문이다. 세션 하나에서만 시험할 때는 `--plugin-dir`을 쓴다.
- docs와 evals도 플러그인에 함께 포함된다. 개인용이라 감수한다.

## 다시 볼 조건

플러그인 크기나 불필요한 파일이 문제가 되거나 플러그인이 둘이 되면 `plugins/<name>/` 아래로 옮긴다.

## 검토한 대안

- 루트는 마켓플레이스, 플러그인은 `plugins/devflow/`: 산출물은 깔끔하지만 경로가 한 단계 깊어지고 지금은 얻는 것이 없다.
