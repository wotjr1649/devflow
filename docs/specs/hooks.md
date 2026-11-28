# Common hook contract

Shared events, input and release. See [issues](issues.md) for Issue I/O and [ledger](ledger.md) for continuation and release.

## Common contract of both hosts

Claude Code and Codex share one definition in `hooks/hooks.json` and one entry point and policy in
`hooks/devflow-hook.js`.
There are no host-specific event registrations, card, continue or release policies, or file, setting or environment
writes. Normalizing inputs with the same meaning through common checks is allowed, but moving a host-specific effect into
another file is not making it common. Per-host packaging metadata is separate.

- When changing session attribution, confirm on both real hosts that the hook input and the CLI point to the same
  session, and that nested runs and concurrent writers do not write to another session or release its records. Do not
  infer the session from the most recent writer, a PID difference or the last card.
- On receiving an event, handle only that input's session. Do not hide differences in when hosts fire events behind
  host-specific virtual events. Both hosts finish an [explicit release](ledger.md#concurrent-sessions) before a handoff or clear,
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
Its consumers are the CLI's writer records, releases and delegation attribution ([ledger](ledger.md#concurrent-sessions)). This
protection is not removed before an alternative passing is verified for the normal case, misattribution, concurrency
and cleanup. Adopting the document alone does not verify passing or attribution on real hosts.
When an inherited `CODEX_THREAD_ID` remains, the CLI prefers it, so the inner session's hook input and attribution may
diverge.
This is a conditional risk in the code; whether inheritance and misattribution actually happen is verified separately in
the target host's nested scenario.

## Registered events

| Event | Action |
|---|---|
| SessionStart (`startup`, `resume`, `clear`, `compact`) | For configured work, injects a resume card and shares the session id. The recorded stage is data. A card failure shows a reason and grants no Tool. For local assignments, `startup` routes documents, implementation, status and independent review to the skill. Other sources remind the session to recheck its stage and reference |
| UserPromptSubmit | Routes an assigned document revision to its file and stage, a combined brief to drafting and audit, or an explicit read-only release readiness check to Delivery |
| PreToolUse | For an operator-assigned single-document revision, blocks native writes to any other path, batch moves, and delegation or MCP calls. Claude shell tools are limited to the standalone stage check. Codex shell permissions remain the host's responsibility |
| Stop | When its own Issue's unattended work is open, this session switched or reattributed it, and nothing is waiting, asks to continue at most 2 times per task. The count is added under the ledger lock, and it stops on an error or a lock conflict |
| SessionEnd | Releases only the input session from the session records of every Issue. It does not wait for the lock and preserves other sessions' records |

Outside an assigned revision the tool hook stays quiet. During a revision it supplies no permission grants. Claude
uses the operator's standalone `node bin/devflow-state`, `node devflow/bin/devflow-state` or `devflow-state` invocation
at the root. From a subdirectory the hook permits the exact stage command using the packaged CLI instead. Use host
sandbox permissions for any other execution surface. PostToolUse is unregistered.
The Issue public filter and the refusal of writes in autonomous mode through `devflow-state` are that CLI's behavior, not
enforcement by the hooks.

Assignment lookup starts from the canonical local session directory. In Git, only the nearest worktree or repository
boundary can supply the assignment. In Git-free directories, the nearest valid root-bound record applies. Child-folder
markers cannot replace a Git worktree's assignment. The standalone check verifies Git at that root. Native relative
tool paths resolve from the session directory and must match the assigned file at the root.

## Input and safe file reads

The hook reads standard input as a stream on the event loop for at most 3 seconds. When the input does not end or the
JSON cannot be read, it ends without output and does not deny the tool call. There is no analysis child process or
shell-analysis deadline.

SessionEnd proves the main work tree through local metadata and back links without a git process
([repository](repository.md#issue-folder)). It reads metadata only from regular files of at most 4 KiB and does not read
links, special files or large files. It checks the file type, file identity and read size before and after opening to
limit replacement and growth as well. It does not open a file given as a shared path, and checks a folder link by the
text of that link. It follows link chains up to 8 links and treats a longer chain as a shared path. On Windows, a long
path prefix before a drive letter is treated as local. When a path that looks local, such as a drive mapped to a share
or a junction, does not respond, it may be delayed until the host's time limit.

SessionEnd handles only real `.work` and Issue folders, and reads and releases session records with `devflow-state`'s
safe reader and lock. It does not release another repository's sessions through a forged worktree link. Whether
SessionEnd actually fires on real hosts, and the session id it is given, are verified separately.
