# 저장소 계약

devflow가 프로젝트에 설치하고 `devflow-doctor`가 검사하는 구조, ignore·attributes 블록, AGENTS.md 형식,
기계용 프로필을 정한다.

## 폴더

```
<repo>/
├── AGENTS.md          사실·명령·문서 지도·경계
├── .devflow.json      기계용 프로필
├── REVIEW.md          리뷰 패스 정의 (선택)
├── .githooks/pre-push 공개 전 관문 (local-merge 저장소)
├── .github/ISSUE_TEMPLATE/intent.md
├── docs/
│   ├── specs/                 제품 계약 (추적)
│   ├── design/decisions/      결정 기록 (추적)
│   ├── prompts/  plans/       비공개 (ignore)
├── artifacts/                 근거·handoff (ignore)
├── .work/                     임시·대용량 (ignore)
└── _ref/                      읽기 전용 참조 (ignore)
```

AGENTS.md를 비공개로 운영하는 프로젝트는 AGENTS.md를 ignore에 추가하고, 그 사실을 `.devflow.json`에 적는다.

### Issue 폴더

Issue 폴더(`.work/devflow/i<issue>/`: 장부, 차단 기록, 세션 기록, 잠금)는 주 작업 트리에 둔다(#14). worktree를 지워도
남고, 어느 worktree의 세션이든 같은 장부와 잠금을 쓰게 하기 위해서다.

- 주 작업 트리는 git 기록으로 정한다. 지금 작업 트리가 연결된 worktree이고, 그 gitdir이 저장소 `.git/worktrees/` 바로
  아래에 있으며, 거기의 되돌림 링크(`gitdir` 파일)가 이 worktree의 `.git`을 가리키면 그 `.git`의 부모가 주 작업 트리다.
  그 밖(주 작업 트리 자신, separate git dir나 bare 배치, 확인되지 않는 worktree)은 지금 작업 트리에 둔다.
  `devflow-state`, 훅, `devflow-metrics`가 같은 판정을 쓴다. 압축 파일에 든 `.git` 파일은 남의 저장소 `worktrees` 폴더에
  쓸 수 없으므로, 이 판정으로 남의 저장소를 가리킬 수 없다. 훅은 파일 시스템에 묻기 전에 경로 문자열부터 확인한다.
- Issue 브랜치가 아닌 worktree(M3 작업 worktree)는 장부 명령에서 주 작업 트리 브랜치의 Issue로 본다. Issue 쓰기는 그
  브랜치 자신의 Issue만 받는다.
- worktree에만 옛 Issue 폴더가 있으면 재개 카드가 옮기라고 경고하고, 옮길 때까지 그 Issue의 장부와 Issue 쓰기를 거부한다.

## .gitignore 관리 블록

`devflow-doctor`는 표시 사이의 내용만 비교하고 고치지 않는다. 블록 밖은 프로젝트 소유다.

```gitignore
# >>> devflow (managed)
/docs/prompts/
/docs/plans/
/artifacts/
/.work/
/_ref/
/.claude/worktrees/
/.claude/settings.local.json
CLAUDE.local.md
# <<< devflow
```

비공개 경로가 이미 git에 추적되고 있으면 블록이 있어도 막지 못한다. doctor는 `git ls-files`로 이 경우를 찾아
실패로 보고한다.

## .gitattributes 기본값

```gitattributes
* text=auto eol=lf
*.cmd text eol=crlf
*.bat text eol=crlf
*.png binary
*.zip binary
```

- Windows의 `core.autocrlf=true`가 있어도 저장소 안에서는 LF로 맞춘다. 훅 스크립트와 shebang이 이에 의존한다.
- gitattributes는 `{a,b}` 확장을 지원하지 않는다. 확장자마다 한 줄씩 쓴다.
- 생성물은 프로젝트별로 `linguist-generated -diff`를 붙인다. 리뷰 화면에서 구분되고, 에이전트의 `git diff` 출력이
  줄어든다.
- 릴리스 아카이브에서 빼려면 `export-ignore`를 붙인다. 디렉터리는 `/dir/** export-ignore` 형식으로 쓴다.

## 프로젝트 AGENTS.md 형식

```markdown
# <프로젝트> — 무엇이고 무엇이 아닌지 1~2문장

## Read what your task touches
| When you are… | Read |

## Commands
- 빌드·테스트 명령과 정상 출력 예시. 경로별 검사는 .devflow.json의 checks

## Boundaries
- 묻지 않고: 로컬 빌드·테스트, 자기 변경으로 생긴 실패 수정과 재실행, 작업 브랜치 커밋
- 지시가 있을 때만: push·태그·릴리스, 과금 스위치, <프로젝트별>
- 읽기 전용: <경로>

## Gotchas
```

- 에이전트가 읽는 글이라 영어로 쓴다([documents](documents.md#에이전트가-읽는-글)). doctor는 `## Commands`와
  `## Boundaries`를 필수 절로 본다.

- 한 페이지를 넘기지 않는다. 사용자 전역 지침의 내용은 다시 적지 않는다.
- **권한 문장은 AGENTS.md에 둔다.** 예: "이 저장소 Issue의 현재 상태 블록과 체크포인트는 묻지 않고 갱신한다."
  호스트가 로드하는 지침만 권한의 근거가 되고, `.devflow.json` 같은 일반 파일은 데이터로 취급되기 때문이다.

## REVIEW.md 형식

최종 리뷰어가 읽는다. 프로젝트마다 고쳐 쓴다.

```markdown
# Review instructions

## Passes
Run these passes and tag each finding with its pass:
- Bugs: logic errors, broken edge cases, regressions
- Security: injection, authentication gaps, secrets or personal data in logs
- Compliance: the change matches the Issue's acceptance criteria, the plan summary and docs/specs

## What Important means here
Important: breaks behavior, leaks data, or breaches a spec. Style and naming are nits.

## Nits
Report at most five; summarize the rest as a count.

## Do not report
Generated files and anything CI already enforces.
```

## .devflow.json

doctor와 훅이 읽는 기계용 값만 담는다. 권한은 담지 않는다. 이 파일이 있는 저장소에서만 재개 카드와 Issue 훅이
동작한다.

```json
{
  "integration": "pr-ci",
  "branch": "{type}/{issue}-{slug}",
  "private": ["docs/prompts/", "docs/plans/", "artifacts/", ".work/", "_ref/"],
  "protected": ["_ref/**"],
  "highRisk": ["<인증·권한·암호·훅·의존성 경로>"],
  "checks": { "src/**": "<명령>", "**/*.md": "<명령>" },
  "verify": "<한 줄 전체 검사 명령>"
}
```

훅은 입력을 이벤트 루프의 스트림으로 최대 3초 동안 읽고, 끝나지 않으면 받은 부분이 다른 이벤트를 밝히거나, 도구 입력 앞의 최상위 `cwd`가 `.devflow.json` 없는 로컬 폴더가 아닌 한 거부한다(가드는 닫힌 쪽으로 실패한다)(#37:
macOS에서 동기식 표준 입력 읽기가 가끔 끝나지 않았다). PreToolUse 분석은 별도 프로세스에서 최대 5초로 제한하고, 기한 초과나 분석기 실패는 거부한다. `.devflow.json` 없는 로컬 폴더에서는 분석을 띄우지 않고 허용한다(#52). 이 확인은 분석 프로세스 밖에서 하므로, 드라이브나 경로로 연결한 공유가 멈추면 호스트 제한 시간까지 기다리고 호스트가 도구 호출을 통과시킬 수 있다(공유 경로로 적힌 폴더는 분석 프로세스로 넘긴다, 소유자 결정). 실패 기록도 최대 3초로
제한하여 기록 장애가 거부 응답을 막지 않는다(부하가 큰 기기에서 기록 프로세스 시작에만 1초를 넘겼다, #53). 프로필은 로컬 일반 파일에서 최대 256 KiB만 읽고, 링크·특수 파일·크기
초과·잘못된 JSON 구조는 읽을 수 없는 프로필로 처리한다. 이때 셸과 편집 도구 모두 `.devflow.json` 복구만 허용하며,
일반 읽기는 허용한다. 읽는 동안 파일이 교체되거나 커져도 종류·동일 파일·읽기 크기 검사를 우회하지 못해야 한다.
셸 명령에서 경로로 쓰는 단어(쓰기 대상, 리다이렉트, 실행할 스크립트)는 Bash 해석과, 따옴표를 떼고 백슬래시를 구분자로
본 해석(PowerShell·cmd) 둘 다로 판정한다. 어느 셸이 돌릴지 훅은 모르기 때문이다(#48). 쓰기 대상은 그 명령이 돌 수 있는 모든 폴더에서 판정한다. 셸이 직접 돌린
`cd <폴더>`(파이프라인·`||` 뒤·cmd가 아니고, 절대 경로나 `./`·`../`로 시작하는 고정 경로) 뒤 `&&`로 이어진 명령은 그 폴더에서만,
그 밖의 구분자 뒤에서는 그때까지 거친 모든 폴더에서 판정한다. 그래서 다른 저장소로 옮겨 가서 쓰는 명령은 이 저장소 쓰기로 보지 않는다(#53). Windows의 긴 경로·장치 접두사, UNC 접두사,
이 컴퓨터의 관리 공유(`localhost`)는 실제 경로로 정리해 비교한다. `\\server\…`나 `//server/…`로 적힌 스크립트(그렇게 적힌 링크와,
링크를 가리키는 링크의 사슬을 거친 것 포함. 사슬은 링크 8개까지 읽고 넘으면 공유로 본다, #53)는 열면 서버에 닿아 자격 증명을 내주므로 열지 않고, 그 본문은 검사하지 못한다. 공유에 연결한 드라이브 문자나
`subst` 드라이브는 로컬로 보고 연다. 철자만 비교하므로 볼륨 GUID·컴퓨터 이름 공유 같은 다른 표기, 짧은 이름,
링크를 거친 경로는 한계로 남는다.

`local-merge` 저장소는 추적되는 `.githooks/pre-push`가 작업 트리가 깨끗하고 push하는 커밋이 HEAD일 때만 `verify`를
돌리고, 실패하면 push를 막는다. ref 삭제만 하는 push에는 검사할 커밋이 없으므로 돌리지 않는다(#53). 이 관문이 통합 때의 검사 기록을 대신한다. CI가 있어도 정보용이면(devflow 저장소의
Linux·macOS 실행) 관문은 이 훅이다. 훅을 켜는 `git config core.hooksPath .githooks`는
클론마다 하고(호스트 설정이 아닌 저장소 설정이지만 훅을 켜는 일이라 소유자 지시로 한다), 훅이 꺼진 클론에서는 통합
커밋에 검사 줄을 쓴다.

`integration` 값은 `pr-ci`, `local-merge`, `push-on-request` 중 하나다. AGENTS.md를 비공개로 운영하면
`"agentsMd": "private"`을 적는다. 그러면 AGENTS.md는 필수 경로가 아니고, 추적되면 실패다. `private`는 기본 목록을 대신하는
경로 접두어 목록(저장소 안, `/`로 구분)이고, 비우면 doctor가 경고한다. 다른 저장소에 맞추는 값(#23):

- `specs`, `decisions`: 계약과 결정 기록 폴더. 기본은 `docs/specs`, `docs/design/decisions`이고, 다른 폴더(저장소 안,
  `/`로 구분, `.`·`..` 없음)를 적거나 그런 폴더를 두지 않으면 `false`를 적는다. spec 크기 예산은 `specs` 폴더를 따르고 `false`면 적용하지 않는다.
- `allowLocalPaths`: 로컬 절대 경로를 담아도 되는 파일의 glob 목록(제품이 정당하게 담은 시스템 경로). 이 파일에서도
  사용자 홈 아래 경로는 실패이고(POSIX 홈은 웹 경로와 구별하려고 이름 뒤 `/`가 있을 때만), 지침 파일(AGENTS.md,
  SKILL.md, `.claude/rules`, 에이전트 정의)에는 적용하지 않는다.

`tests`는 시험 파일의 glob 목록이다(#20). 적은 프로젝트만 수정 작업 중 시험을 잠글 수 있다. 재현 시험을 쓰고 커밋한 뒤
`devflow-state tests <n> lock`이 장부에 그 커밋을 남긴다. 잠금은 고치기 전에 시험이 실패했다는 증거를 요구한다(#50).
`lock -- <시험 명령>`은 그 명령을 셸 없이 호출한 폴더에서(훅이 경로를 해석한 곳) 돌려 실패(0이 아닌 종료 코드)를 봐야만 잠그고, 통과하거나
실행되지 않으면(Windows의 `.cmd` 실행기는 셸 없이 뜨지 않는다) 거부한다. 명령이 시험 파일을 바꿔도 거부한다. 로컬에서
건너뛰는 시험은 시험 커밋을 먼저 push해 이 저장소의 CI 실행 URL을 stdin으로 준다. 이미 잠겨 있으면 아무것도 돌리지
않는다. 증거는 `testsLocked.failing`에 남고, 훅은 `devflow-state` 뒤 첫 `--` 다음의 명령도 다른 명령처럼 검사한다. 잠기면 훅이 이 glob을 `protected`처럼 다뤄 편집 도구와 알아보는
셸 쓰기와 장부 파일·`.devflow.json` 쓰기를 막고(차단 기록 `test-locked`), doctor는 Issue 브랜치에서 그 커밋 뒤로 바뀌거나 새로 생기거나
이름이 바뀐 시험 파일과 `.devflow.json`을 실패로 낸다. 장부가 잠금을 말하면 프로필에서 `tests`를 지워도 이 검사는 남는다(#52). verify와 ship은 Issue 브랜치에서 doctor를 돌리므로 훅이 놓친 셸 편집이 거기서
드러난다(main의 pre-push와 CI에는 장부가 없어 이 검사가 없다). 커밋하지 않은 시험이 있으면 잠그지 않는다. 시험 자체가
틀렸거나, 리뷰 지적이나 다음 작업의 재현 시험을 더할 때는 `tests <n> unlock`에 이유를 주어 풀고, 시험을 커밋한 뒤 같은
방식으로 다시 잠근다. 이유는 장부 notes에 남아 ship 체크포인트로 간다. `ledger-update`는
`testsLocked`를 바꾸지 못하고 `notes`는 덧붙이기만 하며, 읽을 수 없는 장부는 잠긴 것으로 본다. 그때는 에이전트가
장부를 고칠 수 없으므로 사람이 JSON을 바로잡는다. 장부는 추적되지 않는
로컬 파일이라 훅이 못 본 셸 명령으로 지우면 doctor의 이 검사도 사라진다. 훅과 이 검사는 가드레일이다. rebase한 뒤에는 정확히 `rebase`를 이유로 풀고 stdin에 `rebase`를 주어 다시 잠근다. 그 해제만 실패 증거를 `testsFailing`에 남겨 재잠금이 이어받고, 다른 이유로 풀면 증거가 지워져 시험의 실패를 다시 보여야 한다.
적지 않으면 잠금 명령은 거부되고 훅과 doctor는 아무것도 하지 않는다.

## doctor 검사 항목

`bin/devflow-doctor [path]`가 읽기만 하고 검사한다. 실패(FAIL)가 있으면 exit 1이고, 경고(WARN)는 실패시키지 않는다.
Issue 형식은 doctor가 검사하지 않고, `devflow-state`가 쓸 때 검사한다([ADR-0015](../design/decisions/ADR-0015-paper-features.md)).

| 대상 | 검사 |
|---|---|
| 폴더 | 필수 경로(`specs`, `decisions`, `agentsMd`를 따름) |
| .gitignore | 관리 블록 내용, 비공개 경로가 추적되는지 |
| .gitattributes | 기본 줄, `git ls-files --eol` 위반, 바이너리 표시 |
| AGENTS.md | 길이, 필수 절, 링크 실존, "편집할 때마다 읽어라" 같은 고정 읽기 목록, 강조어 남용, 날짜·진행 상태 |
| git 훅 | `local-merge` 저장소에서 `core.hooksPath`가 `.githooks`를 가리키는지 |
| 지침을 끄는 파일 | `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`가 저장소나 상위 폴더에 있는지. git이 무시하는 파일도 본다 |
| 문서 | 줄바꿈(git이 LF로 저장하고 작업 트리만 CRLF면 경고), BOM, 보이지 않는 문자, 로컬 절대 경로(`allowLocalPaths`), 크기 예산, 상대 링크와 앵커 |
| 잠긴 시험 | `tests`를 잠근 Issue 브랜치에서, 잠근 커밋 뒤로 바뀌거나 새로 생긴 시험 파일 |
| 로컬 문서 | 크기 예산, 이름 규칙 |

같은 스크립트를 스킬(분석), 훅(편집 직후 알림), CI나 git pre-push 훅(실패 처리)이 함께 쓴다.
