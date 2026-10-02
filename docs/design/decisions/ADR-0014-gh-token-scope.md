# ADR-0014: Issue 쓰기의 자격 증명 경계 대신 gh 토큰 범위를 좁힌다

상태: 채택 (사용자 결정, #3)

## 맥락

- Issue 쓰기는 `devflow-state`만 거쳐야 한다. 이를 지키게 하는 PreToolUse 훅은 명령 텍스트를 읽으므로, 실행 중에 조립한
  명령은 지나간다(#1 최종 리뷰에서 재현).
- #3은 에이전트 셸의 gh로는 Issue를 쓸 수 없고 `devflow-state`만 쓰게 하려 했다. discover에서 다음을 확인했다.
  - gh 토큰은 OS keyring에 있다. keyring은 `GH_CONFIG_DIR`마다 나뉘지 않는다.
  - git push는 gh 자격 증명 도우미로 같은 토큰을 쓴다. 이 기기에는 git 자격 증명 관리자의 다른 GitHub 항목도 있었다.
  - `devflow-state`는 에이전트 셸의 하위 프로세스다.
  - Claude Code sandbox는 네이티브 Windows를 지원하지 않는다. 이 기기의 Codex는 sandbox 없이 돈다.
- 그래서 같은 OS 사용자의 프로세스 사이에는 자격 증명 경계가 없다.
- 이 기기의 토큰은 `repo` 범위의 OAuth 토큰이었다. 우회가 일어나면 계정의 모든 저장소에 닿는다.

## 결정

- 에이전트가 일하는 저장소들만 고른 fine-grained 토큰을 쓴다. 권한은 Contents·Issues·Pull requests 쓰기, Metadata·Actions·
  Commit statuses 읽기다. 소유자가 발급하고 설치한다. 오래된 GitHub 자격 증명은 지운다.
- 재개 카드는 gh 응답 헤더 `X-Oauth-Scopes`에 `repo`나 `public_repo`가 있으면 경고한다.
- 경계가 없는 이유, 남는 위험, OS 격리를 쓸 때의 경로는 [documents](../../specs/documents.md#issue-입출력)에 둔다.

## 결과

- 훅을 지난 쓰기는 고른 저장소까지만 닿는다. 고른 저장소 안에서는 Issue 쓰기, push, force-push, 브랜치 삭제가 여전히 가능하다.
  기본 브랜치 ruleset은 소유자가 고른다.
- 토큰 만료와 갱신은 소유자의 일이다. 고르지 않은 저장소와 조직 저장소는 이 토큰으로 닿지 않는다.
- 워크플로 파일을 바꾸는 push는 실패한다(Workflows 권한 없음).

## 다시 볼 조건

- 작업 환경을 WSL2, macOS, Linux로 옮겨 Claude Code sandbox를 쓸 수 있을 때
- Codex를 네트워크 없는 sandbox와 승인 흐름으로 운영할 때
- 호스트가 셸 도구와 특정 스크립트에 다른 자격 증명을 주는 공식 수단을 낼 때

## 검토한 대안

- **OS 격리**: Claude sandbox에서 `api.github.com`을 막고 `devflow-state`만 밖에서 돌린다. Codex는 네트워크 없는 sandbox와
  승인으로 돈다.
  - 장점: 실제 경계가 생긴다.
  - 기각 이유: 이 기기(네이티브 Windows)에서는 Claude sandbox가 없다. 밖에서 도는 스크립트가 작업 폴더 안에 있으면 그 스크립트
    자체가 우회 통로가 된다. 작업 환경과 승인 흐름이 크게 바뀐다.
- **저장소별 `GH_CONFIG_DIR`·`GH_TOKEN`**
  - 기각 이유: keyring에 넓은 토큰이 남아 있으면 우회할 수 있다. 위험 범위가 줄지 않는다.
- **에이전트 셸의 `GH_TOKEN`을 틀린 값으로 덮기**
  - 기각 이유: 이 기기의 git push도 gh로 인증하므로 push가 깨진다. 에이전트가 되돌릴 수 있다.
- **devflow만 고른 토큰**
  - 기각 이유: 기기의 gh 토큰은 하나라서, 다른 에이전트 프로젝트의 gh 작업이 깨진다.
- **기록만 하기**
  - 기각 이유: 우회가 계정의 모든 저장소에 닿는 위험이 그대로 남는다.
