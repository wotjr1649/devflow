# 호스트 사실

구현에 필요한 Claude Code·Codex 동작을 공식 문서와 실제 설치본에서 확인한 대로 적는다. 확인한 버전은
Claude Code 2.1.286, codex-cli 0.159.1이다. 버전이 오르면 바뀔 수 있으므로, 이 문서와 실제 동작이 다르면
[sources](sources.md)의 원문을 다시 확인하고 이 문서를 고친다.

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
- 플러그인 루트의 `bin/`은 Bash 도구의 PATH에 들어간다. `workflows/`의 스크립트는 `/<plugin>:<meta.name>`으로 실행된다.
- 경로 변수: `${CLAUDE_PLUGIN_ROOT}`(설치본 위치, 버전마다 바뀜), `${CLAUDE_PLUGIN_DATA}`(업데이트를 넘어 유지).
- 플러그인 루트의 `CLAUDE.md`는 로드되지 않는다. 검증은 `claude plugin validate <dir>`로 한다.

**플러그인 에이전트**
- 지원하는 필드: `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`,
  `background`, `omitClaudeMd`, `isolation: worktree`, `color`
- 무시하는 필드: `permissionMode`, `hooks`, `mcpServers`, `initialPrompt`
- `agents/review/x.md`처럼 하위 폴더에 두면 이름이 `<plugin>:review:x`가 된다.

**서브에이전트**
- `AskUserQuestion`은 모든 서브에이전트에서 제거된다.
- 재개: `SendMessage`로 보내면 대화 기록 전체와 호출 시 지정한 모델이 유지된다. 내장 Explore·Plan은 재개할 수 없다.
- 모델은 호출의 `model` 파라미터, 정의의 `model`, `CLAUDE_CODE_SUBAGENT_MODEL`, 메인 모델 순으로 정해진다. effort는
  정의의 `effort`로만 정하고 호출할 때 바꾸는 방법은 없다.
- `SendMessage`가 있는 서브에이전트에게는 `main`과 이름 붙은 에이전트 목록이 주어진다(v2.1.206+).
- 중첩은 기본 3단계까지(`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), 동시 실행은 20개까지다.
- 대화형 세션에서는 기본이 백그라운드 실행이고, 백그라운드에서는 쓸 수 있는 도구가 줄어든다.

**compact**
- 다시 주입되는 것: 프로젝트 루트 CLAUDE.md, 자동 메모리, plan mode의 계획
- 최근에 다룬 파일을 최대 5개까지 다시 읽는다. 5,000토큰이 넘는 파일은 경로만 남는다.
- `compact` 매처가 있는 SessionStart 훅의 출력은 compact된 컨텍스트에 추가된다.

**effort**
- Opus 5.5와 Sonnet 5.5는 `low`~`max`를 지원하고 기본은 `medium`이다. Haiku 4.5는 effort를 지원하지 않는다.
- 메인 세션에서 effort를 바꾸면 캐시가 무효화된다.

**플러그인 eval** (v2.1.269+)
- `claude plugin eval init`으로 케이스를 만들고 `claude plugin eval .`으로 돌린다.
- 케이스마다 플러그인 있을 때와 없을 때 각 3회씩 실행한다. `tool_used: Skill` 판정 기준으로 트리거를 잰다.
- 결과는 `evals/results/`에 저장되고, 사용량을 소모한다.

**Workflows**
- 중간에 사용자 입력을 받지 않는다. 동시 에이전트는 기본 16개까지다.

**훅**
- PreToolUse 명령이 exit code 2로 끝나면 동작이 막히고 stderr가 Claude에게 전달된다. 다른 non-zero exit와 시간
  초과(기본 600초)는 막지 않고 그대로 진행한다.
- 맥락을 넣을 때는 `hookSpecificOutput.additionalContext`를 쓴다. SessionStart의 값은 문자열마다 10,000자까지이고,
  넘으면 파일로 저장된 뒤 경로와 앞 2,000자만 들어간다.
- Stop과 SubagentStop은 decision `block`과 reason(또는 exit 2)으로 종료를 막는다. 입력의 `stop_hook_active`로 반복을
  막는다. JSON에서 decision이 놓이는 위치는 구현할 때 문서 예제로 확인한다.
- Windows에서 command 훅은 Git Bash가 있으면 Bash, 없으면 PowerShell로 돈다. `shell` 필드로 고를 수 있고, 두
  플랫폼에서 같이 쓰는 훅은 `args`를 쓰는 exec form을 권한다.

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

**플러그인**
- `.codex-plugin/plugin.json`에 `skills`, `hooks`, `interface`를 둔다.
- 마켓플레이스는 `.agents/plugins/marketplace.json`이다.
- 플러그인에 넣을 수 있는 것은 스킬, MCP 서버, 브라우저 확장, 훅이다. 문서에 에이전트 항목은 없다.
- CLI에서는 `/plugins`로 설치하고, 새 세션을 시작해야 반영된다.

**훅**
- 이벤트: SessionStart, PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, UserPromptSubmit,
  SubagentStart, SubagentStop, Stop
- SessionStart 매처는 `startup|resume|clear|compact`다. 출력 맥락의 양은 `additionalContextLimit`로 제한한다.
- 도구 매칭: 셸은 `Bash`, `apply_patch`는 `apply_patch`·`Edit`·`Write`, `spawn_agent`는 `Agent`로 매칭된다.
- 차단은 `hookSpecificOutput.permissionDecision: "deny"`로 한다.
- 플러그인 훅은 사용자가 검토하고 신뢰해야 실행된다. 문서는 도구 훅을 "완전한 경계가 아닌 가드레일"로 설명한다.

**서브에이전트**
- 직접 요청하거나, AGENTS.md나 스킬 지시가 요청할 때 띄운다.
- 내장 에이전트는 `default`, `worker`, `explorer`다.
- 커스텀 에이전트는 `~/.codex/agents/*.toml` 또는 `.codex/agents/*.toml`에 둔다. 필수 항목은 `name`, `description`,
  `developer_instructions`이고, `model`, `model_reasoning_effort`, `sandbox_mode`도 쓸 수 있다.
- 서브에이전트는 부모의 sandbox를 물려받는다.
- 띄울 때 지정한 값이 `agents.default_subagent_model`과 `agents.default_subagent_reasoning_effort`보다 우선한다.
  동시 스레드 상한은 `agents.max_concurrent_threads_per_session`이다.
- 문서는 커스텀 에이전트를 이름으로 고를 수 있고, 내장 에이전트와 이름이 같으면 커스텀이 우선한다고 한다. 반대로
  `spawn_agent`로는 고를 수 없다는 이슈(openai/codex#33244)도 있어서 실제 동작은 확인이 필요하다.
- 실행 중인 서브에이전트를 조정, 중지, 닫을 수 있다. 끝난 에이전트에 후속 작업을 보내는 방법은 문서에 자세히 없다.

## 참고 구현

ponytail 4.9.0이 두 호스트 패키징을 실제로 돌리고 있다.

- `.claude-plugin/plugin.json`(`hooks` 경로 지정)
- `.codex-plugin/plugin.json`(`skills: "./skills/"`, `hooks`, `interface`)
- `.agents/plugins/marketplace.json`(`source{source:"url", url, ref}`, `policy`, `category`)
- `hooks/claude-codex-hooks.json`과 Node 런타임: 출력은 `hookSpecificOutput{hookEventName, additionalContext}`
