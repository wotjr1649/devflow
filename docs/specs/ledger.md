# 작업 장부 계약

작업 장부의 키, 무인 실행, 같은 Issue를 여러 세션이 쓸 때를 정한다. 장부를 두는 곳은
[repository](repository.md#issue-폴더)가 정한다.

## 작업 장부 키

`devflow-state ledger-update`와 키별 전용 명령으로 쓰고 재개 카드와 Stop 훅이 읽는다. `ledger-update`는 `stage`, `path`,
`runMode`, `mode`, `task`의 값을 아래 정의대로 검사해 틀리면 거부한다(#34). 장부는 1MiB 이하의 일반 파일일 때만 읽고, 그보다
커지게 하는 쓰기는 거부해 장부를 그대로 둔다(#46). 이 키들은 `null`이나 빈 값으로 지울 수 없다. 단계는 lifecycle의 11단계와 ship 뒤의 `done`이다.

| 키 | 담는 것 |
|---|---|
| `stage`, `path` | lifecycle의 단계와 경로(spike, bounded, architectural). 단계는 상태 블록의 "단계"와 함께 바꾼다 |
| `mode` | `interactive` 또는 `autonomous`. 무인 구간의 유일한 기준이다. 새 장부는 `ledger-update`로 정할 수 있고, 기존 장부의 전환은 `devflow-state mode <n> autonomous\|interactive < 이유`로만 한다([자율 실행](#자율-실행)) |
| `modeChanged` | 마지막 mode 전환의 `{to, at}`. `mode` 명령이 ISO 시각을 기록하고 재개 카드가 `Mode: <to> since <at>`로 보인다 |
| `runMode` | M0~M3으로 시작한다(뒤에 설명을 붙여도 된다) |
| `task` | `{current, total}`, 1 이상의 정수. 마지막 작업이 끝나면 current가 total을 넘을 수 있다 |
| `base`, `lastCommit` | 위임 전 BASE, 장부가 기록한 마지막 커밋 |
| `counts` | 작업별 `{fix, promote, continue}` |
| `metrics` | 사이클의 수동 지표 `{interventions, filterFalsePositives, eval}`. 개수는 `devflow-state metric`으로 더하고, eval은 호스트별 `{claude, codex}`에 `{passed, total, rev}`로 `metric <n> eval <통과>/<전체> --host <호스트> --rev <커밋> < 메모`가 적는다(#50, [metrics](metrics.md#수동-지표)) |
| `testsLocked`, `testsFailing` | 시험 잠금의 `{at, failing}`과, `rebase`를 이유로 풀었을 때만 남는 실패 증거. `tests` 명령만 바꾼다([시험 잠금](repository.md#devflowjson)) |
| `notes` | 수정·승격·경로 변경과 수동 지표 증가의 이유, 검증 증거, 한 줄씩(`note`로 덧붙인다) |
| `decisions` | 열린 결정만. 내린 결정은 체크포인트나 결정 기록에 둔다 |
| `blocked` | 막힘이나 사람을 기다리는 사유(원격 쓰기 확인 포함). 비어 있지 않으면 자율 계속을 하지 않는다 |
| `running` | 실행 중인 백그라운드 위임의 이름 목록. 띄울 때 `devflow-state running <n> add <이름>`, 결과가 오거나 실패·중단했으면 `done`으로 뺀다. 남은
항목은 무인 계속을 막으므로, 새 세션은 장부를 보고 끝난 위임을 뺀다. `ledger-update`로 통째로 바꾸면 다른 위임이 빠져 Stop 훅이 그 위에서 계속하므로 쓰지 않는다(#24) |
| `followups` | ship 때 제안할 후속 후보 |
| `pendingPosts` | 무인 구간에 쌓인 게시. `devflow-state`가 관리하고 `ledger-update`는 거부한다. 올리면 안 되는 항목은 대화형 턴에서 `pending drop <n> <id>`에 이유를 주어 뺀다. 목록이 아니면(손으로 고친 장부) 쌓기와 flush를 거부하고 사람이 고친다(#35). 장부는 클론이나 압축본이 함께 가져올 수 있는 작업 트리 파일이므로, 쌓을 때 항목마다 저장소 밖에 둔 이 기기의 키(절대 경로 `DEVFLOW_HOME`, 없으면 `~/.devflow`의 `queue.key`)로 저장소 이름까지 덮는 HMAC을 붙이고, flush는 맞는 표시가 없는 항목이 하나라도 있으면 아무것도 게시하지 않는다. 그런 항목은 `pending`으로 읽고, 남길 것은 직접 게시한 뒤 `pending drop`으로 뺀다. 키를 읽지 못하면 flush는 대기열을 그대로 두고 거부한다. 무인 실행은 저장소 밖에 쓰지 못하는 샌드박스에서 돌 수 있으므로 `mode <n> autonomous`(새 장부를 autonomous로 시작하는 `ledger-update` 포함)가 대화형 턴에서 키를 먼저 만든다. GitHub origin이 없으면 flush는 거부한다. 같은 OS 사용자의 프로세스는 키를 읽을 수 있고, 이미 게시된 항목이 든 옛 장부를 되살리면 다시 게시될 수 있다 |

같은 폴더의 `guard-events.jsonl`은 차단 기록이고([metrics](metrics.md#수동-지표)), `sessions.json`과 `ledger.lock`은
[동시 세션](#동시-세션) 것이다.

## 자율 실행

무인 구간은 장부의 `mode`가 `autonomous`일 때뿐이다(사용자 결정). 사용자가 자리를 비우거나 자율 실행을 지시할 때,
또는 비대화형으로 띄우는 프롬프트가 그렇게 정할 때 라우터가 `devflow-state mode <n> autonomous < 이유`로 바꾼다.
사람이 돌아오면 `devflow-state mode <n> interactive < 이유`로 되돌린 뒤 게시 대기를 보여 준다. 이유는 stdin의 첫 줄로
필수이고, 명령은 잠금 안에서 mode를 바꾸며 `mode <값>: <이유>`를 notes에 덧붙이고 `modeChanged`에 값과 시각을 남긴다.
같은 값으로의 전환은 거부한다. bypass(Claude)나 yolo(Codex) 같은 승인 설정은 사람이 있는지를 말하지 않으므로 기준으로
쓰지 않는다. Stop 훅은 이때만 계속을 요청하고, 장부만 읽는다.

- 조건: 단계가 build나 verify이고 열린 작업이 있으며, `blocked`, 열린 `decisions`, `running`이 비어 있다
  ([작업 장부 키](#작업-장부-키)). 원격 쓰기 확인을 기다리는 것도 `blocked`에 적는다.
- 같은 작업에 최대 2회(장부의 계속 횟수). 그 뒤로는 멈추고 검토를 받는다.
- 작업 하나가 끝나면 검사, 커밋, 장부 갱신을 한다. `/clear`는 사용자만 실행할 수 있으므로, 무인 실행은 작업마다 구현
  서브에이전트(M2)로 새 컨텍스트를 쓰고 메인은 장부와 커밋으로 이어 간다.
- 무인 구간에서는 Issue에 게시하지 않고 push와 통합도 하지 않는다. 장부에 남겨 다음 대화형 턴에
  한다([Issue 입출력](issues.md#issue-입출력)). 외부에 공유되는 효과는 대화형 턴에서만 하기 때문이다.
  쌓을 때도 본문에 따른 검사(check의 기준 번호, close의 기준 충족, intent의 순서)를 이미 쌓인 게시를 적용한 본문으로
  미리 하고, 틀리면 그 자리에서 거부한다. Issue를 읽지 못하면(오프라인) 검사 없이 쌓는다. flush는 그 사이 바뀐 Issue와
  규칙에 대비해 다시 검사한다(#31).

대화형 작업에서는 이 훅이 꺼져 있다.

## 동시 세션

같은 기기의 두 세션(Claude와 Claude 또는 Codex)이 인계나 메시지로 한 Issue를 이어받을 때다.

- 장부 쓰기는 짧은 잠금(`ledger.lock`) 아래에서 읽고 고쳐 임시 파일로 바꿔 쓴다. 잠금 안에서는 네트워크를 쓰지 않으므로
  10초 지난 잠금은 버리고, 2초 안에 잡지 못한 쓰기는 거부한다.
- `ledger-update`는 보낸 최상위 키를 바꾸고, 덧붙이는 기록은 `note`·`metric`으로 한다(동시 기록 유실 방지).
  셋은 Issue 브랜치에선 자기 장부만 쓰고, 다른 이름 브랜치(main 등)에선 번호의 장부를 쓰되 `note`·`metric`은
  장부가 있어야 한다. detached HEAD(rebase 중일 수 있음)는 거부한다.
- 쓰기(Issue와 장부)는 세션을 `sessions.json`에 남긴다(id 해시와 시각). 다른 세션이 30분 안에 쓰고 해제하지 않았으면
  재개 카드와 쓰기 출력이 경고한다. 거부하지 않고, 읽기는 세지 않는다.
- 세션 id: Codex는 `CODEX_THREAD_ID`, Claude는 SessionStart 훅이 셸에 넘기는 `DEVFLOW_SESSION_ID`(없으면
  `CLAUDE_CODE_SESSION_ID`). 서브에이전트는 부모의 id다. 자기 id를 모르면 기록도 경고도 하지 않는다.
- 인계할 때는 검사·커밋·상태 기록과 위임 작업을 마친 뒤, 마지막 장부 동작으로 `release <n>`을 실행한다. `/clear`로
  작업 단위를 넘길 때도 이 순서를 따른다. 그다음 사용자에게 다음 행동을 보고하고 `/clear`를 맡긴다. 해제 뒤 다시 쓰면
  세션이 재등록되므로 추가 기록은 해제 전에 마친다. Codex의 직접 `/clear`는 이전 thread를 즉시 종료하지 않으며 이전
  id도 새 훅에 주지 않아 자동 해제를 보장하지 않는다(#47, [관찰](../research/host-facts.md#codex)). 다른 세션을 추측해서
  지우지 않는다. 세션이 끝나면 두 호스트의 SessionEnd 훅이 모든 Issue에서 뺀다(Claude는
  `/clear` 포함, #42). 훅이 돌지 않으면(신뢰하기 전의 Codex 훅, 비정상 종료) 30분 만료에 맡긴다. 그래서 다른 세션(다른
  호스트, headless 실행)에 맡기는 지시서는 끝에 그 세션이 `release <n>`을 실행하게 한다. 빠뜨리고 훅도 돌지 않으면
  끝난 세션에 대한 경고가 30분 동안 이어진다(#33).
- SessionEnd는 연결 worktree의 주 작업 트리를 로컬 Git 메타데이터의 역방향 연결로 확인한다. 외부 `git` 프로세스를
  시작하지 않으므로 그 조회의 지연·실패로 정리 대상을 놓치지 않는다(#47). 확인되지 않은 연결은 다른 저장소를 정리할
  근거가 되지 않는다. 세션 해제는 해당 id만 제거하며, 다른 세션과 잠긴 장부는 보존한다.
- flush는 대기열 전체를 claim하고 잠금 밖에서 게시한 뒤 항목마다 지운다. 다른 flush가 10분 안에 claim했으면 건너뛴다.
  게시 뒤 지우기 전에 끊기면 claim이 끝난 뒤 다시 게시될 수 있다. 게시 여부를 확인하지 못한 항목은 `unconfirmed` 표시를 달고 남아, 다음 flush가 다시 읽어 확인한 뒤에만 보낸다(#49).
- Issue 쓰기는 잠그지 않는다. 다른 기기의 세션은 모르고, 한 호스트 안에서 띄운 다른 호스트(Codex 안의 Claude)는 바깥
  세션으로 보인다.
