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

## .gitignore 관리 블록

`devflow-doctor`는 표시 사이의 내용만 비교하고 갱신한다. 블록 밖은 프로젝트 소유다.

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

CI 없는 `local-merge` 저장소는 추적되는 `.githooks/pre-push`가 작업 트리가 깨끗하고 push하는 커밋이 HEAD일 때만 `verify`를
돌리고, 실패하면 push를 막는다. 이 관문이 통합 때의 검사 기록을 대신한다. 훅을 켜는 `git config core.hooksPath .githooks`는
클론마다 하고(호스트 설정이 아닌 저장소 설정이지만 훅을 켜는 일이라 소유자 지시로 한다), 훅이 꺼진 클론에서는 통합
커밋에 검사 줄을 쓴다.

`integration` 값은 `pr-ci`, `local-merge`, `push-on-request` 중 하나다. AGENTS.md를 비공개로 운영하면
`"agentsMd": "private"`을 적는다.

## doctor 검사 항목

`bin/devflow-doctor [path]`가 읽기만 하고 검사한다. 실패(FAIL)가 있으면 exit 1이고, 경고(WARN)는 실패시키지 않는다.
Issue 검사는 아직 없다.

| 대상 | 검사 |
|---|---|
| 폴더 | 필수 경로 |
| .gitignore | 관리 블록 내용, 비공개 경로가 추적되는지 |
| .gitattributes | 기본 줄, `git ls-files --eol` 위반, 바이너리 표시 |
| AGENTS.md | 길이, 필수 절, 링크 실존, "편집할 때마다 읽어라" 같은 고정 읽기 목록, 강조어 남용, 날짜·진행 상태 |
| git 훅 | `local-merge` 저장소에서 `core.hooksPath`가 `.githooks`를 가리키는지 |
| 지침을 끄는 파일 | `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`가 저장소나 상위 폴더에 있는지. git이 무시하는 파일도 본다 |
| 문서 | 줄바꿈, BOM, 보이지 않는 문자, 로컬 절대 경로, 크기 예산, 상대 링크와 앵커 |
| Issue (다음 판) | 본문 절, 현재 상태 블록 길이 (`gh` 조회) |
| 로컬 문서 | 크기 예산, 이름 규칙 |

같은 스크립트를 스킬(분석), 훅(편집 직후 알림), CI나 git pre-push 훅(실패 처리)이 함께 쓴다.
