# Claude Code host adapter

Use the installed Agent/tool schema. This package creates no agent definitions or host-setting changes. Documented capability, observed launch and enforced restriction are separate claims.

## Mapping

- Use available `general-purpose` with a bounded brief; supply relevant project instructions when inheritance is uncertain. Explore/Plan names alone do not prove required project context loaded.
- Model/effort follow user choices and supported call parameters. For authorized overrides, prefer supported family aliases over transient versions. Check effective metadata: call/definition/environment precedence depends on the host version. Do not change main-session settings as a side effect.
- Custom-definition `tools`, `disallowedTools` and `maxTurns` differ from skill `allowed-tools`; a general-purpose call may not accept them. Use enforced limits only through an existing authorized definition or exposed API. A role prompt is not a sandbox, and missing guarantees do not authorize configuration edits.
- Resume the same task through the offered resume/message tool, such as `SendMessage` where supported. New tasks and independent reviews require fresh context where available; disclose inheritance limits without counting contaminated/self review as an independent gate. Recover results, worker/descendant exits and partial effects; notifications alone are insufficient.
- M3 worktrees require verified actual branch/head and inputs. Defaults/configuration may fork from the remote default branch rather than coordinator HEAD; never assume the base. Changed worktrees stay for the separate cleanup gate. Account for shared Git configuration and external resources; unknown capability selects M2.

## Sessions and platforms

Use trusted card/session identity and installed hooks. A process launched inside another host must not release its caller through an inherited session ID. Missing SessionEnd is not confirmed exit.

Use supported executable/argv/cwd/env/stdin boundaries. Native Windows path/shell behavior needs evidence separate from WSL; successful launch proves no filesystem/network isolation. Source basis: official Claude Code Subagents, Skills and Worktrees documentation; the installed schema and effective settings determine available mechanisms. Hold only actions requiring an unavailable guarantee.
