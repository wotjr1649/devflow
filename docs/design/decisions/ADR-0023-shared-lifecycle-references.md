# ADR-0023: 생명주기 references를 플러그인 루트로 옮긴다

상태: 채택 (#74).

## 맥락

라우터 스킬 `devflow`의 단계별 references(discover, design, plan, ready, build, verify, review, ship, learn,
perspectives, standards)는 `skills/devflow/references/`에 있었다. 이 문서들은 라우터만의 것이 아니다.
`pr-review-workflow`의 SKILL.md·completion·review와 `development-start`가 ship·perspectives·discover를 직접 링크하고,
spec도 ship을 링크한다. 즉 여러 스킬이 함께 쓰는 생명주기 문서다.

plugin-eval은 스킬 폴더 안의 보조 파일 전체를 그 스킬의 deferred 비용으로 센다. 이 위치에서는 라우터 스킬이
deferred 예산을 크게 넘어, 본문을 아무리 줄여도 A에 닿지 못했다(#74 성적표).

## 결정

- 단계별 references를 플러그인 루트의 `references/`로 옮기고, 모든 상대 링크를 새 위치로 고친다.
  내용은 바꾸지 않는다.
- doctor의 크기 예산(5000토큰)은 플러그인 저장소(호스트 매니페스트가 있는 저장소)의 루트 `references/`에도 그대로
  적용한다. 다른 프로젝트의 `references/` 폴더에는 적용하지 않는다.
- 성적표에는 이 이동이 측정 경계를 바꾼다는 사실을 함께 적는다. 플러그인 전체의 deferred 분량은 그대로다.

## 대안과 다시 볼 조건

- 라우터를 A 대상에서 예외로 둔다: 사용자가 전구간 A+를 목표로 정해 기각했다.
- 본문만 줄인다: 스킬 폴더 안의 references가 남는 한 deferred 오류로 B를 넘지 못해 기각했다.
- references를 검사 제외 폴더로 숨긴다: 평가를 피하는 것이라 기각했다.
- 호스트가 스킬 폴더 밖 파일을 설치하지 않게 바뀌면 이 배치를 다시 본다. 지금은 두 호스트 모두 플러그인 루트 전체를
  설치하며, 스킬은 이미 `docs/specs/`를 같은 방식으로 링크한다.

## 검증 한계

이동 후 읽는 파일 수는 라우터 경로에서 같다. 실제 호스트 설치본에서의 로딩은 #68의 TUI 단계에서 확인한다.
