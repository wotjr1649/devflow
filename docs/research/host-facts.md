# 호스트 사실

구현에 필요한 Claude Code·Codex 동작을 공식 문서와 실제 설치본에서 확인한 대로 적는다. 처음 확인한
버전은 Claude Code 2.1.286, codex-cli 0.159.1이고, 그 뒤의 관찰은 항목에 날짜를 적고, 버전이 중요한 항목은 버전도
적는다(예: 2026-10-01은 codex-cli 0.159.3, 2026-10-03은 0.160.0). "(관찰 날짜)"가 붙은 항목은 버릴 임시 저장소나 설치본에서 실제로 돌려 본
결과다. 버전이 오르면 바뀔 수 있으므로, 이 문서와 실제 동작이 다르면
[sources](sources.md)의 원문을 다시 확인하고 이 문서를 고친다.

## gh와 GitHub 자격 증명 (2026-10-02)

- `GH_TOKEN`, `GITHUB_TOKEN` 순으로 저장된 자격 증명보다 우선한다. `GH_CONFIG_DIR`의 Windows 기본값은
  `%AppData%\GitHub CLI`다([gh environment](https://cli.github.com/manual/gh_help_environment)).
- keyring은 `GH_CONFIG_DIR`마다 나뉘지 않는다([cli/cli#14370](https://github.com/cli/cli/issues/14370)). 그래서
  config 폴더를 나눠도 같은 OS 사용자의 프로세스는 같은 토큰을 꺼낼 수 있다.
- `gh auth setup-git`을 한 기기에서는 git이 github.com에 `gh auth git-credential`로 인증해 push도 gh 토큰을 쓴다. 이
  기기에는 그와 별도로 Windows 자격 증명 관리자에 GCM의 `git:https://github.com` 항목도 있었다.
- `gh api --include`는 상태 줄, 헤더, 빈 줄을 CRLF로 나눈다. OAuth·classic 토큰이면 GraphQL 응답에도
  `X-Oauth-Scopes`(범위 목록)와 `X-Oauth-Client-Id`가 있다.

## Claude Code

**지침 로드**
- 작업 폴더와 그 위쪽에 `CLAUDE.md`·`.claude/CLAUDE.md`·`CLAUDE.local.md`가 없으면 `AGENTS.md`를 읽는다(기본 설정
  `claude-md-or-agents-md`). `~/.claude/CLAUDE.md`, managed CLAUDE.md, `.claude/rules/`는 이 판단에 들어가지 않고
  함께 로드된다.
- 직접 읽기는 2.1.277부터 지원한다. 2.1.276 이하에서 업그레이드한 직후 첫 세션은 읽지 못할 수 있다.
- `AGENTS.md`와 `.claude/AGENTS.md`를 읽는다. `AGENTS.override.md`, `AGENTS.local.md`, `.agents/` 아래는 읽지 않는다
  (Codex와 다르다).
- 설정으로 직접 읽은 `AGENTS.md`에서는 InstructionsLoaded 훅이 발화하지 않는다. `CLAUDE.md`가 import한
  `AGENTS.md`에서는 발화한다.
- 설정으로 직접 읽은 `AGENTS.md` 안의 `@` import가 작업 폴더 밖을 가리키면, 그 프로젝트에서 외부 import를 이미
  승인했을 때만 묻지 않고 로드된다. `CLAUDE.md`의 같은 import는 승인 창을 띄운다.
- 서브에이전트도 같은 지침을 로드한다. 내장 Explore·Plan과 `omitClaudeMd: true`인 에이전트는 예외다.

**스킬**
- frontmatter: `name`, `description`, `when_to_use`, `disable-model-invocation`, `user-invocable`, `allowed-tools`,
  `disallowed-tools`, `model`, `effort`, `context: fork`, `agent`, `background`, `hooks`, `paths`, `shell`, `metadata`,
  `license`, `compatibility`. 모르는 필드는 오류 없이 무시한다.
- `paths`는 자동 호출을 그 glob에 맞는 파일을 다룰 때로 제한한다. 호출을 보장하지 않는다. 직접 호출(`/name`)은 막지 않는다.
- 스킬 본문에서 `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PROJECT_DIR}`를 치환한다. Codex는 경로 변수를
  치환한다는 문서가 없고 스킬 파일 경로를 알려 주므로, 두 호스트가 읽는 스킬은 상대 링크를 쓴다.
- 스킬 목록 예산은 컨텍스트의 1%이고, 항목 하나(description + when_to_use)는 1,536자에서 잘린다. 넘치면 덜 쓰는
  스킬의 description부터 뺀다.
- compact 뒤 스킬 목록은 다시 붙지 않는다. 호출했던 스킬 본문은 스킬마다 앞 5,000토큰, 합계 25,000토큰까지 다시 붙는다.
- 플러그인 스킬은 `skillOverrides`의 영향을 받지 않는다. 사용하지 않는 스킬은 `/skill-doctor`로 찾는다.

**플러그인**
- 매니페스트는 `.claude-plugin/plugin.json`이고 `name`만 필수다. 구성 요소는 `<plugin>:<name>`으로 이름이 붙는다.
- `marketplace.json`: `name`, `owner{name,email}`, `plugins[{name, description, source}]`. `source: "./"`로 마켓플레이스
  루트를 플러그인으로 가리킬 수 있다.
- 로컬 디렉터리 마켓플레이스의 상대 경로 플러그인은 제자리에서 로드된다. 수정은 `/reload-plugins`로 반영되고 버전을
  올릴 필요가 없다. `--plugin-dir`은 그 세션에서만 같은 이름의 설치본을 대체한다.
- 관찰(2026-10-01): 세션 도중 사용자 범위로 설치한 플러그인은 그 세션에서 `/reload-plugins`를 실행하면 스킬과 에이전트가
  바로 쓸 수 있게 된다. 그 전에는 이름으로 불러도 "Unknown skill"이다.
- 관찰(2026-10-01, 임시 `CLAUDE_CONFIG_DIR`): `source: "./"`로 설치하면 `plugins/cache/<marketplace>/<plugin>/<version>/`에
  복사본(`.git` 제외, ignore된 비공개 폴더 포함)이 생기고 `installPath`도 그곳을 가리킨다. 그래도 세션 훅이 받는
  `CLAUDE_PLUGIN_ROOT`는 원본 폴더라서 로드는 제자리다. 임시 설정 폴더에서는 인증 없이 설치할 수 있고, 인증 없는
  `claude -p`도 실패하기 전에 SessionStart 훅을 실행한다. `--debug`를 붙이면 설정 폴더의 `debug/`에 훅 출력과
  `provided additionalContext (<n> chars)`가 남아서, 모델 호출 없이 SessionStart 훅을 확인할 수 있다.
- 관찰(2026-10-01, 사용자 범위 설치본): SessionStart 훅의 맥락은 세션 기록에 `hook_additional_context` 첨부로 들어가고
  화면에는 나오지 않는다. 확인은 세션 기록에서 한다.
- 플러그인 루트의 `bin/`은 Bash 도구의 PATH에 들어간다. `workflows/`의 스크립트는 `/<plugin>:<meta.name>`으로 실행된다.
- 경로 변수: `${CLAUDE_PLUGIN_ROOT}`(설치본 위치, 버전마다 바뀜), `${CLAUDE_PLUGIN_DATA}`(업데이트를 넘어 유지).
- 플러그인 루트의 `CLAUDE.md`는 로드되지 않는다. 검증은 `claude plugin validate <dir>`로 한다.
- `claude --plugin-dir . plugin list --json`은 모델을 부르지 않고 `devflow@inline`(범위 `session`)으로 로드를 보여 준다(2026-10-01).

**훅 실행 환경(관찰)**
- macOS GitHub 실행기의 Node 22에서 훅이 `fs.readFileSync(0)`으로 210KB 입력을 읽다가 80회 중 3회 끝나지 않았다(기계 정지 없음,
  #37). 같은 빠른 경로의 큰 파이프 입력 결함이 Node에 보고되어 있다([nodejs/node#66341](https://github.com/nodejs/node/issues/66341)).
  훅은 스트림으로 읽는다.

**플러그인 에이전트**
- 지원하는 필드: `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`,
  `background`, `omitClaudeMd`, `isolation: worktree`, `color`
- 무시하는 필드: `permissionMode`, `hooks`, `mcpServers`, `initialPrompt`
- worktree 격리는 Agent 호출마다 `isolation: "worktree"`로도 준다. 격리 worktree는 `.claude/worktrees/` 아래 새 브랜치로,
  기본은 원격 기본 브랜치에서 갈라지고(`worktree.baseRef: "head"` 설정이면 지금 HEAD), 바뀐 것이 없으면 지워지고 바뀐 것이
  있으면 남는다([Subagents](https://code.claude.com/docs/en/sub-agents), [Worktrees](https://code.claude.com/docs/en/worktrees)).
  이 저장소에서 서브에이전트 worktree를 만든 뒤 공용 `core.hooksPath`가 `.githooks`에서 메인 체크아웃의 절대 경로로
  바뀌어 있었다(#28, 2026-10-03 관찰, 문서에는 없음). 격리 서브에이전트가 도는 동안에는 부모 세션과 다른 서브에이전트의
  기록 `gitBranch`가 주 작업 트리의 실제 브랜치가 아니라 그 서브에이전트 worktree의 브랜치였다(#29, 같은 날 관찰).
- `agents/review/x.md`처럼 하위 폴더에 두면 이름이 `<plugin>:review:x`가 된다.
- 호출의 `subagent_type`과 실행 기록의 `agentType`도 `devflow:implementer`처럼 플러그인 이름이 붙는다. 에이전트 종류로
  거르는 다른 플러그인의 훅(예: ponytail의 `PONYTAIL_SUBAGENT_MATCHER`)도 이 이름을 본다(2026-10-01).

**서브에이전트**
- `AskUserQuestion`은 모든 서브에이전트에서 제거된다.
- 재개: `SendMessage`로 보내면 대화 기록 전체와 호출 시 지정한 모델이 유지된다. 내장 Explore·Plan은 재개할 수 없다.
- 모델은 호출의 `model` 파라미터, 정의의 `model`, `CLAUDE_CODE_SUBAGENT_MODEL`, 메인 모델 순으로 정해진다. effort는
  정의의 `effort`로만 정하고 호출할 때 바꾸는 방법은 없다.
- `SendMessage`가 있는 서브에이전트에게는 `main`과 이름 붙은 에이전트 목록이 주어진다(v2.1.206+).
- 중첩은 기본 3단계까지(`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), 동시 실행은 20개까지다.
- 대화형 세션에서는 기본이 백그라운드 실행이고, 백그라운드에서는 쓸 수 있는 도구가 줄어든다.
- 실행 기록은 `~/.claude/projects/<프로젝트>/<세션>/subagents/agent-<id>.jsonl`이다. 줄마다 실제 모델(`message.model`)과
  `effort`·`perTurnEffort`가 있고, 옆의 `.meta.json`에 `agentType`, 요청한 `model`, `spawnDepth`가 있다(2026-10-01).
  `prompt_snapshot` 항목의 `tools`가 실제로 받은 도구 목록이고, `instructions` 항목이 로드된 지침 파일 목록이다.
  플러그인 에이전트의 `tools`에 그 세션에 없는 도구(꺼진 `PowerShell`)를 적으면 오류 없이 빠진다.

**세션 기록** (2026-10-02, v2.1.286, 측정 계약은 [metrics](../specs/metrics.md))
- 위치는 `~/.claude/projects/<세션을 시작한 경로의 영숫자 밖 문자를 -로>/<세션>.jsonl`이다. 세션 안에서 worktree로 들어가도
  같은 파일에 남는다. 레코드마다 `cwd`와 `gitBranch`가 있다. `gitBranch`는 세션의 작업 트리 브랜치를 따르고 셸의 `cwd`는
  따르지 않았다.
- assistant 응답은 스트리밍 조각마다 같은 `message.id`로 여러 줄 남고, 줄마다 `usage`가 같다. `input_tokens`는 캐시분을
  빼고, 추론 토큰은 `usage.output_tokens_details.thinking_tokens`에 있다. 사용자가 중단한 자리에는 model이 `<synthetic>`인
  메시지가 남는다.
- 메인 턴은 `system/turn_duration`(`durationMs`)으로 남는다. `cost-state`(모델별 누적)는 종료한 세션에만 있고, 기록에
  응답으로 없는 호출(자리 비움 요약, 제목 생성 등)을 포함한다.

**compact**
- 다시 주입되는 것: 프로젝트 루트 CLAUDE.md, 자동 메모리, plan mode의 계획
- 설정으로 직접 읽은 상위 폴더의 AGENTS.md도 다시 들어간다. 내장 `agents-md` 플러그인이 엔진이 컨텍스트를 만들 때마다
  디스크에서 AGENTS.md를 찾아 `project` 지침으로 넣고, 이 재계산은 compact와 `/clear` 뒤에도 일어난다. 하위 폴더의
  AGENTS.md는 그 폴더의 파일을 다시 Read할 때 붙는다.
- 최근에 다룬 파일을 최대 5개까지 다시 읽는다. 5,000토큰이 넘는 파일은 경로만 남는다.
- `compact` 매처가 있는 SessionStart 훅의 출력은 compact된 컨텍스트에 추가된다.

**effort**
- Opus 5.5와 Sonnet 5.5는 `low`~`max`를 지원하고 기본은 `medium`이다. Haiku 4.5는 effort를 지원하지 않는다.
- 메인 세션에서 effort를 바꾸면 캐시가 무효화된다.

**플러그인 eval** (v2.1.269+)
- `claude plugin eval init`으로 케이스를 만들고 `claude plugin eval .`으로 돌린다.
- 케이스마다 플러그인 있을 때와 없을 때 각 3회씩 실행한다. `tool_used: Skill` 판정 기준으로 트리거를 잰다.
- 결과는 `evals/results/`에 저장되고, 사용량을 소모한다. 계정이 지원하면 HTML 리포트(점수, 프롬프트, 판정)를 기본으로
  claude.ai에 게시하고, `--no-publish`를 주면 로컬에만 둔다(2.1.289 `--help`, 2026-10-05).
- 각 실행은 격리된다. 대상 플러그인만 로드되고 사용자 설정, 훅, CLAUDE.md, 다른 플러그인, 메모리, 개인 스킬은 없다.
  그래서 개인 스킬 사본을 끄지 않아도 그 사본이 없는 상태로 잰다. 하위 실행은 사용자의 인증으로 돌므로, 인증 변수가
  지워지는 세션 안에서는 "Not logged in"으로 멈춘다(2026-10-01).
- 실행이 실패해도 `min: 0`, `max: 0`인 `tool_used` 판정은 통과로 채점된다. 불리면 안 되는 케이스의 결과는 오류가 난
  실행을 빼고 읽는다(2026-10-01).
- 격리 실행에도 호스트 내장 스킬(`code-review`, `verify`, `debug` 등)은 있다. 대상 스킬이 안 불린 실행은 내장 스킬로
  갔을 수 있으므로, 설명을 고치기 전에 실행 기록을 본다. 실행 기록은 `--keep-temp`를 줘야 남고(`out/trace.jsonl`),
  `aggregate-result.json`에는 어떤 스킬이 불렸는지와 실행 모델이 남지 않는다(2026-10-01).

**Workflows**
- 중간에 사용자 입력을 받지 않는다. 동시 에이전트는 기본 16개까지다.

**훅**
- PreToolUse 명령이 exit code 2로 끝나면 동작이 막히고 stderr가 Claude에게 전달된다. 다른 non-zero exit와 시간
  초과(기본 600초)는 막지 않고 그대로 진행한다.
- 맥락을 넣을 때는 `hookSpecificOutput.additionalContext`를 쓴다. SessionStart의 값은 문자열마다 10,000자까지이고,
  넘으면 파일로 저장된 뒤 경로와 앞 2,000자만 들어간다.
- Stop과 SubagentStop은 decision `block`과 reason(또는 exit 2)으로 종료를 막는다. 입력의 `stop_hook_active`로 반복을
  막는다. `decision`과 `reason`은 `hookSpecificOutput` 안이 아니라 최상위에 둔다. 입력에는 `stop_reason`과
  `last_assistant_message`도 있고, 마지막 응답은 늦을 수 있는 트랜스크립트 대신 이 값으로 읽는다.
- Windows에서 command 훅은 Git Bash가 있으면 Bash, 없으면 PowerShell로 돈다. `shell` 필드로 고를 수 있고, 두
  플랫폼에서 같이 쓰는 훅은 `args`를 쓰는 exec form을 권한다.
- SessionEnd는 세션이 끝날 때(`/clear`, `/resume` 포함) 돈다. 입력은 `session_id`, `cwd`, `reason`(clear, resume, logout,
  prompt_input_exit, other)이다. 막을 수 없고, 모든 SessionEnd 훅이 합쳐 1.5초 안에 끝나야 한다(긴 timeout을 주면 60초까지
  늘어난다). 플러그인 매니페스트의 `hooks`(파일 경로, 인라인, 배열)는 기본 `hooks/hooks.json`에 합쳐진다(2026-10-03 문서).
- 세션 id(2026-10-03 실측): Bash의 `CLAUDE_CODE_SESSION_ID`는 그 세션 기록 파일 이름(= 훅의 `session_id`)과 같다. 문서에 없는
  변수다. 서브에이전트의 셸도 부모와 같은 값을 갖는다(문서: 서브에이전트는 부모 session_id로 돌고 훅 입력에 `agent_id`가
  붙는다). Bash와 훅에는 `CLAUDE_CODE_CHILD_SESSION=1`이 붙는다.
- PreToolUse가 보는 셸 도구는 `Bash`와 `PowerShell`(설정으로 켜는 Windows 도구, 입력은 같은 `tool_input.command`)이다.
  MCP 도구는 `mcp__<server>__<tool>`, 플러그인 MCP는 `mcp__plugin_<plugin>_<server>__<tool>`, claude.ai 커넥터는
  `mcp__claude_ai_<server>__<tool>`이다. matcher에 문자·숫자·`_`·`-`·공백·`,`·`|` 밖의 글자가 있으면 고정되지 않은 JS 정규식이다.
- 권한 문서는 Bash 규칙이 명령 텍스트를 맞출 뿐 프로그램 둘레의 보안 경계가 아니라고 한다(`bash -c`, 절대 경로는 지나감).
  OS sandbox는 macOS, Linux, WSL2만 지원하고 네이티브 Windows는 지원하지 않는다.
- Windows에서는 기본으로 Bash·PowerShell·훅 하위 프로세스 환경에서 `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
  `ANTHROPIC_OAUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`을 지운다(`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`). 그래서 세션 안에서
  띄운 `claude -p`는 인증이 없다. 모델을 부르는 확인은 사용자 터미널에서 한다.
- 세션 환경에 `CLAUDE_CODE_SESSION_ATTENDED`가 있지만 문서에 없다. 그래서 devflow는 무인 구간을 장부의 모드로만 판단한다.

**sandbox** (2026-10-02, [sandboxing](https://code.claude.com/docs/en/sandboxing))
- macOS, Linux, WSL2에서 동작하고, 네이티브 Windows에서는 명령이 sandbox 없이 돈다.
- 네트워크는 프록시의 `allowedDomains`(처음엔 비어 있음)로 허용한다. 하위 프로세스도 같은 제한을 받는다.
- `excludedCommands`는 sandbox 밖에서 전체 권한으로 돈다. 명령 텍스트로 맞추고, 연결된 명령은 모두 맞아야 한다.
  리다이렉트, `cd`, `$(...)`가 있으면 호출 전체가 sandbox 안에 남는다.
- `credentials.files`와 `envVars`로 자격 증명 파일 읽기와 환경 변수를 막을 수 있다.
- 훅은 부모 환경을 물려받는다(OTEL 변수 제외). SessionStart 훅은 `CLAUDE_ENV_FILE`로 이후 Bash 명령의 환경 변수를 정한다
  ([hooks](https://code.claude.com/docs/en/hooks)). 훅과 sandbox의 관계는 문서에 없다.

## Codex

**AGENTS.md**
- 전역(`~/.codex/AGENTS.override.md`가 있으면 그것, 없으면 `AGENTS.md`)을 먼저 읽는다.
- 그다음 프로젝트 루트부터 작업 폴더까지 폴더마다 하나씩 이어 붙인다.
- 합계 크기는 `project_doc_max_bytes`로 제한된다. 기본은 32KiB이고, 소유자는 64KiB로 설정해 두었다.

**스킬**
- 위치: 작업 폴더부터 저장소 루트까지의 `.agents/skills`, `$HOME/.agents/skills`, `/etc/codex/skills`, 내장 스킬.
  심볼릭 링크를 따라간다.
- `name`과 `description`이 필수다. description이 맞으면 묵시적으로 호출한다.
- 초기 목록은 컨텍스트의 2% 또는 8,000자까지다. 넘치면 description을 먼저 줄이고, 그래도 넘치면 스킬을 뺀다.
- `agents/openai.yaml`: `interface`(표시용), `policy.allow_implicit_invocation`(기본 `true`), `dependencies`.
- 끄려면 `config.toml`의 `[[skills.config]]`에 `enabled = false`를 둔다.
- Claude 전용 frontmatter(`when_to_use`, `allowed-tools`, `model`, `effort`, `context`, `agent`, `hooks`, `paths` 등)가 있어도
  오류 없이 목록에 `name`과 `description`으로 올라온다(2026-10-01).

**확인 도구와 셸**
- `codex debug prompt-input`은 모델을 부르지 않고 모델이 받을 입력을 JSON으로 보여 준다. 스킬 목록과 지침 로드를 이것으로 확인한다.
- `codex debug models`는 모델별 effort를 보여 준다. `gpt-6-luna`는 `low`~`max`(`xhigh` 포함)이고 기본은 `medium`이다(2026-10-01).
- Windows에서 환경 맥락의 셸은 `powershell`로 표시되고, 명령은 PowerShell 7(`pwsh.exe -Command`)로 실행된다. 이 기기의
  기준 셸은 PowerShell 7.6.6이다(2026-10-01).
- 기본 sandbox(`workspace-write`)는 명령의 네트워크를 막아 `gh`를 부르는 `devflow-state`가 실패한다. 소유자 설정은
  `danger-full-access`라 해당하지 않는다(2026-10-01).
- 신뢰하지 않은 폴더에서 `codex exec`를 돌리면 전역 `config.toml`에 그 폴더의 `trust_level = "trusted"` 항목이 생길 수
  있다(2026-10-01). 0.160.0 원본은 신뢰가 미정이고 실행이 작업 폴더에 쓸 수 있을 때만 기록한다
  ([thread_processor.rs](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/app-server/src/request_processors/thread_processor.rs)).
  `--sandbox read-only` 실행은 기록하지 않는다(#39에서 실행 전후 config.toml 해시로 확인). 작업 폴더 경로는 환경 맥락의
  `<cwd>`로 모델에게 그대로 보인다(#39, `debug prompt-input`).
- Git Bash에서 `codex exec`는 stdin이 열려 있으면 시작하지 않고 기다릴 수 있다. `< /dev/null`로 닫는다.
- 이 기기의 pwsh 7은 외부 명령의 출력을 변수나 파이프로 받을 때 콘솔 인코딩(`ks_c_5601-1987`)으로 읽어 UTF-8 한글이
  깨진다. 직접 출력은 그대로다. 받아야 하면 먼저 `[Console]::OutputEncoding = [Text.UTF8Encoding]::new()`를 둔다(2026-10-01).

**플러그인**
- `.codex-plugin/plugin.json`에 `skills`, `hooks`, `interface`를 둔다.
- 마켓플레이스는 `.agents/plugins/marketplace.json`이다. 같은 저장소의 플러그인은
  `source: {"source": "local", "path": "./..."}`로 가리키고, `policy`의 `installation`과 `authentication`이 필수다.
- 설치하면 `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`으로 복사된다. `.git`과 ignore된 비공개 폴더까지
  작업 트리 전체가 들어간다(2026-10-01, 임시 `CODEX_HOME`. 마켓플레이스 등록과 설치는 인증 없이 된다). `CODEX_HOME`이
  원본 폴더 안에 있으면 복사가 자기 자신을 다시 복사해 끝나지 않는다.
- 작업 폴더의 마켓플레이스는 자동으로 잡히지 않는다. `codex plugin marketplace list`에 나오려면
  `codex plugin marketplace add <root>`로 등록해야 한다(2026-10-01).
- 플러그인에 넣을 수 있는 것은 스킬, MCP 서버, 브라우저 확장, 훅이다. 문서에 에이전트 항목은 없다.
- CLI에서는 `/plugins`로 설치하고, 새 세션을 시작해야 반영된다. 셸에서는 `codex plugin add <plugin>@<marketplace>`로도
  설치된다(0.159.3). 이미 설치된 플러그인도 `codex plugin add devflow@devflow < /dev/null`로 다시 설치하면 캐시가 배포
  worktree와 같아진다(2026-10-03, 0.160.0, 다섯 번). worktree를 마켓플레이스로 등록하면 캐시의 `.git`은 그 worktree의 gitdir을 가리키는 파일이다.
- 훅 신뢰는 `config.toml`의 `[hooks.state."<plugin>@<marketplace>:<훅 파일>:<이벤트>:<i>:<j>"]`에 `trusted_hash`로
  남는다. 관찰(2026-10-01): `hooks.json` 항목은 그대로 두고 훅이 실행하는 스크립트만 바꿔 다시 설치하자, 다시 묻지
  않고 새 스크립트가 실행됐다. 신뢰는 명령 줄에 묶이고 그 명령이 부르는 파일 내용에는 묶이지 않는다.
- 관찰(2026-10-01, 설치본): 신뢰한 SessionStart 훅의 `additionalContext`는 세션 기록에 `developer` 메시지로 들어가고
  화면에는 나오지 않는다. 훅이 받는 `CLAUDE_PLUGIN_ROOT`는 원본이 아니라 캐시 복사본이다. PreToolUse 차단은 셸
  명령에서 동작했다. `--dangerously-bypass-hook-trust`는 그 실행에서만 신뢰 없이 훅을 돌린다.

**훅**
- 이벤트: SessionStart, SessionEnd, PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, UserPromptSubmit,
  SubagentStart, SubagentStop, Stop, Interrupt
- SessionEnd(2026-10-04, [hooks](https://learn.chatgpt.com/docs/hooks), 0.160.0 원본
  [session_end.rs](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/hooks/src/events/session_end.rs)): 입력의
  `session_id`는 thread id이고 `reason`은 언제나 `other`다. 기본 1초, 최대 3초이며 `async`여도 동기로 돈다. 서브에이전트에서는
  돌지 않고 막을 수 없다. 세션 런타임을 닫을 때(`shutdown_session_runtime`)만 돈다. 관찰(2026-10-04, 0.160.0, `codex exec`,
  훅 신뢰 뒤): `devflow-state`로 Issue에 쓴 thread가 실행이 끝나자 `sessions.json`에서 빠졌다. TUI `/clear`는 새 thread를
  시작하는데, 이전 thread를 닫는지는 원본에서 찾지 못했고 관찰하지 않았다. 0.144 이하에는 이 이벤트가 없고, 훅 파일의 모르는
  이벤트 키는 무시된다(`HookEventsToml`에 `deny_unknown_fields`가 없다).
- SessionStart 매처는 `startup|resume|clear|compact`다. 출력 맥락의 양은 `additionalContextLimit`로 제한한다.
- 도구 매칭: 셸(`exec_command` 포함)은 `Bash`, `apply_patch`는 `apply_patch`·`Edit`·`Write`, `spawn_agent`는 `Agent`로
  매칭된다. MCP 도구는 Claude와 같은 `mcp__<server>__<tool>`이고 PreToolUse로 막을 수 있다.
- 차단은 `hookSpecificOutput.permissionDecision: "deny"`로 한다.
- Stop 출력은 Claude와 같이 최상위 `decision: "block"`과 `reason`(또는 exit 2와 stderr)이다. 다만 턴을 거부하는 것이
  아니라 reason으로 새 이어가기 프롬프트를 만든다. 입력은 `turn_id`, `stop_hook_active`, `last_assistant_message`다.
- 플러그인 훅의 경로 변수는 `PLUGIN_ROOT`, `PLUGIN_DATA`이고, 호환용으로 `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`도 준다.
- 세션 id(2026-10-03 실측, `codex exec`): 셸에 `CODEX_THREAD_ID`와 `CODEX_SESSION_ID`가 같은 값으로 있다. Claude 안에서
  띄우면 Claude의 변수도 물려받는다.
- `apply_patch`의 PreToolUse 입력은 셸과 같은 `tool_input.command`에 패치 문자열이 든다.
- 명령은 문자열만 받는다(Claude의 `args` exec form이 없다). `PLUGIN_ROOT`는 문자열 치환 없이 환경 변수로만 넘어온다.
- Windows에서 훅 명령을 어떤 셸이 실행하는지는 문서에 없다. Windows 전용 명령은 `commandWindows`로 따로 줄 수 있다.
  0.160.0 원본의 [build_hooks_config](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/core/src/session/mod.rs)는
  thread의 셸에서 훅 실행 인자를 얻는다. 그래서 devflow는 셸이 해석할 문법이 없는
  `node -e "require(process.env.CLAUDE_PLUGIN_ROOT+'/...').main()"`을 두 호스트에 같이 쓴다. 이 명령은 cmd, pwsh 7,
  Git Bash에서 같은 결과를 낸다(2026-10-01). 따옴표로 감싼 절대 실행 경로를 PowerShell에서 호출할 때 `&`가 없으면
  ParserError로 실패했고, `&`를 넣으면 평가 guard의 허용·차단 및 감사 기록이 동작했다(#38, 2026-10-04 로컬 관찰).
- `codex debug prompt-input`에는 SessionStart 훅의 출력이 나오지 않는다(신뢰하지 않은 플러그인 훅, 2026-10-01).
- 플러그인 훅은 사용자가 검토하고 신뢰해야 실행된다. 문서는 도구 훅을 "완전한 경계가 아닌 가드레일"로 설명한다.

**서브에이전트**
- 직접 요청하거나, AGENTS.md나 스킬 지시가 요청할 때 띄운다.
- 내장 에이전트는 `default`, `worker`, `explorer`다.
- 커스텀 에이전트는 `~/.codex/agents/*.toml` 또는 `.codex/agents/*.toml`에 둔다. 필수 항목은 `name`, `description`,
  `developer_instructions`이고, `model`, `model_reasoning_effort`, `sandbox_mode`도 쓸 수 있다.
- 서브에이전트는 부모의 sandbox를 물려받는다.
- 띄울 때 지정한 값이 `agents.default_subagent_model`과 `agents.default_subagent_reasoning_effort`보다 우선한다.
  다만 0.160.0의 `spawn_agent` 도구 설명은 서브에이전트가 기본으로 현재 모델을 물려받으며 "사용자가 명시적으로 다른 모델을
  요청하지 않으면 `model`을 정하지 말라"고 한다(2026-10-04, 설치된 바이너리의 문자열). 지시서의 모델 지정을 따르는지는 확인하지 않았다.
  동시 스레드 상한은 `agents.max_concurrent_threads_per_session`이다.
- 문서는 커스텀 에이전트를 이름으로 고를 수 있고, 내장 에이전트와 이름이 같으면 커스텀이 우선한다고 한다.
- 실행 중인 서브에이전트를 조정, 중지, 닫을 수 있다.
- 관찰(2026-10-01, 프로젝트 `.codex/agents/*.toml`): 커스텀 에이전트를 이름으로 고를 수 있고, 정의의 `model`과
  `model_reasoning_effort`가 적용된다. `sandbox_mode = "read-only"`는 적용되지 않았다. 부모의 `workspace-write`를 그대로
  물려받아 파일 쓰기가 성공했다. 끝난 에이전트에 후속 작업을 보내면 같은 에이전트가 이어서 받는다.
- 실행 기록: `~/.codex/sessions/`의 rollout에서 `session_meta.source.subagent.thread_spawn`이 부모 스레드, 깊이,
  `agent_role`을 담는다. 모델과 effort는 턴마다 `turn_context.model`과 `turn_context.effort`에 있다.

**세션 기록** (2026-10-02, 측정 계약은 [metrics](../specs/metrics.md))
- rollout은 시작일 폴더(`sessions/YYYY/MM/DD/`)와 `archived_sessions/`에 있다. 브랜치는 `session_meta.git`(시작 값)에만 있고
  서브에이전트 rollout에는 없다. `cwd`는 `session_meta`와 `turn_context`에 있다.
- 0.159는 응답마다 `token_usage_record`(`response_id`, `usage`, `thread_token_usage`)를 남기고, `usage`가
  `thread_token_usage` 증가분과 같다. 0.146에는 이 레코드가 없고 `token_count`만 있다. `input_tokens`는 캐시분을 포함한다.
  부모의 누적값에는 서브에이전트 사용량이 들어가지 않았다.
- 쓰기 시점(원본 `rust-v0.160.0`의 `codex-rs/rollout/src/recorder.rs`, 2026-10-03): 레코드를 추가할 때마다 한 줄씩 쓰고
  flush한다(BufWriter와 fsync는 없다). 레코드의 `timestamp`는 쓰는 순간의 시각이다. 그래서 측정 시각 이전 레코드는 이미
  파일에 있다. 새 세션만 첫 persist 전까지 파일을 만들지 않고 레코드를 메모리에 둔다. 실제 세션(0.159.3, #5)에서도 턴
  안에서 돈 측정 명령이 자기 응답의 `token_usage_record`까지 읽었다.
- Windows에서 rollout 파일의 수정 시각은 생성 시각에 머문다(2026-10-03, 파일 5개, 마지막 레코드는 최대 1시간 40분 뒤).
  원본은 새 파일을 열 때 수정 시각을 직접 설정한다. 수정 시각으로 기록이 새로 쓰였는지 판단할 수 없다.
- 도구 호출은 `response_item`의 `custom_tool_call`(`exec`)로 남는다. `exec` 한 번이 여러 명령을 묶을 수 있다.
- Windows에서 `codex exec -s read-only` 안의 git 명령은 저장소 소유자 검사(`safe.directory`)로 실패했다.

**셸 환경과 sandbox** (2026-10-02, [config reference](https://learn.chatgpt.com/docs/config-file/config-reference))
- `shell_environment_policy`: `inherit`(all, core, none), `set`, 필터. 기본적으로 이름에 KEY, SECRET, TOKEN이 든
  변수를 뺀다.
- `sandbox_mode`(read-only, workspace-write, danger-full-access), `sandbox_workspace_write.network_access`,
  `windows.sandbox`(unelevated, elevated, mxc). 훅이 sandbox 안에서 도는지는 문서에 없다.
- 이 기기의 Codex는 `danger-full-access`와 `approval_policy = "never"`로 돈다.

## 참고 구현

ponytail 4.9.0이 두 호스트 패키징을 실제로 돌리고 있다.

- `.claude-plugin/plugin.json`(`hooks` 경로 지정)
- `.codex-plugin/plugin.json`(`skills: "./skills/"`, `hooks`, `interface`)
- `.agents/plugins/marketplace.json`(`source{source:"url", url, ref}`, `policy`, `category`)
- `hooks/claude-codex-hooks.json`과 Node 런타임: 출력은 `hookSpecificOutput{hookEventName, additionalContext}`
