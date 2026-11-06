# Codex host adapter

Use the current exposed schema/instructions and record the observed surface: Codex CLI, app-server and hosted collaboration APIs differ. This package creates no agent definitions or user-setting changes.

## Mapping

- Use the offered `spawn_agent`/collaboration equivalent with its exact arguments. For new tasks and independent reviews, use fresh context (`fork_turns: "none"`) where supported. Otherwise disclose inherited context; do not count contaminated/self review as the required independent gate. No default full-history fork.
- Inherit the user's model/effort unless applicable authority and the current tool permit an override. Record observed effective settings or unknown; do not alter the main session as a side effect. No transient version is prescribed here.
- Agent types/profiles, allowlists, turn limits and isolation controls exist only when exposed. Custom-agent parent-permission inheritance does not establish a separate sandbox; never assume a `sandbox_mode` field narrows the worker. Role instructions and tripwires are distinct from enforced restrictions.
- Resume the same task through the offered follow-up/message operation. Different tasks/reviews require fresh workers. Recover results and process state through supported wait/status tools before recording exit; termination needs separate authority.
- Conversations may share filesystem/cwd and Git configuration. M3 requires separate authorized worktrees with verified branch/base/head and inputs, plus accounting for shared services, ports, ledger and remotes. Unknown capability selects M2, not an invented sandbox policy.

## Sessions and platforms

Use trusted session mapping and helper ownership checks. A nested process inheriting `CODEX_THREAD_ID` must not release its parent. Verify actual hooks; absent SessionEnd is not proof of process exit.

Use supported executable/argv/cwd/env/stdin boundaries. Native Windows and WSL are separate evidence; launch success proves neither isolation nor cross-platform parity. Hold only actions needing an unavailable guarantee. Source basis: official Codex Multi-agents and Configuration Reference, with the actual runtime schema controlling invocation; CLI documentation does not prove a hosted surface has identical capabilities.
