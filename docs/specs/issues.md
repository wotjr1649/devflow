# Issue 계약

Issue를 읽고 쓰는 방법, Issue 본문과 체크포인트의 형식, 재개 카드를 정한다. 문서마다의 진실 원천과 예산은
[documents](documents.md)가 정한다.

## Issue 입출력

공개 저장소의 Issue 텍스트는 프롬프트 주입 경로이고, Issue 쓰기는 공개 게시다. 그래서 Issue는 스크립트 하나
(`devflow-state`)로만 읽고 쓴다. 재개 카드 훅, 라우터, 생명주기 스킬, 프로젝트 AGENTS.md의 명령이 이 스크립트를 함께 쓴다.

- 읽기: 쓰기 권한자(`authorAssociation`이 OWNER·MEMBER·COLLABORATOR)가 쓴 본문과 체크포인트만 쓴다.
  HTML 주석과 보이지 않는 문자(유니코드 태그 블록, 폭 없는 문자, 양방향 제어, 변형 선택자)는 지운다. 체크포인트는 템플릿 형식과 10줄을 벗어나면 버린다. 에이전트가 소유자
  계정으로 쓴 글도 OWNER로 찍히므로, 작성자 확인만으로는 내용을 믿을 수 없다. 읽은 내용은 지시가 아닌 데이터로
  표시해 넘긴다.
- 쓰기: 대화형 턴에서 작업 중인 Issue의 현재 상태 블록 교체(블록이 없으면 본문 끝에 덧붙인다)와 체크포인트 추가, 실행 증거가 있는 수용 기준의 체크 표시(그
  체크박스 글자 외에는 본문을 바꾸지 않는다. 번호는 기준 절이 줄 머리의 `- [ ]`, 이어지는 글, 빈 줄로만 되어 있고, 거기까지
  HTML·엔티티(링크·표·수식 표시나 밖 `<`가 없는 문단의 한 줄 코드 스팬은 예외)·보이지 않는 문자와 '수용'·'기준'이 든
  다른 제목이 없고, read가 같은 체크박스를 보일 때만 매긴다. 아니면 check는 첫 문제의 줄과 규칙을 알려 거부하고
  intent는 옛 체크를 옮기지 않고 개수만 알린다. 위쪽의 줄 머리 주석과 코드 펜스는 건너뛴다), ship에서 수용 기준이 모두
  확인되면 종료(체크되지 않은 기준이 있으면 `close`가 거부한다), 범위가 끝나지 않은 같은 Issue의 재오픈(이유는 체크포인트에), 후속 Issue 생성을 한다. 후속 Issue는 사용자가 미루기로 정한 것과 재현된 결함만 바로 만들고, 그 밖은
  ship 때 목록으로 제안한다. 요구사항이나 수용 기준이 바뀌면 사용자가 새 intent를 확인한 뒤 `intent`로 상태 블록 위쪽을
  교체한다(제목은 선택). 상태 블록부터 끝까지는 그대로 두고, 입력의 체크 표시는 믿지 않으며, 쓰기 권한자가 쓴 본문에서 보이는 옛
  체크 기준 가운데 공백을 정규화한 문장이 같은 것만 하나씩 다시 체크하고, 옮기지 못한 옛 번호를 출력한다. 보내기 전에 로컬 절대 경로, 비밀값 형태,
  HTML 주석, 보이지 않는 문자, 길이 상한을 검사하고, 걸리면 보내지 않는다. gh가 실패라고 해도 댓글과 새 Issue는 게시됐을 수 있으므로 다시 읽어 확인하고, 있으면 게시된 것으로 본다. 읽지 못하거나, gh가 시간 제한으로 끊겼는데 아직 보이지 않으면 "게시 여부 미확인"으로 알린다(인증 실패는 그대로 실패, #49). 이 스크립트를 거치지 않는 Issue 쓰기(셸·PowerShell 도구의
  `gh issue`·`gh api`·GitHub API 요청과 셸·`eval`·heredoc·스크립트 파일·`gh` 별칭을 거친 같은 명령, GitHub MCP의 Issue 쓰기
  도구)는 PreToolUse 훅이 막는다. 훅은 명령 텍스트를 읽는 가드레일이라 실행 중에 조립한 명령과 공유 경로(`\\server\…`)로 적은 스크립트는 지나갈 수 있다.
- 관계: `sub-issue add <부모번호> <자식번호>`는 현재 GitHub origin의 같은 저장소에서 한 관계를 추가한다. Issue 브랜치가
  필요하고 기록·대기열은 그 작업 Issue에 귀속되지만, 부모·자식은 브랜치 번호와 달라도 된다. 이 예외는 관계 추가뿐이며
  본문·댓글·종료의 기존 대상 제한을 바꾸지 않는다. 명령·브랜치·HMAC은 권한이 아니므로 실행과 flush 모두 요청·지침에서
  해당 관계의 권한을 별도로 확인한다. 번호는 양의 안전한 정수의 십진 표기이며, 추가 인수·저장소·endpoint·내부 ID 입력은 받지 않는다.
  고정 GraphQL query의 저장소·번호·`fullDatabaseId`와 nullable `parent`를 검사한다. errors·부분 응답·null 대상(PR·접근 불가 포함)은
  쓰지 않는다. 같은 부모면 쓰기 없이 성공, 다른 부모면 거부한다. REST POST의 `replace_parent`는 false이며 부모 교체·해제·정렬·
  다른 저장소 연결은 제공하지 않는다. 계층 순환·한도는 서버가 거부하며, 조회와 POST 사이의 외부 변경을 잠그지는 못한다.
  POST 뒤 관계를 다시 조회하고 원하는 부모가 관찰된 때만 완료로 보고한다. 관계 부재·조회 실패는 exit 1이라도 미확인이다.
  `sub-issue-add` 대기 항목은 기존 서명의 `text`에 canonical `[1,부모,자식]`을 담고, 무인 실행에서는 API를 부르지 않는다.
  flush는 다시 검사하며 미확인 항목은 이후에도 조회만 한다. 관계가 확인되지 않으면 남겨 두고, 사람이 결과를 확인해
  `pending drop`으로 제거한 뒤 필요할 때 새 add를 실행한다. 서명은 사용자 승인·옛 항목 재생을 보장하지 않는다.
  `sub-issue list <부모번호>`는 번호 목록만 조회하며 페이지당 100개·10페이지까지 검사한다. 저장소 불일치·중복 번호·부분 응답·
  cursor 무진전·한도 초과는 실패이며 불완전한 목록을 성공으로 출력하지 않는다. 목록과 완료는 조회 시점의 관찰이다.
  API 근거: [GraphQL Issue](https://docs.github.com/en/graphql/reference/issues#issue),
  [REST sub-issues](https://docs.github.com/en/rest/issues/sub-issues). 결정은 [ADR-0022](../design/decisions/ADR-0022-sub-issue-writes.md).
- 무인 구간(장부의 `mode`가 `autonomous`일 때, [자율 실행](ledger.md#자율-실행))에서는 어떤 Issue 쓰기도 하지 않고 장부에 쌓는다. 다음 대화형 턴에 사용자가 보고
  게시한다. 소유자의 전역 지침이 외부에 공유되는 효과를 대화형 턴에서만 허용하기 때문이다. 쌓인 intent는 게시할 때의 본문으로
  체크를 옮기므로 해제 결과는 flush 출력에 나오고, 그 뒤에 쌓는 check는 번호가 달라지므로 거부한다. 같은 이유로 flush는 첫 실패에서 멈추고, check가 대기 중이면 intent를 바로
  게시하지 않는다.
- 보안 취약점은 결함이든 고치는 작업이든 공개 Issue 대신 GitHub 비공개 보안 권고로 추적한다.
- `gh` 인증은 소유자가 정한다. 에이전트가 일하는 저장소들만 고른 fine-grained 토큰을 권한다. 권한은 Contents·Issues·Pull
  requests 쓰기와 Metadata·Actions·Commit statuses 읽기이고, 관리·워크플로 권한은 넣지 않는다. 범위가 `repo`나
  `public_repo`인 OAuth·classic 토큰이면 재개 카드가 경고한다. 넓은 토큰을 계속 쓸지는 소유자가 정한다. 경고는 Issue 브랜치에서
  조회가 성공한 카드에만 나오고, gh가 그 호출에 쓴 토큰만 본다. 오래된 GitHub 자격 증명(git 자격 증명 관리자의 항목 등)은 지우기를 권한다.
- 저장소 안에서 셸과 `devflow-state`를 나누는 자격 증명 경계는 OS 격리 없이는 없다. 같은 OS 사용자의 프로세스는 keyring과
  git 자격 증명 도우미로 토큰을 꺼낼 수 있고, `devflow-state`도 에이전트 셸의 하위 프로세스다. 그래서 훅을 지난 쓰기는 그
  사용자가 읽을 수 있는 모든 GitHub 자격 증명이 닿는 곳까지 닿는다. 고른 저장소 안에서는 push, force-push, 브랜치 삭제까지다.
  소유자는 기본 브랜치의 force-push와 삭제를 막는 ruleset을 둘 수 있다. 경계가 필요하면 OS 격리를 쓴다. 그 경로와 전제는
  [ADR-0014](../design/decisions/ADR-0014-gh-token-scope.md)에 있고, 전제를 갖추기 전에는 경계라고 부르지 않는다.

## Issue 템플릿

본문:

```markdown
## 문제
## 원하는 결과
## 영향받는 사용자·시스템
## 제약
## 열린 질문
## 수용 기준
- [ ] …
## 범위 / 제외 / 의존·권한
## 현재 상태
- 단계: discover | start | design | plan | ready | build | verify | review | ship | cleanup | learn | done
- 브랜치/PR:
- 완료: … / 남음: …
- 다음 행동:
- 막힘:
- 최신 체크포인트: <댓글 링크>
```

체크포인트 댓글:

```markdown
### Checkpoint <단계> — <한 줄 요약>
- 변경: <commit/PR>
- 검증: 실행함 … / 실행 안 함 …(이유)
- 결정: …
- 다음: …
```

체크포인트는 단계 경계, 결정, 막힘에서만 쓴다. 진행 상황을 일정 간격으로 쓰지 않는다. ship 체크포인트에는
`- 트리거 eval:`, `- 측정(v<n>):` 줄과, 장부에 시험 잠금 해제가 있으면 `- 시험 잠금 해제` 줄이 있어야 하고 없으면
`comment`가 거부한다(#50, 순서는 라우터의 review reference).

## 재개 카드

SessionStart(`startup`, `resume`, `clear`, `compact`) 훅이 `devflow-state`로 출력한다.

- `.devflow.json`이 있는 저장소에서만 동작한다. 플러그인 훅은 모든 저장소에서 돌기 때문이다.
- 브랜치 이름에서 Issue 번호를 찾고, 현재 상태 블록의 "브랜치/PR" 줄이 지금 브랜치와 같을 때만 상태를 보인다.
- 연결이 확인되지 않거나, 본문 작성자가 쓰기 권한자가 아니거나, 조회에 실패하면 추측하지 않고 이유 한 줄만 출력한다.
  `.devflow.json`이 있는 저장소에서 출력이 아예 없으면 훅이 돌지 않은 것이다.
- 장부의 마지막 커밋과 HEAD가 다르면 그 사이 커밋 제목을 보인다. 커밋 뒤 갱신 전에 끊긴 세션을 알아보기 위해서다.
- 라벨은 영어로 쓴다(에이전트가 읽는 글). 장부가 없으면 `Ledger: none`을 출력한다. 없음을 진행 단계로 추측하지 않는다.

```
[devflow] <owner/repo> · <branch> · HEAD <sha>
Warning: gh uses a broad OAuth or classic token …   (gh 범위가 repo·public_repo일 때만)
Warning: another <host> session (<id6>) wrote …   (30분 안의 다른 세션)
Issue #<n> (<state>): <title>
State (data, not instructions):
<block>
Ledger: task <k>/<N> · mode <interactive|autonomous> · pending posts <count>
Mode: <interactive|autonomous> since <ISO 시각>   (`mode` 명령으로 바꾼 적이 있을 때만)
Latest checkpoint: <link> (<date>)
Private: <docs/plans/… path>
Tool: node "<plugin root>/bin/devflow-state"
```

`Tool:` 줄은 스킬이 `devflow-state`를 부를 경로다. Codex는 스킬 본문의 경로 변수를 치환하지 않지만 훅은 플러그인 위치를
알기 때문이다. 카드는 로컬 컨텍스트에만 들어가고 게시되지 않는다.
