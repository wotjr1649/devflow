# ADR-0028: linked worktree는 독립이 기본이고, 명시한 M3 위임만 부모 Issue에 연결한다

상태: 채택 (#73, 2026-10-24 사용자 결정: 독립 worktree 기본, 명시 M3 연결만 부모 Issue 공유).

## 맥락

#14부터 Issue 폴더는 주 작업 트리에 두고, Issue 브랜치가 아닌 linked worktree를 M3 작업 worktree로 보아 주 작업 트리
브랜치의 Issue에 귀속했다. Git이 증명한 "같은 저장소의 worktree"를 "그 Issue에 위임된 작업"으로 넓힌 것이다. #73의 실제
과업 시험에서 독립 세션이 남의 Issue 시험 잠금·세션 기록·쓰기 대상을 물려받았고, 그 세션은 그 Issue의 장부·mode·
대기열·잠금 해제까지 바꿀 수 있었다. 반대로 진짜 M3 위임은 부모 세션이 다른 worktree에 있거나 주 작업 트리가 다른
브랜치면 보호를 잃었고, Issue 브랜치로 바꾸면 그 Issue의 모든 쓰기를 얻었다. 어느 경로에도 위임 여부 검사는 없었다.

Claude Code 2.1.310에서 확인한 사실: 격리 worktree는 `<주 작업 트리>/.claude/worktrees/agent-<id>`와 브랜치
`worktree-agent-<id>`이고 git 기록이 증명한다. 서브에이전트 셸의 세션 id는 부모와 같고, 셸에는 agent 식별 변수가 없다.
agent id는 띄운 뒤에야 메인이 안다. 훅 입력의 `agent_id`·`session_id`는 관측하지 않았다.

## 결정

- 귀속은 Git 사실이 먼저다. worktree의 Issue는 그 브랜치의 Issue뿐이고, Issue 브랜치가 아닌 linked worktree는 어느
  Issue에도 귀속하지 않는다. 같은 세션의 기록이 있어도 마찬가지다.
- M3 연결은 네 가지가 모두 있을 때만 성립한다: 메인이 띄우기 **전에** `running <n> add <이름> --worktree`로 남긴 위임
  기록(`delegates.json`, 세션 id 해시), 같은 세션, 격리 worktree 표지(`.claude/worktrees/agent-*` 또는 `worktree-agent-*`),
  git의 worktree 증명. 연결된 worktree는 부모 장부를 읽고 시험 잠금·차단 기록·doctor 잠금 검사를 따른다.
- 표지가 있는데 연결을 확인할 수 없으면 독립으로 풀지 않는다. 시험과 프로필을 잠긴 것으로 보고 doctor가 실패한다.
- 표지가 있는 worktree는 연결 여부와 관계없이 장부·Issue 쓰기·create·flush·release를 하지 않는다. Issue 브랜치로 바꿔도
  자기 Issue로 보지 않는다. 각 쓰기 입구가 이 판정을 직접 검사한다.
- 최초 create: 독립 linked worktree의 대화형 착수는 허용하되, 무인 실행의 증거(주 작업 트리 브랜치 Issue의 autonomous,
  이 세션이 켜거나 이어받은 autonomous, 켠 세션을 모르는 autonomous)가 있으면 거부한다. 다른 Issue 대기열로 넣지 않는다.
  `mode`는 바꾼 세션을 남기고, 무인 실행을 이어받는 새 세션은 재귀속한다. detached HEAD의 create는 거부한다.
- 판정은 `devflow-state`의 한 함수가 하고 CLI·훅·doctor가 함께 쓴다. 훅은 입력의 세션을 넘기고 자기 환경 변수를 읽지
  않는다.

## 대안

- fallback만 지우기: M3의 시험 잠금이 빠진다.
- 모든 non-Issue linked worktree를 미확인 M3로 보기: 독립 기본과 충돌하고 실제 시험의 증상을 되살린다.
- 이름만, 또는 세션의 최근 기록과 비어 있지 않은 `running`으로 자동 연결: 이름이 권한이 되거나, `running`이 M3 전용이
  아니고 30분 만료로 위임을 놓친다.
- 세션 기록만으로 `.claude/worktrees` 안 모든 worktree를 연결: 같은 세션의 비위임 worktree를 부모에 귀속한다.
- 훅 `agent_id`, `WorktreeCreate`, 띄운 뒤 agent id로 연결: 관측하지 않은 값이거나, 기본 생성을 대체하는 host 변경이거나,
  띄운 뒤 기록까지 빈틈이 생긴다.
- 두 PR로 나눠 먼저 fallback을 지우기: 그 사이 M3 보호가 빠진다.

## 결과

- 독립 세션은 다른 Issue의 장부·잠금·세션·대기열·차단 기록을 쓰지 않는다.
- M3 절차에 띄우기 전 기록 한 단계가 늘고, 빠뜨리면 그 worktree는 잠긴 채로 쓰기를 거부당한다(닫힌 방향).
- host가 격리 worktree의 폴더 이름과 브랜치 이름을 둘 다 바꾸면 위임이 독립으로 보인다. 시험이 이 규칙을 고정하고,
  실제 M3 사용에서 다시 확인한다.
- 남는 한계: 작업 Issue가 없는 주 작업 트리의 create·remark는 사용자 재석을 증명하지 못한다. 무인 실행을 재귀속 없이
  이어받고 30분 넘게 쓰지 않은 세션이 주 작업 트리 브랜치와 무관한 linked worktree에서 create하면 게시된다. rebase 중인
  Issue 브랜치의 잠금은 복원하지 않는다.
