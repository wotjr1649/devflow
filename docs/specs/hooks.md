# Common hook contract

Sets SessionStart, Stop and SessionEnd shared by both hosts, along with input reading and session release.
Issue I/O is set by [issues](issues.md), and the ledger and the continue and release conditions by [ledger](ledger.md).

## Common contract of both hosts

The following is a contract the product must meet; current session passing does not meet it yet.
Claude Code and Codex share one definition in `hooks/hooks.json` and one entry point and policy in
`hooks/devflow-hook.js`.
There are no host-specific event registrations, card, continue or release policies, or file, setting or environment
writes. Normalizing inputs with the same meaning through common checks is allowed, but moving a host-specific effect into
another file is not making it common. Per-host packaging metadata is separate.

- When changing session attribution, confirm on both real hosts that the hook input and the CLI point to the same
  session, and that nested runs and concurrent writers do not write to another session or release its records. Do not
  infer the session from the most recent writer, a PID difference or the last card.
- On receiving an event, handle only that input's session. Do not hide differences in when hosts fire events behind
  host-specific virtual events. Both hosts finish an [explicit release](ledger.md#동시-세션) before a handoff or clear,
  and SessionEnd cleanup is a secondary path.
- Tie evidence to the candidate SHA, actual loading, host version, scenario and scope of observation. Source tests,
  comparison against installed files, the card output, continue counts, attribution and release of real tool calls, and
  workflow and delivery are judged separately. Sharing a single file or an installation list is not evidence of runtime
  effect.
  Record a hook that did not fire or errored as a failure, and keep it distinct from unsupported, not run and loading
  mismatch.

Confirmed deviation: SessionStart's `shareSessionId()` writes `DEVFLOW_SESSION_ID` to the environment file only when it
receives a safe id in a devflow repository, `CLAUDE_ENV_FILE` exists and `CODEX_THREAD_ID` is absent. This
host-specific effect does not meet the common contract.
Its consumers are the CLI's writer records, releases and delegation attribution ([ledger](ledger.md#동시-세션)). This
protection is not removed before an alternative passing is verified for the normal case, misattribution, concurrency
and cleanup. Adopting the document alone does not verify passing or attribution on real hosts.
When an inherited `CODEX_THREAD_ID` remains, the CLI prefers it, so the inner session's hook input and attribution may
diverge.
This is a conditional risk in the code; whether inheritance and misattribution actually happen is verified separately in
the target host's nested scenario.

## Registered events

`hooks/hooks.json` registers only the following three events.

| Event | Action |
|---|---|
| SessionStart (`startup`, `resume`, `clear`, `compact`) | Injects the resume card and shares the session id. A card failure shows as a reason, and no state is inferred |
| Stop | When its own Issue's unattended work is open and nothing is waiting, asks to continue at most 2 times per task. The count is added under the ledger lock, and it stops on an error or a lock conflict |
| SessionEnd | Releases only the input session from the session records of every Issue. It does not wait for the lock and preserves other sessions' records |

PreToolUse and PostToolUse are not registered. The hooks do not block Issue writes or edits to test files, profiles or
the ledger, do not analyze shell commands or HTTP, GraphQL or MCP input, and create no block records or post-edit doctor
audits.
The Issue public filter and the refusal of writes in autonomous mode through `devflow-state` are that CLI's behavior, not
enforcement by the hooks.

## Input and safe file reads

The hook reads standard input as a stream on the event loop for at most 3 seconds. When the input does not end or the
JSON cannot be read, it ends without output and does not deny the tool call. There is no analysis child process or
shell-analysis deadline.

SessionEnd proves the main work tree through local metadata and back links without a git process
([repository](repository.md#issue-폴더)). It reads metadata only from regular files of at most 4 KiB and does not read
links, special files or large files. It checks the file type, file identity and read size before and after opening to
limit replacement and growth as well. It does not open a file given as a shared path, and checks a folder link by the
text of that link. It follows link chains up to 8 links and treats a longer chain as a shared path. On Windows, a long
path prefix before a drive letter is treated as local. When a path that looks local, such as a drive mapped to a share
or a junction, does not respond, it may be delayed until the host's time limit.

SessionEnd handles only real `.work` and Issue folders, and reads and releases session records with `devflow-state`'s
safe reader and lock. It does not release another repository's sessions through a forged worktree link. Whether
SessionEnd actually fires on real hosts, and the session id it is given, are verified separately.
