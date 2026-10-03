# ADR-0014: Issue 쓰기의 자격 증명 경계는 두지 않고, 토큰 범위를 좁히기를 권하며 넓은 토큰을 경고한다

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

- 에이전트가 일하는 저장소들만 고른 fine-grained 토큰을 권한다. 권한은 Contents·Issues·Pull requests 쓰기, Metadata·Actions·
  Commit statuses 읽기다. 발급과 설치, 오래된 자격 증명 정리는 소유자가 정한다.
- 이 기기의 소유자는 지금 OAuth 토큰(`repo` 등)을 유지한다(2026-10-02). fine-grained 토큰은 저장소를 고르는 대신 다른
  저장소와 조직 저장소의 gh 작업을 막고 90일마다 갱신해야 하기 때문이다. 토큰 값이 저장소, Issue, 작업 파일, 세션 기록에 없음은
  확인했다.
- 재개 카드는 gh 응답 헤더 `X-Oauth-Scopes`에 `repo`나 `public_repo`가 있으면 경고한다.
- 경계가 없는 이유와 남는 위험은 [issues](../../specs/issues.md#issue-입출력)에 두고, OS 격리 경로와 전제는 아래
  "OS 격리를 쓸 때"에 둔다.

## 결과

- 이 기기에서 훅을 지난 쓰기는 지금 토큰이 닿는 곳, 곧 계정의 모든 저장소까지 닿는다. 카드는 Issue 브랜치에서
  조회가 성공할 때마다 이를 알린다. 경고는 gh가 그 호출에 쓴 토큰만 보므로, `GH_TOKEN`으로 덮인 keyring 토큰이나 git 자격
  증명 관리자의 항목은 잡지 못한다.
- fine-grained 토큰으로 바꾸고 다른 GitHub 자격 증명(git 자격 증명 관리자의 항목 등)을 지우면 고른 저장소까지만 닿는다. 고른 저장소 안에서는 Issue 쓰기, push, force-push, 브랜치 삭제가
  여전히 가능하다. 기본 브랜치 ruleset은 소유자가 고른다. 토큰 만료와 갱신, 고르지 않은 저장소와 조직 저장소에 닿지 않는 것,
  워크플로 파일 push 실패(Workflows 권한 없음)가 따라온다.

## OS 격리를 쓸 때

- Claude Code sandbox(macOS, Linux, WSL2): `api.github.com`을 허용하지 않고 `devflow-state`만 sandbox 밖에서 돌린다.
- Codex: 네트워크 없는 sandbox에서 돌리고 `devflow-state`를 승인으로 실행한다.
- 전제: 스크립트 위치만으로는 경계가 되지 않는다. sandbox 밖에서 도는 `devflow-state`는 sandbox가 쓸 수 있는 작업 저장소의
  상태를 믿는다.
  - 쓰기 대상: `.git/config`의 origin, 그리고 쓸 Issue 번호를 정하는 지금 브랜치 이름
  - 무인 판단과 게시 대기: 장부의 `mode`와 `pendingPosts`
  - git 실행: `.git/config` 전체와 cwd
- 경계로 쓰려면 다음을 sandbox 밖에서 정해야 한다.
  - 스크립트와 그 환경을 sandbox가 쓸 수 없는 곳(플러그인 캐시 등)에 둔다.
  - 대상 저장소를 sandbox 밖 설정으로 고정한다.
  - git과 gh를 절대 경로로 부른다.
  - 무인 판단과 게시 대기를 작업 폴더 밖에서 한다.
  - 쓸 Issue 번호를 sandbox 밖에서 고정한다. 그러지 않으면 고정한 저장소 안에서 어느 Issue에 쓰는지는 sandbox 쪽이 정한다.
- 이것을 갖추기 전에는 이 경로를 경계라고 부르지 않는다.

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
