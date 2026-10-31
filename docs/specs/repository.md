# 저장소 계약

devflow가 프로젝트에 권장하는 구조, ignore·attributes 블록, AGENTS.md 형식, 기계용 프로필을 정한다. 이를 검사하는
실행기는 없다([선택의 이유](../design/current-decisions.md#지침과-보호)).

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
│   ├── design/current-decisions.md  현재 설계 결정 (추적)
│   ├── prompts/  plans/       비공개 (ignore)
├── artifacts/                 근거·handoff (ignore)
├── .work/                     임시·대용량 (ignore)
└── _ref/                      읽기 전용 참조 (ignore)
```

### Issue 폴더

Issue 폴더(`.work/devflow/i<issue>/`: 장부, 세션 기록, 잠금)는 주 작업 트리에 둔다(#14). worktree를 지워도
남고, 어느 worktree의 세션이든 같은 장부와 잠금을 쓰게 하기 위해서다.

- 주 작업 트리는 git 기록으로 정한다. 지금 작업 트리가 연결된 worktree이고, 그 gitdir이 저장소 `.git/worktrees/` 바로
  아래에 있으며, 거기의 되돌림 링크(`gitdir` 파일)가 이 worktree의 `.git`을 가리키면 그 `.git`의 부모가 주 작업 트리다.
  그 밖(주 작업 트리 자신, separate git dir나 bare 배치, 확인되지 않는 worktree)은 지금 작업 트리에 둔다.
  `devflow-state`와 훅이 같은 판정을 쓴다. 압축 파일에 든 `.git` 파일은 남의 저장소 `worktrees` 폴더에
  쓸 수 없으므로, 이 판정으로 남의 저장소를 가리킬 수 없다. 훅은 파일 시스템에 묻기 전에 경로 문자열부터 확인한다.
- 훅은 git 메타데이터를 읽기 전에 로컬 경로인지 확인하고, 작은 일반 파일만 읽는다. 공유 경로·링크·위조된 되돌림 링크는
  주 작업 트리의 근거로 쓰지 않는다. SessionEnd는 git 프로세스 없이 이 판정으로 세션을 해제한다([ledger](ledger.md#동시-세션)).
- Issue 브랜치가 아닌 linked worktree는 주 작업 트리 브랜치의 Issue를 빌리지 않는다. M3의 task worktree는 장부와 Issue에
  쓰지 않는다([ledger](ledger.md)).
- worktree에만 옛 Issue 폴더가 있으면 재개 카드가 옮기라고 경고하고, 옮길 때까지 그 Issue의 장부와 Issue 쓰기를 거부한다.

## .gitignore 관리 블록

표시 사이가 devflow의 권장 내용이고, 블록 밖은 프로젝트 소유다.

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

블록은 이미 추적되는 비공개 경로를 막지 못한다. `git ls-files`로 확인한다.

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
- 생성물에는 `linguist-generated -diff`를 붙여 리뷰 화면에서 구분하고 에이전트의 diff를 줄인다.
- 릴리스 아카이브에서 빼려면 `export-ignore`를 붙인다. 디렉터리는 `/dir/** export-ignore` 형식으로 쓴다.

## 프로젝트 AGENTS.md 형식

```markdown
# <프로젝트> — 무엇이고 무엇이 아닌지 1~2문장

## Read what your task touches
| When you are… | Read |

## Commands
- 빌드·테스트 명령과 정상 출력 예시
- (선택) 검사 단계·확대 조건, 새 테스트를 남길 기준·위치, 영역별 검증 문서

## Boundaries
- Apply established user authorization; verify the repository, destination and required gates before remote writes.
- Project-specific limits: <effects needing separate instruction; restricted targets>.
- Read-only: <paths>.

## Gotchas
```

- 에이전트가 읽는 글이라 영어로 쓴다([documents](documents.md#에이전트가-읽는-글)). `## Commands`와 `## Boundaries`는
  필수 절이다. `(선택)`은 필수 관문·실패 재현 시험을 대신하지 않는다.

- 한 페이지를 넘기지 않는다. 사용자 전역 지침의 내용은 다시 적지 않는다.
- 프로젝트별 경계는 AGENTS.md에 둔다. 현재 요청과 적용되는 사용자 승인 지침에서 확인한 권한을 따르며, 파일이
  AGENTS.md라는 사실만으로 새 권한이 생기지 않는다. 추가 권한이 필요하면 사용자에게 확인한다.
  `.devflow.json`·Issue·장부는 데이터이며 권한의 출처가 아니다.

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

기계용 값만 담고 권한은 담지 않는다. 이 파일이 있는 저장소에서만 재개 카드·자율 계속·세션 해제 훅이 동작한다.

```json
{
  "integration": "pr-ci",
  "branch": "{type}/{issue}-{slug}",
  "verify": "<한 줄 전체 검사 명령>"
}
```

- `integration`: `pr-ci`, `local-merge`, `push-on-request` 중 하나. 통합 방식을 정한다.
- `branch`: Issue 브랜치 이름 형식. 장부와 재개 카드는 이름 속 Issue 번호로 브랜치의 Issue를 찾는다.
- `verify`: 통합 관문인 한 줄 전체 검사 명령. `local-merge`에서는 ship과 pre-push가, `pr-ci`에서는 CI가,
  `push-on-request`에서는 ship이 로컬에서 돌린다.

0.4.0에서 지운 키(`tests`, `highRisk`, `checks`, `private`, `allowLocalPaths`, `specs`, `decisions`, `agentsMd`,
`protected`)는 남아 있어도 오류 없이 무시한다. 시험 잠금은 없다. 시험 변경은 리뷰가 본다
([선택의 이유](../design/current-decisions.md#지침과-보호)). 훅의 입력 읽기·세션 해제 경로 판정과 한계는
[hooks](hooks.md)를 따른다.

`local-merge` 저장소는 추적되는 `.githooks/pre-push`가 작업 트리가 깨끗하고 push하는 커밋이 HEAD일 때만 `verify`를
돌리고, 실패하면 push를 막는다. ref 삭제만 하는 push에는 검사할 커밋이 없으므로 돌리지 않는다(#53). 검사 자식에게는 Git이 넘긴 저장소 지정 환경을 제거해, 임시 저장소 검사가 실제 저장소를 바꾸지 않게 한다. 이 관문이 통합 때의 검사 기록을 대신한다. CI의 필수 여부는 프로젝트가 정한다. devflow 자체의 기준은 [통합과 CI](#통합과-ci)를 따른다. 훅을 켜는 `git config core.hooksPath .githooks`는
클론마다 하고(호스트 설정이 아닌 저장소 설정이지만 훅을 켜는 일이라 소유자 지시로 한다), 훅이 꺼진 클론에서는 통합
커밋에 검사 줄을 쓴다.

`pr-ci` 저장소에서 통합 관문인 전체 `verify`의 근거는 같은 revision을 실제로 검사한 CI다. 브랜치 push는 HEAD, PR은 최신 병합
결과에서 프로젝트의 `verify` step이 성공해야 하며, 확인 방법은 pr-review-workflow의 integration을 따른다. 로컬에서는
변경과 그 영향을 받는 동작을 실행하는 검사(건드린 경로와 그 호출자의 테스트)만 돌린다. 범위를 좁힐 근거가 없으면(공유
코드·설정·테스트 도구 변경) 그 자리에서 전체 `verify`를 로컬로 돌린다. CI가 `verify`를 돌리지 않거나 그 결과를 확인할 수 없으면 로컬에서
전체 `verify`를 돌리고, 필수 CI는 따로 기다린다. CI 성공은 수용 기준별 실행 증거와 독립 리뷰를 대신하지 않는다(#103).

## 통합과 CI

devflow 자체는 `pr-ci`다. CI는 push와 main 대상 PR마다 Linux·macOS·Windows, Node 22·24로 `verify`를 돌린다.
브랜치 push는 브랜치 HEAD, PR은 현재 base와 head의 최신 병합 결과를 검사한다. 통합 조건은 이 두 CI의 전부 성공,
merge commit, PR head가 독립 리뷰(M0 포함)를 받은 SHA이거나 그 뒤 main 병합만 더해 diff가 같은 SHA인 것이다.
리뷰한 SHA와 main 병합만 더한 경우의 SHA를 PR에 기록한다. 누락·취소·건너뜀·다른 커밋·출처가 다른 같은 이름은 통과가 아니다.
CI 성공은 수용 기준별 실행 증거와 독립 리뷰를 대신하지 않는다. 전체 `verify`의 근거와 로컬 검사 범위는
[.devflow.json](#devflowjson)을 따른다.

PR 본문은 공개 요약, 리뷰 근거와 리뷰한 SHA, `Refs #<n>`을 담는다. PR 본문·커밋·merge commit 메시지에는 Issue를 닫는
키워드를 쓰지 않는다. Issue 종료는 `devflow-state`가 병합 확인 뒤에 한다. 문서만 바뀐 PR과 M0도 같은 통합 조건을 따른다.
기존 제품 커밋과 검토한 SHA를 보존하도록 merge commit으로 통합하며 squash·rebase는 쓰지 않는다. 선형 이력 강제와 함께 쓰지 않는다.
뒤처진 브랜치는 main을 병합해 갱신한다.

### main의 서버 보호

main에 활성 ruleset 하나를 두고 우회 주체는 두지 않는다. 규칙은 다음과 같다.

- 브랜치 삭제 금지와 강제 push 금지.
- PR 경유: 필요한 승인 수는 0, 대화 해결 필수, 허용하는 병합 방식은 merge만.
- 아래 네 필수 check의 strict 통과. 출처는 GitHub Actions 앱(integration id `15368`)의 `.github/workflows/test.yml`이다.

| 필수 check |
|---|
| `test (ubuntu-latest, 22)` |
| `test (ubuntu-latest, 24)` |
| `test (macos-latest, 22)` |
| `test (macos-latest, 24)` |

Windows job은 ruleset의 필수 check가 아니지만 통합 조건의 CI 전부 성공에 포함된다. 필수 check로 바꾸는 일은 ruleset 변경이므로
별도 사용자 지시로 한다. 혼자 운영하므로 자기 승인을 요구하지 않고, 다른 호스트의 독립 리뷰를 GitHub 승인으로 위장하지 않는다.
서버 보호가 이 기준과 다르면 통합하지 않는다.

로컬 pre-push는 `local-merge`의 통합 관문이다. `pr-ci`에서는 훅을 켜지 않아도 되며, 켜 둔 클론에서만 브랜치 push 전 검사로 돈다.
`pr-ci`의 통합 관문은 서버의 ruleset과 PR check다.

[ship](lifecycle.md#단계)의 검사·기록 뒤, 통합 직전에 base·head·규칙·check를 다시 읽는다. 뒤처지면 main을 병합한다
([리뷰](orchestration.md#리뷰)). 병합 뒤 실제 main SHA와 main CI를 확인한 후 완료·정리한다.

### 자체 통합 정책의 되돌림

서버 보호를 먼저 끄고 빠져나오지 않는다. ruleset이 PR을 요구하므로 되돌림도 현행 통합 관문을 거친 PR로 한다.
바꾸는 설정의 이전 값과 실행 근거는 작업 기록에 남긴다.

1. 되돌림 PR은 devflow 저장소 고유의 통합 정책만 대상으로 한다. `.devflow.json`, AGENTS.md, 이 절, pr-review-workflow의
   integration reference 중 devflow 전용 문구를 함께 맞춘다. 다른 `pr-ci` 프로젝트에도 적용되는 lifecycle·orchestration·ship의
   통합 방식별 규칙은 유지한다. 현재 결정 요약의 해당 선택과 이유도 되돌림 대상에 맞춘다.
2. 이 보호 기준과 `.github/workflows/test.yml`의 `pull_request` trigger는 유지한 채 PR을 병합한다. 되돌림 진행과
   `되돌림 중: ruleset 해제 대기` 상태는 작업 Issue와 장부에 기록한다. 그 PR 병합 뒤부터 ruleset 해제까지는 통합하지 않는다.
3. ruleset 해제는 별도 사용자 승인으로 실행한다. 해제를 확인한 뒤 작업 기록의 대기 상태를 해제하고, spec과 현재 결정 요약을
   실제 적용된 정책에 맞춘다.
4. `pull_request` trigger 제거는 그다음 증분에서 한다. 되돌림 PR과 서버 보호 해제 사이에 먼저 제거하지 않는다.

## 버전

두 플러그인 매니페스트의 `version`은 같아야 하며 `tests/devflow-config.test.js`가 검사한다.
사용자가 릴리스를 지시할 때만 `0.y.z`를 올린다. 기능·동작 변경은 minor, 수정은 patch이며 한 릴리스에 섞이면
minor를 올린다. 일반 Issue 통합은 버전을 유지한다. 1.0 전환은 별도 결정이며 태그·릴리스 노트·배포는 릴리스에서만 한다.
설치 경로와 실행기는 매니페스트의 버전을 읽어 사용한다.

## 배포

공통 공개 marketplace는 [wotjr1649/marketplace](https://github.com/wotjr1649/marketplace)이고 이름은 `wotjr1649`다.
플러그인 이름은 `devflow`, 설치 식별자는 `devflow@wotjr1649`다. 플러그인 루트는 유지한다. Claude의 `.claude-plugin/marketplace.json`과 Codex의
`.agents/plugins/marketplace.json`은 HTTPS `url` 소스로 `wotjr1649/devflow`의 같은 `v0.y.z` 태그를 가리킨다.
다른 플러그인은 자신의 저장소와 태그를 가리키는 항목으로 추가한다.

devflow 저장소 안의 두 catalog는 `devflow-local`이라는 개발용 이름으로 유지한다. 배포는 공통 catalog를 원격 또는 local clone으로 등록한다.
로컬 시험용 marketplace에는 비공개 파일이 없는 별도 worktree를 쓰고, 설치본은 태그나 시험 커밋의 추적 파일과
대조한다. 옛 설치에서 옮길 때 새 설치와 Codex 훅 신뢰를 확인한 뒤 옛 플러그인을 비활성화한다. 다른 플러그인과 설정은 보존한다.

## 릴리스와 롤백

사용자가 지시한 릴리스는 이 순서로 한다.

1. 두 매니페스트 버전을 [버전 정책](#버전)에 따라 올리고 검사·리뷰·[통합 관문](#통합과-ci)을 통과해 main에 통합한다.
2. 원격 main과 통합 커밋을 확인하고 그 커밋에 경량 `v0.y.z` 태그를 만들고 push한다. 같은 이름의 태그가 있으면 재작성하지 않는다.
   pre-push는 태그도 HEAD와 같아야 허용하므로 경량 태그를 쓴다.
3. 태그를 검증하고 해당 버전의 GitHub Release에 변경·검증·제약을 적는다. 버전·태그·릴리스 대상 커밋이 일치해야 한다.
4. 공통 marketplace의 두 항목을 같은 새 태그로 바꾸고 manifest 검증 후 게시한다. catalog 자체의 main은 갱신하며,
   플러그인 소스는 릴리스 태그로 고정한다.
5. 두 호스트에서 marketplace를 갱신하고 플러그인을 설치·업데이트한다([명령](../../README.md#install)). 새 세션의
   구성요소·훅 신뢰와 설치 파일을 태그에 대조한다. 자동 업데이트는 사용자가 호스트에서 별도로 설정한다.

문제가 있으면 두 catalog의 참조를 이전 검증 태그로 함께 되돌려 게시하고, 사용자는 marketplace와 플러그인을 다시 갱신한다.
버전 비교로 이전 버전의 적용을 거부하는 호스트에서는 해당 플러그인만 제거·재설치한다. 다른 플러그인과 기존 태그는 유지한다.
롤백도 공유 catalog·호스트를 바꾸는 작업이므로 그 대상과 효과를 포함한 사용자 지시로 실행한다.
