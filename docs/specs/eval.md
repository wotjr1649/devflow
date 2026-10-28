# 평가 계약

## eval

트리거 eval(`claude plugin eval . --tag trigger --no-publish`)은 스킬 목록이 바뀐 사이클에서만 돌린다. BASE..HEAD로 판별한다.

- 돌린다: `skills/*/SKILL.md` frontmatter의 호출 필드(`name`, `description`, `when_to_use`, `paths`,
  `disable-model-invocation`, `user-invocable`)가 바뀌었거나, 스킬을 더하거나 지우거나 이름을 바꿨거나, `evals/trigger/`가
  바뀌었을 때.
- 돌리지 않는다: 스킬 본문, references, 훅, 에이전트, AGENTS.md만 바뀌었을 때. eval 실행은 격리되어 대상 플러그인만
  로드되고, 호스트는 스킬 목록만 보고 자동 호출을 정하므로 이 변경은 결과를 바꾸지 않는다([host-facts](../research/host-facts.md)).
- 스킬 본문의 변경은 리뷰와 사이클 지표(개입, 오탐, 차단)로 본다. 개입이 늘거나 같은 실수가 반복되면 결과 eval 장치를 만드는
  Issue를 연다. 지금 있는 결과 eval은 아래 "결과 eval" 절의 pr-review-workflow 보고 결함 측정 하나다(#99).
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
  설치된 스킬 해시·전역 지침 해시·스킬 목록 해시와 CODEX_HOME 구분·식별값·설치 위치가 모두 같을 때 미실행 시도만 실행한다.
  기록된 시도를 재실행하지 않는다. 이 세 값이 없는 #73 이전 결과는 이어 실행하지 않고 파일도 바꾸지 않는다.
- `gpt-6.1-sol/high`, 사례당 300초다. 모델·effort·시간 제한·측정 대상·예산을 바꾸기 전에 사용자가 결정한다.
- 사용자의 실제 CODEX_HOME에서 돈다. 결과의 `codexHome`은 실경로가 `~/.codex`와 같으면 `default`, 아니면 `override`이고,
  `codexHomeId`는 그 실경로의 sha256이다. `override` 결과는 이 계약의 공식 측정이 아니며, marketplace 이름만으로 공식 조건을
  주장하지 않는다. 호스트가 평소 싣는 전역 지침·활성 플러그인·system 스킬이 그대로 들어가며,
  설정 파일은 바꾸지 않는다. 명령행으로 `--sandbox read-only`와 모델·effort를 고정하고 `--ephemeral`로 세션을 남기지 않는다.
  자식에게는 CODEX_HOME과 실행에 필요한 최소 환경 변수만 넘긴다. 작업 폴더는 모델에게 `<cwd>`로 보이므로 사례 폴더는
  이 저장소 밖 OS 임시 폴더에 위치 번호만 담은 이름(`cx-*/t01`)으로 만든다. 명령행 `-c project_root_markers=[]`로
  상위 폴더의 AGENTS.md도 싣지 않는다. 훅은 평소처럼 켜 두며, devflow 훅은 devflow 저장소 밖에서 출력이 없다.
  임시 폴더는 신뢰하지 않은 폴더지만 codex-cli 0.160.0은 쓸 수 있는 실행에서만 새 폴더의 신뢰를 기록하므로
  read-only 실행은 전역 config.toml을 바꾸지 않는다. 사전 검사도 read-only로 고정하고, 임시 폴더가 이 저장소 안이면 멈춘다.
  평소 사용과의 차이는 쓰기 차단이다.
- 측정 대상은 호스트가 실제로 싣는 플러그인이다. 모델 호출 전 `codex debug prompt-input`으로 devflow 7개 스킬이 목록에 있는지
  확인하고 목록 전체를 결과에 남긴다. 같은 출력의 한 skill 블록(Skill roots 표와 목록)에서 7개 스킬의 위치가 각각 한 줄씩
  같은 폴더를 가리키고, 그 폴더가 이 CODEX_HOME의 `plugins/cache/<marketplace>/devflow/<저장소 plugin 버전>/skills`이며
  home부터 링크 없이 그 안에 있어야 한다. 그 위치(home 기준 상대 경로)를 결과의 `installed`에 남기고, 그 설치본의 `skills/`·
  `references/`가 저장소와 바이트 단위로 다르면 비용 없이 멈춘다. 이 중 하나라도 맞지 않으면 모델 호출 전에 멈춘다.
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

## 결과 eval

pr-review-workflow의 반복 보고 결함이 skill 본문 후보에서 줄었는지를, 같은 사례·같은 순서·같은 반복 수로 기준선과 후보를 돌려
비교한다(#99). 트리거 eval의 계약·점수·임계값은 바꾸지 않는다. 수동 opt-in이며 기본 검사·CI·pre-push는 모델을 실행하지 않는다.
CI는 `tests/behavior-eval.test.js`(사례·fixture·실행표·귀속·판정 계산)만 돌린다.

```bash
node bin/devflow-behavior-eval prepare --run <name> --arm A=<기준선 rev> --arm B=<후보 rev> --expect-diff skills/pr-review-workflow/SKILL.md --budget <group> [--budget-usd <상한> --budget-tokens <상한>] [--cases <id,...>] (--pilot | --calibration <record>)
node bin/devflow-behavior-eval run --run <name> --host claude|codex
node bin/devflow-behavior-eval calibrate --run <name> --host claude|codex --anchors <file>
node bin/devflow-behavior-eval summary --run <name>
```

- 사례: `evals/behavior/<id>/`
  - `prompt.md`의 frontmatter tag는 `[behavior, <host>, <id>]`다.
  - `graders/*.md`는 llm grader이고, 그중 `task.md`는 과업 수행 확인이다.
  - 그 밖에 `fixture/project/`, `case.yaml`, `scaffold.sh`가 있다.
  - fixture는 공개 가능한 합성 자료이며 prompt의 입력 목록과 파일이 같다. fixture 안의 `.gitignore`와 상관없이 모든 파일을 추적한다.
- arm: 고정 revision의 추적 파일만 `git archive`로 뽑는다. 두 arm의 차이가 `--expect-diff` 목록과 다르면 멈춘다. 사례·grader는 실행기를
  부른 커밋(평가 묶음) 하나에서 뽑고, 이 묶음과 실행기는 커밋된 상태여야 한다. `.work/behavior-eval/<run>/manifest.json`에 해시를 남긴다.
  이어 실행은 미실행 슬롯만 한다. 실행기·실행표·모델 설정·arm·사례·shim 전체·bash가 바뀌었으면 멈춘다.
  Codex profile과 전역 지침은 그 run의 첫 Codex 호출 때 값과 같아야 하고, actor·judge 호출마다 다시 확인한다.
- 관문 미달 grader의 재판정(`prepare --adjudicate <case/grader,...>`, 사용자 결정으로만): 그 grader가 어떤 보정 기록에서 유효 양성을 모두 검출한 경우에만
  준비를 허용한다. 본 실행에서 그 셀의 judge 양성은 두 검수자가 독립 확인해 run의 `adjudication.json`에 일치한 판정을 남기고, 없거나 엇갈리면
  undetermined다. judge 음성은 그대로 쓴다. `summary`는 바뀐 슬롯을 `adjudicated`로 보고한다.
- 보정(`calibrate`): 앵커 파일의 각 앵커(사례, 본문, grader별 라벨)를 본 실행과 같은 grader·judge로 판정한다. Claude는 claude-haiku-5-5가 앵커를
  그대로 출력하게 하고(출력이 앵커와 다르면 그 표본은 invalid), Codex는 슬롯과 같은 judge 함수 3표다. 앵커마다 결과 파일을 남기고, 기록은
  표본마다 앵커·결과 파일의 해시를 담는다.
- 채택 run은 실행기에 고정된 필수 사례·명제 목록(holdout `h1-claude`·`h1-codex`의 D1·D2·D3 포함)이 모두 있어야 준비된다.
  모든 grader는 보정 기록을 통과해야 한다. 기록에는 grader 해시와 표본마다 라벨·판정·표본 해시가 있다. 실행기는 그 표본에서
  양·음성 각 5개 이상, 검출률 80%, 일치율 90% 이상을 다시 계산한다. pilot은 보정 없이 기계적 동작만 확인하며 채택 판정을 내지 않는다.
- 실행표: 사례마다 ABBA 7블록으로 arm별 14슬롯을 만든다. pilot은 사례마다 arm별 1슬롯이며 채택 판정에 쓰지 않는다.
- Claude: 사례 폴더와 arm만 담은 shim plugin을 대상으로 슬롯마다 다음을 실행한다.
  - 명령: `claude plugin eval <shim> --case <id> --runs 1 --ablation none --threshold 0 --scaffold --keep-temp --no-publish --trust-plugin --model claude-opus-5-5 --judge-model claude-sonnet-5-5 --max-cost-usd <잔여> --json`
  - scaffold는 `CLAUDE_CODE_GIT_BASH_PATH`와 PATH 앞에 둔 Git for Windows bash로 `project/`와 `plugin/`을 만든다.
  - 사용자 로그인을 상속한 사용자 터미널(Herdr pane 포함)에서 돌린다. 인증을 복사하거나 바꾸지 않는다.
  - 결과 JSON이 한 사례·한 실행·사례의 grader 수와 다르거나, 오류·비정상 종료·비용 미상이면 그 슬롯을 invalid로 두고 멈춘다.
  - trace를 결과 폴더로 옮긴 뒤 남긴 임시 폴더를 지운다. 실패하면 남기고 멈춘다.
- Codex: 저장소 밖 임시 폴더에 같은 `project/`·`plugin/`을 node로 복사한다.
  - 명령은 트리거 eval과 같다: `codex exec` read-only, gpt-6.1-sol/high, 최소 환경 변수.
  - 판정은 같은 criteria로 `codex exec` judge를 3회 돌려 2표 이상을 따른다. 입력 개수(B4 D2, K1)와 기록 명령(B6 D5)에는 결정론
    보조 표지가 있고, 표지와 판정이 다르면 그 명제는 undetermined다. 정상 종료한 judge만 투표한다. actor stdout은 검수용으로
    결과 폴더에 둔다.
  - CODEX_HOME에 다른 devflow가 설치돼 있어도 된다. 결과에는 실사용 여부(`default`·`override`)를 남긴다.
- 귀속: 다음을 모두 만족할 때만 유효하다.
  - actor가 실행 폴더의 `plugin/skills/pr-review-workflow/SKILL.md`와 prompt에 나열된 project 입력을 모두 전문 읽었다.
  - 실행 폴더 밖은 어떤 경로도 건드리지 않았다.
  - 읽기의 증거: Claude는 성공한 tool_result가 있는 offset·limit 없는 Read, Codex는 성공한 명령 출력이 파일 전문(prompt의 JSON 전송
    또는 원문)과 같은 것이다.
  - 경로를 입증할 수 없는 명령(변수, 식 평가, 폴더 이동, `~`, UNC, 환경 변수 확장)이나 실행 폴더 밖 절대 경로, `..`가 있으면 invalid다.
- 판정 부류(슬롯×명제)
  - positive·negative·invalid·undetermined로 나눈다. 과업 grader가 FAIL이면 invalid, 판정이 없으면 undetermined다.
  - 실행 오류, 시간 초과, 응답 없음, 귀속 실패도 invalid다.
  - 실행 폴더의 파일이 하나라도 바뀌면 invalid이고 전체 실행을 멈춘다.
  - 대체하지 않는다.
- 채택(`summary`)
  - 모든 셀의 양 arm 14슬롯이 있어야 한다.
  - 수정 셀과 반대 조건 셀은 전부 valid여야 한다.
  - 수정 셀은 명제마다 후보 ≤ 기준선이고, 합은 엄격히 작아야 한다.
  - 회귀 셀은 후보의 invalid·undetermined를 positive로 세어도 후보 ≤ 기준선이어야 한다.
  - 반대 조건은 후보 ≤ 기준선이고 2/14 이하여야 한다.
  - 0건 셀의 상한은 유효 판정 수 n의 단측 95% 정확 이항 상한이다(행 독립 가정). 채택은 회귀 부재나 해소의 증명이 아니다.
- 예산
  - 승인된 예산마다 그룹(`.work/behavior-eval/budgets/<group>.json`)을 두고, 상한은 만들 때 고정한다. 그 그룹을 쓰는 모든 run의
    Claude `costUsd`+`judgeCostUsd`와 Codex actor·judge 사용량을 호출이 끝날 때마다 누적한다.
  - run은 prepare 때 그룹 하나에 묶인다. 한 그룹은 잠금 파일로 한 번에 한 run만 쓴다.
  - 사용량을 알 수 없으면 멈춘다. 유료 호출 전에 그룹에 진행 표지를 남기고, 사용량을 기록할 때 지운다. 프로세스 종료를 확인하지
    못하면 표지를 남긴다. 표지가 남은 그룹은 그 호출의 종료와 사용량을 확인하기 전에는 어떤 run도 시작하지 않는다.
  - 한 슬롯은 도중에 끊을 수 없으므로, 남은 예산이 지금까지 본 가장 큰 슬롯의 두 배(최소 Claude $1, Codex 20만 토큰)보다 작으면
    다음 슬롯을 시작하지 않는다. 이 규칙으로도 진행 중인 슬롯의 초과는 완전히 막지 못한다.
- 보존
  - 판정·집계·해시는 `.work/behavior-eval/`(git이 무시)에 둔다.
  - 응답 원문과 trace는 판정·검수 동안만 같은 곳에 두고, Issue를 마칠 때 지운다.
  - 공개 텍스트에는 집계와 결론만 쓰고 응답을 인용하지 않는다.

실행 방식과 대안의 이유: [ADR-0029](../design/decisions/ADR-0029-behavior-eval.md).
