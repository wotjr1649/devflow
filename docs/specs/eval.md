# 평가 계약

## eval

트리거 eval(`claude plugin eval . --tag trigger --no-publish`)은 스킬 목록이 바뀐 사이클에서만 돌린다. BASE..HEAD로 판별한다.

- 돌린다: `skills/*/SKILL.md` frontmatter의 호출 필드(`name`, `description`, `when_to_use`, `paths`,
  `disable-model-invocation`, `user-invocable`)가 바뀌었거나, 스킬을 더하거나 지우거나 이름을 바꿨거나, `evals/trigger/`가
  바뀌었을 때.
- 돌리지 않는다: 스킬 본문, references, 훅, 에이전트, AGENTS.md만 바뀌었을 때. eval 실행은 격리되어 대상 플러그인만
  로드되고, 호스트는 스킬 목록만 보고 자동 호출을 정하므로 이 변경은 결과를 바꾸지 않는다([host-facts](../research/host-facts.md)).
- 결과 eval은 두지 않는다. 스킬 본문의 변경은 리뷰와 사이클 지표(개입, 오탐, 차단)로 보고, 개입이 늘거나 같은 실수가
  반복되면 결과 eval 장치를 만드는 Issue를 연다.
- Claude eval은 사용자 터미널에서 돌린다. 세션 안에서 띄우면 인증이 없어 멈춘다. 리포트는 `--no-publish`로 게시하지 않고
  결과는 체크포인트와 장부에 남긴다(#45). 판정은 오류 난 실행을 빼고 트리거 80% 이상,
  오탐 10% 이하다. ship 체크포인트에 돌렸는지와 판별 근거를 남긴다.

### Codex 트리거 eval

Codex 실행기는 수동 opt-in이다. 기본 검사·CI·pre-push는 모델 평가를 실행하지 않는다.
Claude와 같은 `evals/trigger/`의 모든 사례에서 frontmatter를 제외한 본문을 그대로 사용하고, 각 Claude grader의
양성·특정 스킬 음성 판정을 유지한다. `none--*`는 스킬이 하나라도 검출되면 실패한다.

```bash
node bin/devflow-codex-eval --smoke --budget-tokens 200000
node bin/devflow-codex-eval --full --repetitions 3 --budget-tokens 4000000 --prior-results evals/results/<smoke>/result.json
# 예산 중단 뒤, 사용자 결정으로 총 예산을 늘리고 미실행 시도만 이어갈 때:
node bin/devflow-codex-eval --full --repetitions 3 --budget-tokens <new-total-budget> --continue-from evals/results/<partial-full>/result.json
```

- smoke는 양성·none 각 하나를 한 번씩 실행한다. full은 모든 사례를 `--repetitions <1..1000>`회(기본 1) 순차 실행하며
  재시도하지 않는다. 각 시도는 새 세션·새 빈 폴더이고 반복 번호를 결과에 기록한다. invalid·실패한 시도를 대체하지 않는다.
  budget 플래그가 없으면 모델 프로세스를 시작하지 않는다. `--prior-results`의 사용량도 예산에 합친다.
  `--continue-from`은 예산 때문에 중단된 full에서만, 기존 사례·정책·프롬프트 해시·반복 횟수와 Codex 버전·실행기 코드 해시·
  설치된 스킬 해시·전역 지침 해시·스킬 목록 해시가 모두 같을 때 미실행 시도만 실행한다. 기록된 시도를 재실행하지 않는다.
- `gpt-6.1-sol/high`, 사례당 300초다. 모델·effort·시간 제한·측정 대상·예산을 바꾸기 전에 사용자가 결정한다.
- 사용자의 실제 CODEX_HOME에서 돈다. 호스트가 평소 싣는 전역 지침·활성 플러그인·system 스킬이 그대로 들어가며,
  설정 파일은 바꾸지 않는다. 명령행으로 `--sandbox read-only`와 모델·effort를 고정하고 `--ephemeral`로 세션을 남기지 않는다.
  자식에게는 CODEX_HOME과 실행에 필요한 최소 환경 변수만 넘긴다. 작업 폴더는 모델에게 `<cwd>`로 보이므로 사례 폴더는
  이 저장소 밖 OS 임시 폴더에 위치 번호만 담은 이름(`cx-*/t01`)으로 만든다. 명령행 `-c project_root_markers=[]`로
  상위 폴더의 AGENTS.md도 싣지 않는다. 훅은 평소처럼 켜 두며, devflow 훅은 devflow 저장소 밖에서 출력이 없다.
  임시 폴더는 신뢰하지 않은 폴더지만 codex-cli 0.160.0은 쓸 수 있는 실행에서만 새 폴더의 신뢰를 기록하므로
  read-only 실행은 전역 config.toml을 바꾸지 않는다. 사전 검사도 read-only로 고정하고, 임시 폴더가 이 저장소 안이면 멈춘다.
  평소 사용과의 차이는 쓰기 차단이다.
- 측정 대상은 설치된 플러그인이다. 설치된 devflow 스킬이 저장소의 `skills/`와 바이트 단위로 다르면 비용 없이 멈춘다.
  모델 호출 전 `codex debug prompt-input`으로 devflow 7개 스킬이 목록에 있는지 확인하고 목록 전체를 결과에 남긴다.
  매 시도 전 전역 지침 해시가 시작 때와 다르면 멈춘다.
- 시도가 끝난 뒤 작업 폴더에 새 항목이 있으면 쓰기 차단이 듣지 않은 것이므로 invalid로 두고 더 진행하지 않는다.
  작업 폴더 밖의 쓰기는 이 검사로 보이지 않는다. 모델은 사용자 권한으로 파일을 읽을 수 있으며 이는 평소 사용과 같다.
- 해당 자식의 stdout JSONL만 읽는다. `item.*`의 `command_execution.command`가 설치된 devflow의
  `skills/<name>/SKILL.md`를 literal로 읽으려 한 경우 검출한다. 메시지·명령 출력·echo·목록의 경로는 증거가 아니다.
  `rg` 검색과 이스케이프된 따옴표 형태도 읽기로 본다. 읽기 실패도 시도로 검출한다.
  변수로 조립한 경로, 앞선 명령 뒤의 읽기, 상대 경로, 읽기 없이 이미 주어진 본문을 적용하는 경우는 미검출이다.
  이는 스킬 참조 시도의 대리 지표이며 실제 지침 적용이나 결과 품질을 재지 않는다.
- 사용량은 `turn.completed.usage`의 input+output 합계다. cached input은 input에 포함되므로 다시 더하지 않는다.
  종료 후 예산에 닿으면 다음 사례를 시작하지 않는다. 진행 중인 turn이 예산을 넘는 것은 막을 수 없다.
  사용량을 얻지 못하면 추가 실행을 중단한다. 시간 초과·비정상 종료·불완전 JSONL은 invalid로 따로 집계하고 성공률에서 제외한다.
  종료 요청 뒤 5초 안에 close가 없으면 프로세스 종료 미확인으로 기록하고 더 진행하지 않는다. 해당 PID와 작업 폴더를
  보존해 호출자가 종료를 확인하도록 한다.
- 기대 스킬·검출 스킬·pass/fail/invalid·반복 번호·사용량·시간·환경·완료 여부는 Claude 결과 옆 `evals/results/`에 저장한다.
  요약의 `perCase`는 사례마다 시도 수·판정 분포·판정 안정 여부·읽은 스킬 조합을 반복 간 편차로 남긴다.
  시도마다 명령 문자열(명령 100개, 각 2000자까지)을 남겨 파서가 바뀌어도 다시 채점할 수 있게 한다. 명령 출력·메시지·
  stderr와 세션 기록은 저장하거나 읽지 않는다. 결과 폴더는 git이 무시한다. 실행 오류와 평가 실패는 종료 코드 1이다.

실행 방식과 대안의 이유: [ADR-0016](../design/decisions/ADR-0016-codex-trigger-eval.md).
