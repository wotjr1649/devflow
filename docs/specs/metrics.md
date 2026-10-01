# 측정 계약

사이클(Issue) 하나의 비용과 사람 개입을 매번 같은 방법으로 재고, 정해진 곳에 남긴다. 다음 사이클과 비교하는 것이
목적이다([overview](../design/overview.md) 원칙 4). 이유와 대안: [ADR-0013](../design/decisions/ADR-0013-local-session-metrics.md)

## 범위

- 단위는 Issue 사이클이다. 계획 작업(TASK k/N)별로는 나누지 않는다.
- 레코드의 `cwd`가 이 저장소의 작업 트리(주 작업 트리나 worktree) 안에 있고, 그 순간 세션의 작업 트리 브랜치가 Issue
  브랜치(`<type>/<issue>-<slug>`, 재개 카드와 같은 판정)인 레코드만 센다. main이나 다른 Issue 브랜치에서 한 일은
  들어가지 않는다. 경로는 문자열 앞부분이 아니라 경로 단위로 비교한다.
  - Claude: 호스트가 레코드마다 적는 `gitBranch`를 쓴다. 세션 안에서 worktree로 들어가면 그 worktree의 브랜치가 적힌다.
    저장소보다 위 폴더에서 시작한 세션의 `gitBranch`는 시작 폴더의 것이어서, 그 세션은 Codex처럼 reflog로 판정한다.
  - Claude 서브에이전트는 활동 구간(레코드 사이가 10분 넘게 비면 끊김)마다 판정한다. 구간이 시작하기 직전 부모 세션의
    마지막 레코드가 범위 안이면 그 구간을 통째로 센다. 아니면 레코드마다 위 규칙을 쓴다. 그래서 M3처럼 다른 브랜치의
    worktree에서 일한 서브에이전트는 들어가고, 부모가 다른 Issue로 옮긴 뒤 재개한 구간은 빠진다.
  - Codex: 브랜치가 세션 시작 값(`session_meta.git`)뿐이고 서브에이전트 기록에는 없다. 그래서 레코드의 시각과 `cwd`로
    그 작업 트리의 HEAD reflog에서 브랜치 구간을 찾는다.
    - 경계는 `checkout: moving from A to B` 항목뿐이다. rebase, reset, commit 같은 다른 항목은 브랜치를 바꾸지 않는다.
    - 첫 경계 이전은 그 경계의 A, 경계가 없으면 지금 브랜치다. detached HEAD(A나 B가 커밋)는 범위 밖이다.
    - 레코드의 `cwd`는 파일 순서상 직전 `turn_context.cwd`, 그 전이면 `session_meta.cwd`다.
    - 작업 트리가 다른 작업 트리 안에 있으면(`.claude/worktrees/…`) 가장 깊은 작업 트리의 reflog를 쓴다.
    - reflog가 없는 작업 트리의 레코드는 범위 밖 개수로 낸다.
  - 알려진 차이: Claude는 세션의 worktree를 따르고 Codex는 레코드의 `cwd`를 따른다. 그래서 Issue worktree에 있는 세션이
    다른 브랜치의 주 작업 트리에서 명령을 돌린 레코드는 Claude에서만 들어간다.
- 측정은 ship에서 통합하기 전에 Issue 브랜치에서 한다. 정리에서 worktree를 지우면 그 reflog도 사라지고, 호스트는 오래된
  기록을 지우기 때문이다. 통합 뒤의 단계는 측정 밖이다.
- 기록에 응답으로 남지 않는 호스트 내부 호출(세션 제목, compact 요약 등), 다른 기기의 기록, eval 실행은 들어가지 않는다.

## 자동 지표

`bin/devflow-metrics`가 센다. 호스트(`claude`, `codex`)마다 메인(`main`)과 서브에이전트(`sub`)로 나눈다.

| 지표 | 정의 | Claude 원천 | Codex 원천 | 호스트 간 비교 |
|---|---|---|---|---|
| `calls` | 모델 응답 수 | assistant 레코드의 `message.id` 고유 수. 호스트가 만든 `<synthetic>` 메시지는 뺀다 | `token_usage_record.response_id` 고유 수 | 가능 |
| `inputUncached` | 캐시를 거치지 않은 입력 토큰 | `usage.input_tokens` | `input_tokens − cached_input_tokens` | 가능 |
| `cacheRead` | 캐시에서 읽은 입력 토큰 | `usage.cache_read_input_tokens` | `cached_input_tokens` | 가능 |
| `cacheWrite` | 캐시에 쓴 입력 토큰 | `usage.cache_creation_input_tokens` | `cache_write_input_tokens`(보고된 값) | 참고만 |
| `output` | 출력 토큰. 추론 토큰을 포함한다 | `usage.output_tokens` | `output_tokens` | 가능 |
| `reasoning` | 출력 중 추론 토큰 | `usage.output_tokens_details.thinking_tokens` | `reasoning_output_tokens` | 참고만 |
| `tools` | 도구 호출 수 | `tool_use` 블록의 `id` 고유 수 | `response_item` 중 종류가 `_call`로 끝나는 항목의 `call_id` 고유 수 | 불가. Codex `exec` 한 번이 여러 명령을 묶는다 |
| `subagents` | 서브에이전트 실행 수 | 범위 안 레코드가 있는 `subagents/agent-*.jsonl` 수. 재개는 같은 파일이다 | `session_meta.source.subagent`가 있는 rollout 수 | 가능 |
| `activeMinutes` | 활동 시간. 구간의 합집합이고 유휴 시간은 뺀다 | 메인은 `system/turn_duration`(레코드 시각이 끝, `durationMs`가 길이). 측정할 때 아직 끝나지 않은 턴은 마지막 `turn_duration` 뒤 첫 레코드부터 마지막 레코드까지. 서브에이전트는 레코드 시각을 잇되 10분 넘게 비면 끊는다 | `task_complete`(레코드 시각이 끝, `duration_ms`가 길이) | 가능 |

- 토큰은 응답 하나에 한 번만 더한다. Claude는 스트리밍 조각이 같은 `message.id`로 여러 줄 남으므로 그 id의 마지막
  줄 값을 쓴다. Codex는 `response_id`마다 `token_usage_record.usage`를 쓴다. 이 값은 같은 레코드의 누적값
  (`thread_token_usage`) 증가분과 같다.
- `token_usage_record`가 없는 Codex 버전은 `last_token_usage`가 바뀐 `token_count`를 응답 하나로 센다. 이 값은 호출별
  레코드 합보다 작을 수 있어서, 그렇게 센 세션 수를 출력에 낸다.
- 세션 누적값(Codex `total_token_usage`, Claude `cost-state`)은 구간으로 나눌 수 없고 Claude 쪽은 종료한 세션에만 있다.
  그래서 검산에만 쓴다.
- `activeMinutes`는 블록(호스트×메인/서브)마다 그 블록 구간의 합집합이고, 맨 위의 `activeMinutes`는 모든 구간의
  합집합이다. 분 단위로 반올림한다.

## 수동 지표

일어난 즉시 `devflow-state metric <issue> <지표> < 메모`로 더한다. 이 명령이 장부 `metrics`의 그 지표를 1 늘리고 `notes`에
메모를 한 줄 덧붙인다. compact 뒤에 다시 세지 않아도 되게 하기 위해서다.

| 지표 | 1회 | 세지 않는 것 |
|---|---|---|
| `interventions` | 사용자가 에이전트의 단계, 경로, 방법, 산출물을 바로잡은 메시지 하나. 한 메시지에 여러 곳을 고쳐도 1이다 | 에이전트가 물은 질문의 답(선택지 밖의 답 포함), 원격 쓰기 승인, "계속", 새 요청, 사용자 지시 사항의 실행 |
| `filterFalsePositives` | devflow의 결정적 장치(`devflow-state` 공개 필터와 쓰기 거부, PreToolUse 훅, `devflow-doctor`, pre-push 관문)가 정당한 동작을 막아 문구나 방법을 바꾼 일 하나 | 실제 위반을 막은 경우, 호스트·전역 지침의 거부 |

`guardBlocks`는 자동이다. devflow 훅의 차단(Issue 쓰기, 보호 경로, 읽을 수 없는 프로필, 검사 실패)과 `devflow-state`의
거부가 그 Issue의 `.work/devflow/i<issue>/guard-events.jsonl`에 시각과 고정 id로 한 줄씩 남는다. 명령, 경로, 입력은
남기지 않는다. 훅은 작업 트리의 브랜치로 Issue를 찾고, 그 브랜치가 Issue 브랜치가 아니면 주 작업 트리의 브랜치로 찾는다
(M3 worktree). `devflow-doctor`와 pre-push 관문은 기록하지 않는다. ship에서 이 기록 중 정당한 동작을 막은 것을 가려
`filterFalsePositives`로 센다.

트리거율과 통과율은 eval 결과다. 그 사이클에서 스킬을 바꿔 eval을 돌렸을 때만 결과의 통과 수와 전체 수를
`metrics.eval`에 `{passed, total}`로 옮긴다.

## 출력

명령은 지표 이름과 정수만 담은 JSON 하나를 출력한다. `until`은 센 기록의 끝(epoch 초)이고, `--until`로 주면 같은 값을
다시 얻는다. 모델 이름은 `^[a-z0-9.-]{1,64}$`에 맞을 때만 쓰고 나머지는 `other`로 묶는다.

```json
{
  "schema": 2, "issue": 4, "until": 1790870000, "activeMinutes": 0,
  "claude": {
    "main": {"calls": 0, "inputUncached": 0, "cacheRead": 0, "cacheWrite": 0, "output": 0, "reasoning": 0, "tools": 0, "activeMinutes": 0},
    "sub": {"calls": 0, "inputUncached": 0, "cacheRead": 0, "cacheWrite": 0, "output": 0, "reasoning": 0, "tools": 0, "activeMinutes": 0, "subagents": 0}
  },
  "codex": {"main": {}, "sub": {}},
  "models": {"claude-opus-5-5": 0},
  "manual": {"interventions": 0, "filterFalsePositives": 0, "guardBlocks": 0, "counts": {"fix": 0, "promote": 0, "continue": 0}, "eval": {"passed": 0, "total": 0}},
  "skipped": {"badLines": 0, "longLines": 0, "outsideScope": 0, "noReflog": 0, "fallbackSessions": 0}
}
```

`codex`의 블록은 `claude`와 키가 같다. `manual.guardBlocks`는 `until`까지의 차단 기록 수다. schema 1(#4까지)과는
`guardBlocks`만 다르다. `manual.counts`는 장부 `counts`의 작업별 값을 더한 것이고, 장부에 없는 값은 0이다.

`--line`은 공개용 한 줄을 낸다. 두 호스트와 메인·서브를 더한 값이고, 순서는 고정이다.

```
- 측정(v2): calls 0, inputUncached 0, cacheRead 0, cacheWrite 0, output 0, tools 0, subagents 0, activeMinutes 0, interventions 0, filterFalsePositives 0, guardBlocks 0
```

## 둘 곳

- 보존: 주 작업 트리(`git rev-parse --git-common-dir`의 부모)의 `artifacts/metrics/i<issue>.json`이다. 에이전트가 명령의
  출력을 그대로 저장한다. 비공개이고 worktree를 지우거나 Issue가 닫혀도 남는다. 기준값도 같은 폴더에 둔다.
- 공개: `--line`의 줄을 ship 체크포인트에 넣는다. 이 체크포인트와 상태 done, Issue 종료는 Issue 브랜치에서 통합하기 전에
  한다. `devflow-state`는 지금 브랜치의 Issue에만 쓰기 때문이다. 순서는 라우터의 review reference가 안내한다.
- 장부와 체크포인트는 보존 파일을 가리키고 값을 다시 계산하지 않는다.

## 수집 명령의 경계

- 읽기만 한다. 읽는 곳은 저장소의 git 정보, 장부와 차단 기록, 그리고 두 호스트의 세션 기록뿐이다.
  - Claude: `<CLAUDE_CONFIG_DIR 또는 ~/.claude>/projects/` 아래, 작업 트리 경로를 이름으로 바꾼 폴더와 그 이름에 `-`로
    이어지는 폴더. 폴더 이름은 경로의 영숫자 밖 문자를 `-`로 바꾼 것이라 겹칠 수 있으므로 레코드의 `cwd`로 다시
    거른다. 세션은 시작한 폴더에 남고, 세션 안에서 들어간 worktree의 레코드도 그 파일에 있다. 작업 트리의 상위 폴더
    이름과 정확히 같은 폴더도 읽는다(앞부분이 같은 폴더는 다른 프로젝트다). 그 폴더의 파일 중 Issue 브랜치의 첫
    checkout보다 오래된 것은 읽지 않는다.
  - Codex: `<CODEX_HOME 또는 ~/.codex>/`의 `sessions/`와 `archived_sessions/` 아래 `rollout-*.jsonl`
  - 위치는 호스트 기본값, 환경변수, 명시 인자로만 정하고 저장소 파일에서 받지 않는다.
- 기록의 텍스트는 출력하지 않고 어디에도 쓰지 않는다. 오류도 규칙 이름과 개수만 낸다.
- 모델 호출, 네트워크, Issue·장부 쓰기를 하지 않는다. git은 고정 인자로만 부른다.
- 줄 단위로 읽고, 깨진 줄과 너무 긴 줄은 건너뛰어 센다. 링크는 따라가지 않는다. Issue 번호는 숫자만 받는다.
- 테스트는 합성 기록만 쓴다.
