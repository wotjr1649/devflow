# 작업 장부 계약

작업 장부의 키, 무인 실행, 같은 Issue를 여러 세션이 쓸 때를 정한다. 장부를 두는 곳은
[repository](repository.md#issue-폴더)가 정한다.

## 작업 장부 키

`devflow-state ledger-update`와 키별 전용 명령으로 쓰고 재개 카드와 Stop 훅이 읽는다. `ledger-update`는 `stage`, `path`,
`runMode`, `mode`, `task`의 값을 아래 정의대로 검사해 틀리면 거부한다(#34). 장부는 1MiB 이하의 일반 파일일 때만 읽고, 그보다
커지게 하는 쓰기는 거부해 장부를 그대로 둔다(#46). 이 키들은 `null`이나 빈 값으로 지울 수 없다. 단계는 lifecycle의 10단계와 ship 뒤의 `done`이다.

| 키 | 담는 것 |
|---|---|
| `stage`, `path` | lifecycle의 단계와 경로(spike, bounded, architectural). 단계 기록은 [lifecycle](lifecycle.md#단계)의 ship 이후 예외와 [작업 루프](lifecycle.md#반복)를 따른다 |
| `mode` | `interactive` 또는 `autonomous`. 무인 구간의 유일한 기준이다. 새 장부는 `ledger-update`로 정할 수 있고, 기존 장부의 전환은 `devflow-state mode <n> autonomous\|interactive < 이유`로만 한다([자율 실행](#자율-실행)) |
| `modeChanged` | 마지막 mode 전환의 `{to, at, session}`. `mode` 명령(새 장부를 autonomous로 시작하는 `ledger-update` 포함)이 ISO 시각과 바꾼 세션의 id 해시를 기록하고, 재귀속은 `session`만 바꾼다([자율 실행](#자율-실행)). 재개 카드가 `Mode: <to> since <at>`로 보인다 |
| `runMode` | M0~M3으로 시작한다(뒤에 설명을 붙여도 된다) |
| `task` | `{current, total}`, 1 이상의 정수. 마지막 작업이 끝나면 current가 total을 넘을 수 있다 |
| `base`, `lastCommit` | 위임 전 BASE, 장부가 기록한 마지막 커밋 |
| `counts` | Stop 훅의 작업별 계속 횟수 `{continue}`. 옛 fix·promote 값은 읽거나 검증하지 않는다 |
| `notes` | 수정·승격·경로 변경의 이유, 검증 증거, 자율 실행에서 게시하지 못한 내용, 한 줄씩(`note`로 덧붙인다) |
| `decisions` | 열린 결정만. 내린 결정은 체크포인트나 결정 기록에 둔다 |
| `blocked` | 막힘이나 사람을 기다리는 사유(원격 쓰기 확인 포함). 비어 있지 않으면 자율 계속을 하지 않는다 |
| `running` | 실행 중인 백그라운드 위임 이름 목록. `running <n> add <이름>`으로 넣고, 결과를 회수하고 종료를 확인하면 `done`으로 뺀다. 실패·timeout·중단은 자식 프로세스의 종료와 부분 효과까지 확인한다. 확인하지 못하면 기록을 남기고 독립 작업만 계속하며 다시 실행하지 않는다. 종료 확인 의무는 종료 권한이 아니다. 남은 항목은 Stop의 자율 계속을 막는다. `ledger-update`로 실행 중인 목록을 교체하지 않는다 |
| `followups` | ship 때 제안할 후속 후보 |

같은 폴더의 `sessions.json`과 `ledger.lock`은 [동시 세션](#동시-세션)에 쓴다.
옛 장부의 `testsLocked`, `testsFailing`, `pendingPosts`, `metrics`와 옛 집계 값은 무시하며 자동으로 지우거나 다시 쓰지 않는다.
`ledger-update`도 `pendingPosts`를 바꾸지 않는다. 남은 게시 후보는 사용자가 읽고 승인한 것만 게시한다.
작업 Issue의 장부를 읽을 수 없으면(링크나 파일인 Issue 폴더, 해석되지 않는 장부) 자율 모드일 수 있으므로 Issue에 쓰지 않는다.
시험 잠금, 지표 명령, 게시 대기열·서명 키, 위임 결속, 차단 로그는 제공하지 않는다.
`stage: ready`인 옛 장부는 읽지만 새 ledger-update에서 stage로 쓰면 plan에 통합되었다는 이유로 거부한다.

## 자율 실행

무인 구간은 장부의 `mode`가 `autonomous`일 때뿐이다(사용자 결정). 사용자가 자리를 비우거나 자율 실행을 지시할 때,
또는 비대화형으로 띄우는 프롬프트가 그렇게 정할 때 라우터가 `devflow-state mode <n> autonomous < 이유`로 바꾼다.
사람이 돌아오면 `devflow-state mode <n> interactive < 이유`로 되돌린 뒤 notes의 게시 후보를 사용자에게 보여 준다. 이유는 stdin의 첫 줄로
필수이고, 명령은 잠금 안에서 mode를 바꾸며 `mode <값>: <이유>`를 notes에 덧붙이고 `modeChanged`에 값과 시각을 남긴다.
같은 값으로의 전환은 거부한다. 다만 다른 세션이 이미 autonomous인 작업에 `mode <n> autonomous`를 하면 거부하지 않고
`modeChanged.session`만 그 세션으로 바꾼다(재귀속, 이유는 notes에). 새 세션이 autonomous 작업을 이어받으면 사용자가
있을 때 interactive로 바꾸고, 무인으로 이어 가면 먼저 재귀속한다. bypass(Claude)나 yolo(Codex) 같은 승인 설정은 사람이 있는지를 말하지 않으므로 기준으로
쓰지 않는다. Stop 훅은 이때만 계속을 요청하고, 장부 잠금 아래에서 계속 횟수를 더한다.

- 조건: 단계가 build나 verify이고 열린 작업이 있으며, `blocked`, 열린 `decisions`, `running`이 비어 있다
  ([작업 장부 키](#작업-장부-키)). 원격 쓰기 확인을 기다리는 것도 `blocked`에 적는다.
- 같은 작업에 최대 2회(장부의 계속 횟수). 그 뒤로는 멈추고 검토를 받는다.
- 작업 하나가 끝나면 검사, 커밋, 장부 갱신을 한다. `/clear`는 사용자만 실행할 수 있으므로, 무인 실행은 작업마다 구현
  서브에이전트(M2)로 새 컨텍스트를 쓰고 메인은 장부와 커밋으로 이어 간다.
- 무인 구간에서는 Issue에 게시하지 않고 push와 통합도 하지 않는다. 장부에 남겨 다음 대화형 턴에
  한다([Issue 입출력](issues.md#issue-입출력)). 이는 devflow의 현행 무인 실행 정책이다.
  `devflow-state`는 자율 모드의 모든 Issue 쓰기를 거부하며 사용자에게 보여 줄 내용을 장부 notes에 남기도록 안내한다.
  대기 게시를 만들거나 자동으로 게시하지 않는다.

대화형 작업에서는 이 훅이 꺼져 있다.

## task worktree

worktree의 Issue는 그 worktree 브랜치의 Issue뿐이다. Issue 브랜치가 아닌 linked worktree는 독립이며 다른 Issue의 장부를 쓰지 않는다.

- Claude 격리 표지(`.claude/worktrees/agent-*` 폴더나 `worktree-agent-*` 브랜치)가 있으면 Issue에 결속하지 않는다.
  `devflow-state`의 장부·Issue 쓰기·create·remark·release는 거부하고 메인 세션이 기록한다. 재개 카드는 메인 세션이
  상태와 쓰기를 맡는다는 안내만 보인다. 옛 `delegates.json`은 읽거나 바꾸지 않는다.
- 표지 없는 worktree는 자기 Issue 브랜치나 독립 worktree로 판단한다. 폴더와 브랜치 표지를 모두 바꾸면 격리 여부를
  알 수 없는 한계는 그대로다. Stop은 자기 Issue 브랜치에서만 장부를 읽는다.
- create: Issue 브랜치가 아닌 linked worktree에는 작업 Issue 장부가 없다. 주 작업 트리 브랜치의 Issue가 autonomous, 이 세션이
  켰거나 이어받았거나(`modeChanged.session`) 30분 안에 쓴 autonomous 장부, 켠 세션을 모르는 autonomous 장부(세션 id를
  모를 때 포함), 주 작업 트리가 detached HEAD(rebase 중일 수 있다)일 때의 autonomous 장부, 읽지 못한 Issue 폴더 목록·
  Issue 폴더·장부·autonomous 장부의 `sessions.json`이 있으면 거부한다. reftable 저장소는 HEAD 파일이 stub이라 브랜치를
  git에 묻고, 묻지 못하면 detached로 본다. 목록의 이름 그대로 보며 따라가지 않고, `i<n>` 이름의 링크·폴더가 아닌 항목,
  `i<n>`과 대소문자만 다른데 같은 항목임을 file id로 보이지 못하는 것(id 0 포함), 다른 이름의 링크, 장부가 있거나 있는지
  모르는 폴더, 목록의 이름으로 열리지 않거나 판정할 수 없는 항목, 두 번 나오는 이름, 같은 file id를 여는 두 이름, 안전한
  정수 범위를 넘는 번호는 읽지 못한 것으로 본다. Windows short name은 다른 이름의 항목을 `i<n>`으로 열 수 있고, 짝 없는
  surrogate 이름은 U+FFFD로 나와 다른 이름과 겹칠 수 있다. 장부는 판정한 그 목록의 Issue와, 목록과 별개로 `i<n>`으로 주 작업
  트리 브랜치의 Issue를 읽고, `sessions.json`은 한 번만 읽는다. create는 같은 항목일 때만 Issue 폴더로 본다. 거부는 그 Issue나 항목을 알리되 항목 이름은 영문자·숫자·`_`·`.`·`-`로만
  될 때만 보이고, 그 실행의 소유 세션이나 사용자에게 확인·복구를 맡기며, 다른 Issue의 mode 전환이나 이 검사가 없는 경로를
  안내하지 않는다. detached HEAD의 create는 어디서든 거부한다. 작업 Issue가 없는 주 작업 트리의 create는 대화형으로
  간주하는 한계가 그대로다([Issue 입출력](issues.md#issue-입출력)).
- `release <n>`은 이 세션의 항목이 있을 때만 지우고, 없으면 폴더·잠금·파일을 만들지 않는다.

## 동시 세션

같은 기기의 두 세션(Claude와 Claude 또는 Codex)이 인계나 메시지로 한 Issue를 이어받을 때다.

- 장부 쓰기는 짧은 잠금(`ledger.lock`) 아래에서 읽고 고쳐 임시 파일로 바꿔 쓴다. 잠금 안에서는 네트워크를 쓰지 않으므로
  10초 지난 잠금은 버리고, 2초 안에 잡지 못한 쓰기는 거부한다.
- `ledger-update`는 보낸 최상위 키를 바꾸고, 덧붙이는 기록은 `note`로 한다(동시 기록 유실 방지).
  둘은 Issue 브랜치에선 자기 장부만 쓰고, 다른 이름 브랜치(main 등)에선 번호의 장부를 쓰되 `note`는
  장부가 있어야 한다. detached HEAD(rebase 중일 수 있음)와 Issue 브랜치가 아닌 linked worktree는 거부한다.
- 쓰기(Issue와 장부)는 세션을 `sessions.json`에 남긴다(id 해시와 시각). 다른 세션이 30분 안에 쓰고 해제하지 않았으면
  재개 카드와 쓰기 출력이 경고한다. 거부하지 않고, 읽기는 세지 않는다.
- [현행 세션 id 전달](hooks.md#두-호스트의-공통-계약): CLI는 `CODEX_THREAD_ID` → `DEVFLOW_SESSION_ID` →
  `CLAUDE_CODE_SESSION_ID` 중 비어 있지 않은 첫 값을 쓴다. 중첩 host도 이 순서다. 서브에이전트는 부모 id이며, id가 없으면 기록·경고하지 않는다.
- 인계할 때는 검사·커밋·상태 기록과 위임 작업을 마친 뒤, 마지막 장부 동작으로 `release <n>`을 실행한다. `/clear`로
  작업 단위를 넘길 때도 이 순서를 따른다. 그다음 사용자에게 다음 행동을 보고하고 `/clear`를 맡긴다. 해제 뒤 다시 쓰면
  세션이 재등록되므로 추가 기록은 해제 전에 마친다. Codex의 직접 `/clear`는 이전 thread를 즉시 종료하지 않으며 이전
  id도 새 훅에 주지 않아 자동 해제를 보장하지 않는다(#47, [관찰](../research/host-facts.md#codex)). 다른 세션을 추측해서
  지우지 않는다. 세션이 끝나면 두 호스트의 SessionEnd 훅이 모든 Issue에서 뺀다(Claude는
  `/clear` 포함, #42). 훅이 돌지 않으면(신뢰하기 전의 Codex 훅, 비정상 종료) 30분 만료에 맡긴다. 그래서 다른 세션(다른
  호스트, headless 실행)에 맡기는 지시서는 끝에 그 세션이 `release <n>`을 실행하게 한다. 빠뜨리고 훅도 돌지 않으면
  끝난 세션에 대한 경고가 30분 동안 이어진다(#33).
- SessionEnd는 외부 `git` 없이 로컬 역방향 연결로 주 작업 트리를 확인해 조회 지연·실패로 해제를 놓치지 않는다(#47).
  미확인 연결로 다른 저장소를 해제하지 않는다. 읽은 JSON 객체에서 해당 id만 제거하고 다른 값·잠긴 장부는 보존한다.
  명시 release의 잠금·읽기·재기록 실패는 해제 실패로 알리며 잠금 충돌로 단정하지 않는다.
- Issue 쓰기는 잠그지 않는다. 다른 기기의 세션은 모르고, 한 호스트 안에서 띄운 다른 호스트(Codex 안의 Claude)는 바깥
  세션으로 보인다.
