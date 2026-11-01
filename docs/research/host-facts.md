# Host facts

Claude Code and Codex behavior that the implementation needs, recorded as confirmed in the official documentation and in
real installations. The first versions checked were Claude Code 2.1.286 and codex-cli 0.159.1. Later observations carry
a date, and entries where the version matters carry the version too (for example, 2026-10-01 is codex-cli 0.159.3 and
2026-10-03 is 0.160.0). An entry marked "(observation date)" is a result actually run in a throwaway repository or
installation. Behavior can change when versions rise, so if this document differs from actual behavior, check the
original in [sources](sources.md) again and fix this document.

## gh and GitHub credentials (2026-10-02)

- `GH_TOKEN`, then `GITHUB_TOKEN`, take precedence over stored credentials. The Windows default of `GH_CONFIG_DIR` is
  `%AppData%\GitHub CLI` ([gh environment](https://cli.github.com/manual/gh_help_environment)).
- The keyring is not split per `GH_CONFIG_DIR` ([cli/cli#14370](https://github.com/cli/cli/issues/14370)). So even with
  separate config folders, processes of the same OS user can retrieve the same token.
- On a machine where `gh auth setup-git` was run, git authenticates to github.com through `gh auth git-credential`, so
  push also uses the gh token.
- `gh api --include` separates the status line, headers and blank line with CRLF. With an OAuth or classic token, even a
  GraphQL response carries `X-Oauth-Scopes` (the scope list) and `X-Oauth-Client-Id`.

## Claude Code

**Instruction loading**
- If no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` exists in the working folder or above it, `AGENTS.md` is
  read (default setting `claude-md-or-agents-md`). `~/.claude/CLAUDE.md`, managed CLAUDE.md and `.claude/rules/` do not
  enter this decision and are loaded alongside.
- Direct reading is supported from 2.1.277. The first session right after upgrading from 2.1.276 or earlier may not
  read it.
- It reads `AGENTS.md` and `.claude/AGENTS.md`. It does not read `AGENTS.override.md`, `AGENTS.local.md` or anything
  under `.agents/` (unlike Codex).
- The InstructionsLoaded hook does not fire for an `AGENTS.md` read directly through the setting. It fires for an
  `AGENTS.md` imported by `CLAUDE.md`.
- If an `@` import inside an `AGENTS.md` read directly through the setting points outside the working folder, it loads
  without asking only when the project has already approved external imports. The same import in `CLAUDE.md` raises an
  approval dialog.
- Subagents load the same instructions. The built-in Explore and Plan, and agents with `omitClaudeMd: true`, are
  exceptions.

**Skills**
- Frontmatter: `name`, `description`, `when_to_use`, `disable-model-invocation`, `user-invocable`, `allowed-tools`,
  `disallowed-tools`, `model`, `effort`, `context: fork`, `agent`, `background`, `hooks`, `paths`, `shell`, `metadata`,
  `license`, `compatibility`. Unknown fields are ignored without error.
- `paths` limits automatic invocation to when files matching the glob are being handled. It does not guarantee
  invocation. It does not block direct invocation (`/name`).
- In a skill body, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PROJECT_DIR}` are substituted. Codex has
  no documented path-variable substitution and tells the model the skill file path, so skills read by both hosts use
  relative links.
- The skill listing budget is 1% of the context, and one entry (description + when_to_use) is cut at 1,536 characters.
  When it overflows, descriptions of the least-used skills are dropped first.
- The skill listing is not re-attached after compact. The bodies of skills that were invoked are re-attached, the first
  5,000 tokens of each skill up to 25,000 tokens in total.
- Plugin skills are not affected by `skillOverrides`. Find unused skills with `/skill-doctor`.

**Plugins**
- The manifest is `.claude-plugin/plugin.json` and only `name` is required. Components are named `<plugin>:<name>`.
- `marketplace.json`: `name`, `owner{name,email}`, `plugins[{name, description, source}]`. `source: "./"` can point a
  plugin at the marketplace root, so the root itself is the plugin.
- A relative-path plugin in a local directory marketplace is loaded in place. Edits take effect with `/reload-plugins`
  and the version need not be raised. `--plugin-dir` replaces an installed copy of the same name for that session only.
- Observation (2026-10-01): for a plugin installed at user scope in the middle of a session, running `/reload-plugins`
  in that session makes its skills and agents usable at once. Before that, calling them by name gives "Unknown skill".
- Observation (2026-10-01, temporary `CLAUDE_CONFIG_DIR`): installing with `source: "./"` creates a copy (excluding
  `.git`, including ignored private folders) under `plugins/cache/<marketplace>/<plugin>/<version>/`, and `installPath`
  also points there. Even so, the `CLAUDE_PLUGIN_ROOT` that a session hook receives is the original folder, so loading is
  in place. In a temporary config folder, installation works without authentication, and `claude -p` without
  authentication also runs the SessionStart hook before failing. With `--debug`, the hook output and
  `provided additionalContext (<n> chars)` are left in `debug/` of the config folder, so the SessionStart hook can be
  checked without a model call.
- Observation (2026-10-01, user-scope installation): the SessionStart hook's context enters the session record as a
  `hook_additional_context` attachment and does not appear on screen. Check it in the session record.
- `bin/` at the plugin root is added to the Bash tool's PATH.
- Path variables: `${CLAUDE_PLUGIN_ROOT}` (installed location, changes with each version), `${CLAUDE_PLUGIN_DATA}`
  (persists across updates).
- `CLAUDE.md` at the plugin root is not loaded. Validate with `claude plugin validate <dir>`.
- `claude --plugin-dir . plugin list --json` shows the load as `devflow@inline` (scope `session`) without calling the
  model (2026-10-01).

**Hook execution environment (observation)**
- On Node 22 of a macOS GitHub runner, a hook reading 210KB of input with `fs.readFileSync(0)` did not finish in 3 of 80
  runs (no machine stall). A defect of this fast path with large piped input has been reported against Node
  ([nodejs/node#66341](https://github.com/nodejs/node/issues/66341)). Hooks read as a stream.

**Plugin agents**
- Supported fields: `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`,
  `background`, `omitClaudeMd`, `isolation: worktree`, `color`
- Ignored fields: `permissionMode`, `hooks`, `mcpServers`, `initialPrompt`
- Worktree isolation can also be given per Agent call as `isolation: "worktree"`. The isolated worktree is a new branch
  under `.claude/worktrees/`, by default branched from the remote default branch (from the current HEAD if
  `worktree.baseRef: "head"` is set); it is removed if nothing changed and kept if something changed
  ([Subagents](https://code.claude.com/docs/en/sub-agents), [Worktrees](https://code.claude.com/docs/en/worktrees)).
  Observation (2026-10-03): after a subagent worktree was created, the shared `core.hooksPath` had changed from
  `.githooks` to an absolute path of the main checkout. While an isolated subagent was running, the recorded `gitBranch`
  of the parent session and of other subagents was the branch of that subagent worktree, not the real branch of the main
  work tree. Do not attribute work by the recorded branch alone. Neither is documented behavior.
- Placing an agent in a subfolder such as `agents/review/x.md` names it `<plugin>:review:x`.
- The call's `subagent_type` and the run record's `agentType` also carry the plugin name, as in `devflow:implementer`.
  Hooks of other plugins that filter by agent type (for example ponytail's `PONYTAIL_SUBAGENT_MATCHER`) also see this
  name (2026-10-01).

**Subagents**
- `AskUserQuestion` is removed from all subagents.
- Resume: sending with `SendMessage` keeps the whole conversation history and the model given at the call. The built-in
  Explore and Plan cannot be resumed.
- The model is decided in this order: the call's `model` parameter (aliases only), the definition's `model`,
  `CLAUDE_CODE_SUBAGENT_MODEL`, the main model. Effort is in this order: `CLAUDE_CODE_EFFORT_LEVEL`, the call's `effort`
  (v2.1.292+, not for fork, kept after resume), the definition's `effort` (2026-11-01,
  [sub-agents](https://code.claude.com/docs/en/sub-agents)).
- `ultrathink` raises only a turn typed directly in the terminal to `xhigh` (v2.1.311+, not on Bedrock). Observation
  (2026-11-01, v2.1.316, haiku): placed in a subagent prompt, the run record's `effort` and `perTurnEffort` stayed at
  the definition's `medium` and no extra instruction was attached.
- Observation (2026-11-01, v2.1.316): six call `model` and `effort` combinations (explorer+haiku,
  explorer+haiku+`high`, explorer+sonnet, explorer+`high`, implementer+opus+`high`, reviewer+sonnet) all matched the run
  record's `message.model` and `effort`. The call's `effort` took precedence over the definition's `effort`. Each
  combination was checked once, with a small task of counting files.
- A subagent that has `SendMessage` is given `main` and a list of named agents (v2.1.206+).
- Nesting is up to 3 levels by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), and up to 20 run concurrently.
- In an interactive session, the default is background execution, and in the background fewer tools are available.
- The run record is `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`. Each line has the actual model
  (`message.model`) and `effort` and `perTurnEffort`, and the adjacent `.meta.json` has `agentType`, the requested
  `model` and `spawnDepth` (2026-10-01). The `tools` of the `prompt_snapshot` entry is the list of tools actually
  received, and the `instructions` entry is the list of loaded instruction files. If a plugin agent's `tools` names a
  tool absent from that session (a disabled `PowerShell`), it is dropped without error.

**compact**
- Re-injected: the project root CLAUDE.md, auto memory, the plan of plan mode
- An AGENTS.md of a parent folder read directly through the setting is also re-inserted. The built-in `agents-md` plugin
  finds AGENTS.md on disk each time the engine builds the context and inserts it as `project` instructions, and this
  recomputation also happens after compact and `/clear`. An AGENTS.md in a subfolder is attached when a file of that
  folder is read again.
- Up to 5 recently handled files are read again. A file over 5,000 tokens leaves only its path.
- The output of a SessionStart hook with a `compact` matcher is added to the compacted context.

**effort**
- Opus 5.5, Sonnet 5.5 and Haiku 5.5 support `low` to `max`, and the default is `medium`. Haiku 4.5 does not support
  effort. If an unsupported level is chosen, the highest supported level below it is used (2026-11-01).
- The aliases `haiku`, `sonnet`, `opus` and `fable` resolve to the latest version on the Anthropic API and to an earlier
  version on Bedrock, Google Cloud and Foundry (for example `haiku` -> Haiku 4.5). An alias of the same family as the
  main model runs as the main's exact model (2026-11-01, [model-config](https://code.claude.com/docs/en/model-config)).
- Changing effort in the main session invalidates the cache.

**Plugin eval** (v2.1.269+)
- Create cases with `claude plugin eval init` and run with `claude plugin eval .`.
- Each case runs 3 times with the plugin and 3 times without. The trigger is measured on the `tool_used: Skill` verdict.
- Results are saved in `evals/results/`, and the run consumes usage. If the account supports it, an HTML report (scores,
  prompts, verdicts) is published to claude.ai by default, and `--no-publish` keeps it local (2.1.289 `--help`,
  2026-10-05).
- Each run is isolated. Only the target plugin is loaded, with no user settings, hooks, CLAUDE.md, other plugins, memory
  or personal skills. So even without turning off a personal copy of a skill, it is measured without that copy. Child
  runs use the user's authentication, so inside a session where authentication variables are removed they stop with
  "Not logged in" (2026-10-01).
- The graders are `regex`, `tool_used`, `tool_order`, `file_exists`, `llm` and `baseline`. The `input_match` of
  `tool_used` matches against the JSON string of the tool input. Observation (2026-11-01, 2.1.316, test plugin):
  `tool: Read` graded the reference path that was read, and a Windows path was escaped like
  `"file_path":"D:\\...\\references\\target.md"`, so the pattern `[\\/]+` matched. In a 2-arm run the Skill grader was
  dropped from the score, and the Read grader was scored on both arms and failed on the arm without the plugin (use
  `arm: with-only` to keep only the metric). One run cost about 0.05 dollars with sonnet
  ([plugin evals](https://code.claude.com/docs/en/plugin-evals)).
- A new pane opened in a terminal multiplexer such as herdr inherits authentication, so eval and `claude -p` run
  (2026-11-01).
- Observation (2026-11-02, 2.1.316): `claude plugin eval .` also found plugin copies in an ignored folder
  (`.work/plugin-test/`) under the target path and ran the cases of those copies that matched `--tag`. Confirmed from the
  result JSON's `suite.plugins` and the case `dir`.
- Even when a run fails, a `tool_used` verdict with `min: 0` and `max: 0` is scored as a pass. Read the result of a case
  that must not be invoked with the errored runs excluded (2026-10-01).
- Host built-in skills (`code-review`, `verify`, `debug` and so on) exist even in an isolated run. A run in which the
  target skill was not invoked may have gone to a built-in skill, so look at the run record before changing the
  description. The run record is kept only with `--keep-temp` (`out/trace.jsonl`), and `aggregate-result.json` does not
  record which skill was invoked or the run model (2026-10-01). On Windows the kept folder cannot be locked by
  permissions, so every run prints a warning. Anything outside `out/` and `config/` may have been written by the
  evaluated target, so do not run commands such as git in that area, and delete the folder after reading `out/` (2.1.289,
  2026-10-05).

**Hooks**

- When a PreToolUse command ends with exit code 2, the action is blocked and stderr is passed to Claude. Other non-zero
  exits and a timeout (default 600 seconds) do not block and proceed as is. devflow does not register this event.
- To add context, use `hookSpecificOutput.additionalContext`. A SessionStart value is limited to 10,000 characters per
  string; beyond that it is saved to a file and only the path and the first 2,000 characters are inserted.
- Stop prevents ending with decision `block` and a reason (or exit 2). The input's `stop_hook_active` prevents loops.
  `decision` and `reason` go at the top level, not inside `hookSpecificOutput`. The input also has `stop_reason` and
  `last_assistant_message`, and the last response is read from this value instead of the transcript, which can be late.
- On Windows, a command hook runs with Bash if Git Bash exists and with PowerShell otherwise. The `shell` field can
  choose, and for a hook used on both platforms the exec form using `args` is recommended.
- SessionEnd runs when a session ends (including `/clear` and `/resume`). The input is `session_id`, `cwd` and `reason`
  (clear, resume, logout, prompt_input_exit, other). It cannot block, and all SessionEnd hooks together must finish
  within 1.5 seconds (a long timeout extends this up to 60 seconds). The plugin manifest's `hooks` (file path, inline,
  array) are merged into the default `hooks/hooks.json` (2026-10-03 documentation).
- Session id (2026-10-03 measurement): Bash's `CLAUDE_CODE_SESSION_ID` equals the session record file name (= the hook's
  `session_id`). It is a variable absent from the documentation. A subagent's shell has the same value as the parent
  (documentation: a subagent runs with the parent's session_id and `agent_id` is added to the hook input). Bash and
  hooks get `CLAUDE_CODE_CHILD_SESSION=1`.

- The permissions documentation says a Bash rule matches command text and is not a security boundary around the program
  (`bash -c` and absolute paths pass through). The OS sandbox supports only macOS, Linux and WSL2, and not native
  Windows.
- On Windows, by default the environment of Bash, PowerShell and hook subprocesses has `ANTHROPIC_API_KEY`,
  `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN` and `CLAUDE_CODE_OAUTH_TOKEN` removed
  (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`). So a `claude -p` started inside a session has no authentication. Run checks that
  call the model in the user's terminal.
- The session environment has `CLAUDE_CODE_SESSION_ATTENDED`, but it is not documented. So devflow judges an unattended
  stretch only by the ledger's mode.

**sandbox** (2026-10-02, [sandboxing](https://code.claude.com/docs/en/sandboxing))
- It works on macOS, Linux and WSL2, and on native Windows commands run without a sandbox.
- The network is allowed through the proxy's `allowedDomains` (empty at first). Subprocesses are under the same
  restriction.
- `excludedCommands` run outside the sandbox with full permissions. They match by command text, and all chained commands
  must match. With a redirect, `cd` or `$(...)`, the whole call stays inside the sandbox.
- `credentials.files` and `envVars` can block reading credential files and environment variables.
- Hooks inherit the parent environment (except OTEL variables). A SessionStart hook sets the environment variables of
  later Bash commands through `CLAUDE_ENV_FILE` ([hooks](https://code.claude.com/docs/en/hooks)). The documentation does
  not cover the relation between hooks and the sandbox.

## Codex

**AGENTS.md**
- The global one is read first (`~/.codex/AGENTS.override.md` if it exists, otherwise `AGENTS.md`).
- Then one per folder is appended, from the project root down to the working folder.
- The total size is limited by `project_doc_max_bytes`. The default is 32KiB.

**Skills**
- Locations: `.agents/skills` from the working folder up to the repository root, `$HOME/.agents/skills`,
  `/etc/codex/skills`, and built-in skills. Symbolic links are followed.
- `name` and `description` are required. If the description matches, the skill is invoked implicitly.
- The initial listing is up to 2% of the context or 8,000 characters. When it overflows, descriptions are shortened
  first, and if it still overflows, skills are dropped.
- `agents/openai.yaml`: `interface` (for display), `policy.allow_implicit_invocation` (default `true`), `dependencies`.
- To turn one off, put `enabled = false` under `[[skills.config]]` in `config.toml`.
- Even with Claude-only frontmatter (`when_to_use`, `allowed-tools`, `model`, `effort`, `context`, `agent`, `hooks`,
  `paths` and so on), the skill is listed with `name` and `description` without error (2026-10-01).

**Inspection tools and shell**
- `codex debug prompt-input` shows, as JSON and without calling the model, the input the model would receive. Use it to
  check the skill listing and instruction loading.
- `codex debug models` shows the effort per model. `gpt-6-luna` supports `low` to `max` (including `xhigh`) and its
  default is `medium` (2026-10-01).
- Observation (2026-10-01, codex-cli 0.159.3, PowerShell 7.6.6): the shell in the Windows environment context was shown
  as `powershell`, and commands ran with PowerShell 7 (`pwsh.exe -Command`). Do not extend this observation to a
  guarantee about the child shell in other versions or execution paths.
- Observation (2026-10-01, codex-cli 0.159.3): because of the command network restriction of the default sandbox
  (`workspace-write`), `devflow-state`, which calls `gh`, failed.
- Running `codex exec` in an untrusted folder can add a `trust_level = "trusted"` entry for that folder to the global
  `config.toml` (2026-10-01). The 0.160.0 source records it only when trust is undecided and the run can write to the
  working folder
  ([thread_processor.rs](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/app-server/src/request_processors/thread_processor.rs)).
  A `--sandbox read-only` run does not record it (0.160.0, checked with the hash of config.toml before and after the
  run). The working folder path is shown to the model as it is, as `<cwd>` in the environment context (0.160.0,
  `debug prompt-input`).
- In Git Bash, `codex exec` may wait without starting if stdin is open. Close it with `< /dev/null`.
- Observation (2026-10-01, codex-cli 0.159.3, PowerShell 7.6.6): when the output of an external command was received
  into a variable or a pipe, it was read in the console encoding (`ks_c_5601-1987`) and UTF-8 Korean was garbled, while
  direct output was intact. If it must be received, first set `[Console]::OutputEncoding = [Text.UTF8Encoding]::new()`.
  Do not generalize this observation to every PowerShell environment.
- Observation (2026-10-14, Codex 0.162.1 normal TUI): the `Get-Content` output of a Korean link anchor was corrupted and
  matched the result of encoding the original as CP949 and decoding it as UTF-8. The actual child shell version and the
  process that chose the encoding were not captured. Comparing a JSON string with non-ASCII escaped in an explicit
  PowerShell 7.6.6 matched the original. In a diagnostic that also specified the same `pwsh.exe` and `login=false` in the
  normal TUI, child shell major 7 and a full match with the original were confirmed. Follow the procedure in
  [Windows shell and read output](../local-development.md#windows-shell-and-read-output). Keep environment correction and skill
  efficiency improvement separate.

**Plugins**
- Put `skills`, `hooks` and `interface` in `.codex-plugin/plugin.json`.
- The marketplace is `.agents/plugins/marketplace.json`. A plugin in the same repository is pointed at with
  `source: {"source": "local", "path": "./..."}`, and `installation` and `authentication` under `policy` are required.
- Installing copies to `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`. The whole work tree goes in,
  including `.git` and ignored private folders (2026-10-01, temporary `CODEX_HOME`; marketplace registration and
  installation work without authentication). If `CODEX_HOME` is inside the original folder, the copy copies itself again
  and never finishes.
- A marketplace in the working folder is not picked up automatically. To appear in `codex plugin marketplace list`, it
  must be registered with `codex plugin marketplace add <root>` (2026-10-01).
- What a plugin can contain is skills, MCP servers, browser extensions and hooks. The documentation has no agents item.
- In the CLI, install with `/plugins` and start a new session for it to take effect. From the shell,
  `codex plugin add <plugin>@<marketplace>` also installs (0.159.3). Observation (2026-10-03, 0.160.0, five times):
  reinstalling the same plugin made the cache equal to the deployment worktree. If a worktree is registered as the
  marketplace, the cache's `.git` is a file pointing to that worktree's gitdir. For the current development install
  command, follow [Running and testing a local development build](../local-development.md#installing-and-running-codex).
- Hook trust is recorded as `trusted_hash` in
  `[hooks.state."<plugin>@<marketplace>:<hook file>:<event>:<i>:<j>"]` of `config.toml`. Observation (2026-10-01): when
  the `hooks.json` entry was left as is and only the script the hook runs was changed and reinstalled, the new script
  ran without asking again. Trust is bound to the command line and not to the contents of the files that command calls.
- Observation (2026-10-01, installed copy): the `additionalContext` of a trusted SessionStart hook enters the session
  record as a `developer` message and does not appear on screen. The `CLAUDE_PLUGIN_ROOT` the hook receives is the cache
  copy, not the original. `--dangerously-bypass-hook-trust` runs hooks without trust for that run only.

**Hooks**
- The hooks covered in this document are SessionStart, Stop and SessionEnd. The product's registered events and scope are
  set by the [common hook contract](../specs/hooks.md#registered-events).
- SessionEnd (2026-10-04, [hooks](https://learn.chatgpt.com/docs/hooks), 0.160.0 source
  [session_end.rs](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/hooks/src/events/session_end.rs)): the
  input's `session_id` is the thread id and `reason` is always `other`. The default is 1 second and the maximum 3
  seconds, and it runs synchronously even if `async`. It does not run in subagents and cannot block. It runs only when
  the session runtime is closed (`shutdown_session_runtime`). Observation (2026-10-04, 0.160.0, `codex exec`, after hook
  trust): the thread that wrote to an Issue through `devflow-state` was gone from `sessions.json` after the run ended.
  Observation (2026-10-05, 0.160.0, user TUI): after recording in a linked worktree and then running `/clear` directly,
  the previous thread's entry did not disappear at once, and other sessions were also preserved. In the source,
  `app/event_dispatch.rs` -> `app/session_lifecycle.rs` ->
  [app/voice_owner.rs](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/tui/src/app/voice_owner.rs) starts a
  new thread and sends `thread_unsubscribe` to the previous thread. Unsubscribing is not a shutdown that runs
  SessionEnd at once ([hooks documentation](https://learn.chatgpt.com/docs/hooks#sessionend)). The new SessionStart
  input does not carry the previous thread id. Observation (2026-10-05, 0.160.0, user TUI): in a test where the thread
  ran `/clear` after finishing its own `note` and `release`, that thread's entry was removed and a separately working
  session remained. Keep this separate from the direct `/clear` test. This event does not exist in 0.144 and below, and
  unknown event keys in the hook file are ignored (`HookEventsToml` has no `deny_unknown_fields`).
- The SessionStart matcher is `startup|resume|clear|compact`. The amount of output context is limited by
  `additionalContextLimit`.

- Stop output is, as in Claude, a top-level `decision: "block"` and `reason` (or exit 2 and stderr). But it does not
  reject the turn; it builds a new continuation prompt from the reason. The input is `turn_id`, `stop_hook_active` and
  `last_assistant_message`.
- The path variables for plugin hooks are `PLUGIN_ROOT` and `PLUGIN_DATA`, and `CLAUDE_PLUGIN_ROOT` and
  `CLAUDE_PLUGIN_DATA` are also given for compatibility.
- Session id (2026-10-03 measurement, `codex exec`): the shell has `CODEX_THREAD_ID` and `CODEX_SESSION_ID` with the same
  value. When started inside Claude, it also inherits Claude's variables.

- A command takes only a string (there is no `args` exec form as in Claude). `PLUGIN_ROOT` arrives only as an
  environment variable, without string substitution.
- Which shell runs a hook command on Windows is not documented. A Windows-only command can be given separately as
  `commandWindows`. The 0.160.0 source's
  [build_hooks_config](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/core/src/session/mod.rs) gets the hook
  execution arguments from the thread's shell. So devflow uses, on both hosts,
  `node -e "require(process.env.CLAUDE_PLUGIN_ROOT+'/...').main()"`, which has no syntax a shell would interpret. This
  command gave the same result in cmd, pwsh 7 and Git Bash (2026-10-01 observation). This observation does not verify
  the whole current range of support of each shell. In PowerShell, calling a quoted absolute executable path without `&`
  failed with a ParserError (2026-10-04 local observation).
- `codex debug prompt-input` does not show the output of the SessionStart hook (untrusted plugin hook, 2026-10-01).
- A plugin hook runs only after the user reviews and trusts it. The documentation describes tool hooks as guardrails
  rather than a complete boundary.

**Subagents**
- They are spawned when asked for directly, or when AGENTS.md or a skill instruction asks.
- The built-in agents are `default`, `worker` and `explorer`.
- Custom agents are placed in `~/.codex/agents/*.toml` or `.codex/agents/*.toml`. The required entries are `name`,
  `description` and `developer_instructions`, and `model`, `model_reasoning_effort` and `sandbox_mode` can also be used.
- A subagent inherits the parent's sandbox.
- A value given at spawn takes precedence over `agents.default_subagent_model` and
  `agents.default_subagent_reasoning_effort`. However, the 0.160.0 `spawn_agent` tool description says a subagent
  inherits the current model by default and "do not set `model` unless the user explicitly requests a different model"
  (2026-10-04, strings in the installed binary). Observation (2026-11-01, 0.166.0): four explicitly requested
  combinations (gpt-6-luna `high`, gpt-6.1-terra `medium` and `high`, gpt-6.1-sol `high`), and an execution check that
  had the subagent read only the spec's role table without a model name (gpt-6.1-terra `high`), matched the subagent
  rollout's `turn_context.model` and `effort`. Each combination was checked once. The concurrent thread cap is
  `agents.max_concurrent_threads_per_session`.
- `fork_turns` of `spawn_agent` defaults to `"all"` and passes on the parent conversation, and `"none"` starts without the
  parent history (tool definition in a Codex session). Observation (2026-11-01, `collaboration.spawn_agent` of that
  session, once per condition; the installed CLI is 0.166.0 but its correspondence with the tool environment is
  unconfirmed): a `"all"` child answered a marker that existed only in the parent conversation, and a `"none"` child
  could not find it. The `"none"` child said it could see a summary of the earlier conversation, but that content was not
  checked.
- Observation (2026-11-01, 0.166.0, comparison on past devflow tasks): for 3 mechanical implementations from the same
  brief, gpt-6.1-terra `medium` and gpt-6.1-sol `high` both passed the original PR's regression tests and the full tests.
  In the review of 3 diffs with 4 planted defects (both at `high`), both found all 4 every time over 3 repetitions, and
  false findings were 2 for terra (the same precision finding from an ambiguous phrase in the plan summary) and 0 for
  sol. In 2 execution checks with one failure criterion each, both were right in all 3 runs (0 false passes). Terra's
  cost was 20-50% of sol's by role, total tokens 53-154% (only implementation was more than sol), and time 45-78%
  (Standard pricing; cached input is 5% of the input price for both models). Implementation was run only once.
- Observation (same day, 3 implementation briefs with one decision removed, terra `medium` and sol `high`): when the
  brief only mentioned a case without deciding the behavior, and when the fork in the road was not visible, both models
  silently chose the same side and finished with `DONE`. When the list of editable files and the acceptance criteria
  disagreed, both reported the contradiction without editing files outside the list (terra `DONE_WITH_CONCERNS`, sol
  `NEEDS_DECISION`).
- Model IDs have no alias that follows the latest version. `gpt-6.1-terra` requires Codex CLI 0.159.0+ (2026-11-01,
  [models](https://learn.chatgpt.com/docs/models), local 0.166.0).
- The documentation says a custom agent can be chosen by name, and that a custom agent takes precedence when it has the
  same name as a built-in agent.
- A running subagent can be steered, stopped or closed.
- Observation (2026-10-01, project `.codex/agents/*.toml`): a custom agent can be chosen by name, and the definition's
  `model` and `model_reasoning_effort` apply. `sandbox_mode = "read-only"` did not apply. It inherited the parent's
  `workspace-write` as it was and file writes succeeded. Sending follow-up work to a finished agent is received by the
  same agent, which continues.
- Run records: rollouts are in `~/.codex/sessions/YYYY/MM/DD/` and `archived_sessions/` (2026-10-02 observation).
  `session_meta.source.subagent.thread_spawn` holds the parent thread, depth and `agent_role`. The model and effort are
  in `turn_context.model` and `turn_context.effort` for each turn.
- On Windows, a rollout file's modification time stays at its creation time (2026-10-03, 5 files, the last record up to
  1 hour 40 minutes later). The source sets the modification time itself when opening a new file. The modification time
  cannot show whether a record was newly written.

**Shell environment and sandbox** (2026-10-02, [config reference](https://learn.chatgpt.com/docs/config-file/config-reference))
- `shell_environment_policy`: `inherit` (all, core, none), `set`, filters. By default variables whose names contain KEY,
  SECRET or TOKEN are removed.
- `sandbox_mode` (read-only, workspace-write, danger-full-access), `sandbox_workspace_write.network_access`,
  `windows.sandbox` (unelevated, elevated, mxc). Whether hooks run inside the sandbox is not documented.
