# 자격 증명과 격리

`gh` 인증, 같은 OS 사용자 안의 자격 증명 경계, 그 경계를 만들기 위한 OS 격리의 전제를 정한다.
[Issue 입출력](issues.md#issue-입출력)의 공개 필터와 무인 쓰기 거부는 이 경계가 아니다.

## 인증과 자격 증명 경계

- `gh` 인증은 소유자가 정한다. 에이전트가 일하는 저장소들만 고른 fine-grained 토큰을 권한다. 권한은 Contents·Issues·Pull
  requests 쓰기와 Metadata·Actions·Commit statuses 읽기이고, 관리·워크플로 권한은 넣지 않는다. 범위가 `repo`나
  `public_repo`인 OAuth·classic 토큰이면 재개 카드가 경고한다. 넓은 토큰을 계속 쓸지는 소유자가 정한다. 경고는 Issue 브랜치에서
  조회가 성공한 카드에만 나오고, gh가 그 호출에 쓴 토큰만 본다. 오래된 GitHub 자격 증명(git 자격 증명 관리자의 항목 등)은 지우기를 권한다.
- 저장소 안에서 셸과 `devflow-state`를 나누는 자격 증명 경계는 OS 격리 없이는 없다. 같은 OS 사용자의 프로세스는 keyring과
  git 자격 증명 도우미로 토큰을 꺼낼 수 있고, `devflow-state`도 에이전트 셸의 하위 프로세스다. 그래서 직접 실행한 쓰기는 그
  사용자가 읽을 수 있는 모든 GitHub 자격 증명이 닿는 곳까지 닿는다. 고른 저장소 안에서는 push, force-push, 브랜치 삭제까지다.
  소유자는 기본 브랜치의 force-push와 삭제를 막는 ruleset을 둘 수 있다. 경계가 필요하면 [OS 격리의 전제](#os-격리의-전제)를 따른다.

## OS 격리의 전제

OS 격리로 에이전트 셸과 Issue 쓰기의 자격 증명을 나누려면 다음 경로와 전제를 함께 충족해야 한다.
Claude Code sandbox는 지원 환경(macOS, Linux, WSL2)에서 `api.github.com`을 허용하지 않고 `devflow-state`만 sandbox 밖에서 돌린다.
Codex는 네트워크 없는 sandbox에서 돌리고 `devflow-state`를 승인으로 실행한다. 호스트 지원과 관찰 범위는
[host-facts](../research/host-facts.md)를 따른다. 이 절은 격리 구현이나 실제 호스트 검증을 완료했다는 뜻이 아니다.

스크립트 위치만으로는 경계가 되지 않는다. sandbox 밖에서 실행해도 `devflow-state`는 작업 저장소의 상태를 사용한다.
쓰기 대상은 `.git/config`의 origin과 현재 브랜치의 Issue 번호, 무인 판단은 장부의 `mode`, git 실행은 `.git/config` 전체와 cwd의
영향을 받는다. sandbox가 이 값을 바꿀 수 있으면 외부 실행기도 그 입력을 신뢰할 수 없다.

경계로 쓰려면 다음을 sandbox 밖에서 정한다.

- 스크립트와 실행 환경을 sandbox가 쓸 수 없는 곳에 둔다.
- 대상 저장소를 sandbox 밖 설정으로 고정한다.
- git과 gh를 절대 경로로 부른다.
- 무인 여부의 판단을 작업 폴더 밖에서 한다. 작업 폴더에서 바꿀 수 있는 장부의 `mode`만으로 외부 실행의 게시 허용을 정하지 않는다.
- 쓸 Issue 번호를 sandbox 밖에서 고정한다. 그러지 않으면 고정한 저장소 안에서 어느 Issue에 쓰는지는 sandbox 쪽이 정한다.

이 전제를 갖추기 전에는 이 실행 경로를 자격 증명 경계라고 부르지 않는다. 자율 모드의 모든 Issue 쓰기 거부와
다음 대화형 턴의 내용 확인은 [Issue 입출력](issues.md#issue-입출력)대로 유지하며, 게시할 내용은 장부 notes에 남긴다.
