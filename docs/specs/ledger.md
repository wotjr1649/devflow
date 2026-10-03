# 작업 장부 계약

작업 장부의 키, 무인 실행, 같은 Issue를 여러 세션이 쓸 때를 정한다. 장부를 두는 곳은
[repository](repository.md#issue-폴더)가 정한다.

## 작업 장부 키

`devflow-state ledger-update`로 쓰고 재개 카드와 Stop 훅이 읽는다.

| 키 | 담는 것 |
|---|---|
| `stage`, `path` | lifecycle의 단계와 경로(spike, bounded, architectural). 단계는 상태 블록의 "단계"와 함께 바꾼다 |
| `mode` | `interactive` 또는 `autonomous`. 무인 구간의 유일한 기준이다([자율 실행](#자율-실행)) |
| `runMode` | M0~M4 |
| `task` | `{current, total}` |
| `base`, `lastCommit` | 위임 전 BASE, 장부가 기록한 마지막 커밋 |
| `counts` | 작업별 `{fix, promote, continue}` |
| `metrics` | 사이클의 수동 지표 `{interventions, filterFalsePositives, eval}`. `devflow-state metric`으로 더한다([metrics](metrics.md#수동-지표)) |
| `notes` | 수정·승격·경로 변경과 수동 지표 증가의 이유, 검증 증거, 한 줄씩(`note`로 덧붙인다) |
| `decisions` | 열린 결정만. 내린 결정은 체크포인트나 결정 기록에 둔다 |
| `blocked` | 막힘이나 사람을 기다리는 사유(원격 쓰기 확인 포함). 비어 있지 않으면 자율 계속을 하지 않는다 |
| `running` | 실행 중인 백그라운드 서브에이전트 |
| `followups` | ship 때 제안할 후속 후보 |
| `pendingPosts` | 무인 구간에 쌓인 게시. `devflow-state`가 관리한다 |

같은 폴더의 `guard-events.jsonl`은 차단 기록이고([metrics](metrics.md#수동-지표)), `sessions.json`과 `ledger.lock`은
[동시 세션](#동시-세션) 것이다.

## 자율 실행

무인 구간은 장부의 `mode`가 `autonomous`일 때뿐이다(사용자 결정). 사용자가 자리를 비우거나 자율 실행을 지시할 때,
또는 비대화형으로 띄우는 프롬프트가 그렇게 정할 때 라우터가 바꾸고, 사람이 돌아오면 `interactive`로 되돌린 뒤 게시 대기를
보여 준다. bypass(Claude)나 yolo(Codex) 같은 승인 설정은 사람이 있는지를 말하지 않으므로 기준으로 쓰지 않는다. Stop 훅은
이때만 계속을 요청하고, 장부만 읽는다.

- 조건: 단계가 build나 verify이고 열린 작업이 있으며, `blocked`, 열린 `decisions`, `running`이 비어 있다
  ([작업 장부 키](#작업-장부-키)). 원격 쓰기 확인을 기다리는 것도 `blocked`에 적는다.
- 같은 작업에 최대 2회(장부의 계속 횟수). 그 뒤로는 멈추고 검토를 받는다.
- 작업 하나가 끝나면 검사, 커밋, 장부 갱신을 한다. `/clear`는 사용자만 실행할 수 있으므로, 무인 실행은 작업마다 구현
  서브에이전트(M2)로 새 컨텍스트를 쓰고 메인은 장부와 커밋으로 이어 간다.
- 무인 구간에서는 Issue에 게시하지 않고 push와 통합도 하지 않는다. 장부에 남겨 다음 대화형 턴에
  한다([Issue 입출력](issues.md#issue-입출력)). 외부에 공유되는 효과는 대화형 턴에서만 하기 때문이다.

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
- 넘길 때는 `release <n>`으로 이 세션을 뺀다. Claude는 SessionEnd 훅(`/clear` 포함)이 모든 Issue에서 빼고, Codex는 해제
  명령이나 30분 만료에 맡긴다.
- flush는 대기열 전체를 claim하고 잠금 밖에서 게시한 뒤 항목마다 지운다. 다른 flush가 10분 안에 claim했으면 건너뛴다.
  게시 뒤 지우기 전에 끊기면 claim이 끝난 뒤 다시 게시될 수 있다.
- Issue 쓰기는 잠그지 않는다. 다른 기기의 세션은 모르고, 한 호스트 안에서 띄운 다른 호스트(Codex 안의 Claude)는 바깥
  세션으로 보인다.
