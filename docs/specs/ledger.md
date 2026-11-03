# Ledger contract

Sets the ledger's keys, unattended runs, and what happens when several sessions write to the same Issue. Where the ledger
lives is set by [repository](repository.md#issue-folder).

## Ledger keys

Written with `devflow-state ledger-update` and the per-key commands, and read by the resume card and the Stop hook.
`ledger-update` checks the values of `stage`, `path`, `runMode`, `mode` and `task` against the definitions below and
refuses wrong ones. The ledger is read only when it is a regular file of at most 1MiB, and a write that would make it
larger is refused, leaving the ledger as it is. These keys cannot be cleared with `null` or an empty value. Stage and
execution-mode names are the devflow skill's, so only their shape is checked: a stage is a lowercase word of letters and
hyphens up to 30 characters, and `runMode` starts with `M` and a digit.

| Key | Holds |
|---|---|
| `stage`, `path` | The lifecycle stage and path (spike, bounded, architectural). Stage records follow the post-ship exception in [lifecycle](lifecycle.md#stages) and the [task loop](lifecycle.md#loops) |
| `mode` | `interactive` or `autonomous`. The only criterion for an unattended stretch. A new ledger may set it with `ledger-update`; an existing ledger switches only with `devflow-state mode <n> autonomous\|interactive < reason` ([unattended runs](#unattended-runs)) |
| `modeChanged` | `{to, at, session}` of the last mode switch. The `mode` command (including a `ledger-update` that starts a new ledger as autonomous) records the ISO time and the id hash of the session that switched it, and reattribution changes only `session` ([unattended runs](#unattended-runs)). The resume card shows it as `Mode: <to> since <at>` |
| `runMode` | Starts with `M` and the mode number of the skill's Execution modes (a description may follow) |
| `task` | `{current, total}`, integers of 1 or more. Build opens it at the first task; a verify failure sent back to build keeps it open; leaving build and verify moves current past total. The Stop hook continues only while current is at most total |
| `base`, `lastCommit` | The BASE before delegation, the last commit the ledger recorded |
| `counts` | The Stop hook's per-task continue count `{continue}`. Old fix and promote values are neither read nor validated |
| `notes` | Reasons for fixes, promotions and path changes, check evidence, and content not posted during unattended runs, one line each (appended with `note`) |
| `decisions` | Open decisions only. Task decisions already made go in checkpoints; lasting choices and their reasons go in [current design decisions](../design/current-decisions.md) |
| `blocked` | Blockers or reasons for waiting on a person (including confirming a remote write). When it is not empty, there is no unattended continuation |
| `running` | Names of background delegations that are running. Added with `running <n> add <name>` and removed with `done` once the result is recovered and the exit confirmed. For failure, timeout or interruption, confirm the exit of child processes and partial effects too. If they cannot be confirmed, leave a record, continue only independent work and do not run it again. The duty to confirm the exit is not permission to terminate. Remaining entries block Stop's unattended continuation. `ledger-update` does not replace the running list |
| `followups` | Follow-up candidates to propose at ship |

`sessions.json` and `ledger.lock` in the same folder are used for [concurrent sessions](#concurrent-sessions).
`testsLocked`, `testsFailing`, `pendingPosts`, `metrics` and old aggregate values in old ledgers are ignored, and are not
automatically removed or rewritten.
`ledger-update` does not change `pendingPosts` either. Of the remaining post candidates, only those the user read and
approved are posted.
When the working Issue's ledger cannot be read (an Issue folder that is a link or a file, a ledger that does not parse),
it may be in autonomous mode, so nothing is written to the Issue.
Test locks, metrics commands, a post queue or signing keys, delegation binding and block logs are not provided.

## Unattended runs

An unattended stretch exists only when the ledger's `mode` is `autonomous` (a user decision). When the user steps away or
orders an unattended run, or when a prompt launched non-interactively says so, the router switches it with
`devflow-state mode <n> autonomous < reason`.
When the person returns, switch it back with `devflow-state mode <n> interactive < reason`, then show the user the post
candidates in the notes. The reason is required as the first line of stdin, and the command changes the
mode under the lock, appends `mode <value>: <reason>` to the notes and leaves the value and time in `modeChanged`.
A switch to the same value is refused. But when `mode <n> autonomous` is run on a task another session already made
autonomous, it is not refused and only `modeChanged.session` changes to this session (reattribution, with the reason in
the notes). When a new session takes over an autonomous task, switch it to interactive if the user is present, and
reattribute first if it continues unattended. Approval settings such as bypass (Claude) or yolo (Codex) do not say
whether a person is present, so they are not used as the criterion. Only then does the Stop hook ask to continue, and it
adds to the continue count under the ledger lock.

- Condition: the run is this session's, there is an open task (`task` current at most total), and `blocked`, open
  `decisions` and `running` are empty ([ledger keys](#ledger-keys)). The hook does not read stage names, which are the
  skill's; the skill opens the task in build and closes it on leaving build and verify. Its message names the task and repeats
  that nothing is pushed, integrated or written to the Issue, since only Issue writes are refused by the tool. Waiting to confirm a remote write is also recorded
  in `blocked`.
- The run is this session's when `modeChanged.session` names the Stop event's session, the one that switched or
  reattributed it. A session whose id is unknown, or a switch recorded without one, does not continue, and neither does
  a child started from the owner, though its environment carries the owner's id. Known limit: in a nested run the CLI
  records the outer host's id ([concurrent sessions](#concurrent-sessions)), so Claude started inside Codex gets no
  continuation; it works task by task until its own session records it.
- A ledger written before this rule may hold an open task in review or later. Stop continues it only after a session
  claims the run with `mode <n> autonomous`, at most twice, and its message forbids push, integration and Issue writes;
  setting current past total ends it.
- At most 2 times for the same task (the ledger's continue count). After that, stop and get a review.
- When a task ends, check, commit and update the ledger. Only the user can run `/clear`, so an unattended run uses a fresh
  context per task through an implementer (M2), and the main session carries on through the ledger and commits.
- In an unattended stretch, nothing is posted to Issues and there is no push or integration. They are recorded in the
  ledger and done in the next interactive turn ([Issue I/O](issues.md#issue-io)). This is devflow's current
  unattended run policy.
  `devflow-state` refuses every Issue write in autonomous mode and directs the caller to leave the content to show the
  user in the ledger notes.
  It does not create pending posts or post automatically.

The executor's rules for unattended work are in the
[sessions reference](../../skills/devflow/references/sessions.md#unattended-work) and, for integration, the
[ship reference](../../skills/devflow/references/ship.md). In interactive work this hook is off.

## task worktree

A worktree's Issue is only the Issue of that worktree's branch. A linked worktree that is not on an Issue branch is
independent and does not write another Issue's ledger.

- When a Claude isolation marker (a `.claude/worktrees/agent-*` folder or a `worktree-agent-*` branch) is present, the
  worktree is not bound to an Issue.
  `devflow-state` refuses ledger writes, Issue writes, create, remark and release, and the main session records them. The
  resume card shows only a notice that the main session handles the state and writes. An old `delegates.json` is neither
  read nor changed.
- A worktree without a marker is judged as being on its own Issue branch or as an independent worktree. The limit that
  isolation cannot be determined when both the folder and the branch markers are changed remains. Stop reads the ledger
  only on its own Issue branch.
- create: a linked worktree that is not on an Issue branch has no working Issue ledger. It refuses when the main work
  tree branch's Issue is autonomous; when there is an autonomous ledger this session switched on or took over
  (`modeChanged.session`) or wrote within 30 minutes; an autonomous ledger whose switching session is unknown (including
  when the session id is unknown); an autonomous ledger while the main work tree is in a detached HEAD (it may be in the
  middle of a rebase); or an unreadable Issue folder list, Issue folder, ledger, or `sessions.json` of an autonomous
  ledger. In a reftable repository the HEAD file is a stub, so the branch is asked of git, and when that cannot be asked
  it is treated as detached. Entries are taken by their exact name in the list and not followed; treated as unreadable
  are: a link or non-folder entry named `i<n>`, an entry differing from `i<n>` only in case that cannot be shown by file id
  to be the same entry (including id 0), a link with another name, a folder that has a ledger or may have one, an entry
  that does not open by its listed name or cannot be judged, a name that appears twice, two names that open the same file
  id, and a number beyond the safe integer range. A Windows short name can open an entry with another name as `i<n>`, and
  an unpaired surrogate name comes out as U+FFFD and may collide with another name. The ledgers read are those of the
  Issues in the list it judged and, separately from the list, the main work tree branch's Issue through `i<n>`, and
  `sessions.json` is read only once. create treats it as an Issue folder only when it is the same entry. A refusal names
  that Issue or entry, but shows an entry name only when it consists solely of letters, digits, `_`, `.` and `-`; it
  leaves confirmation and recovery to the session that owns that run or to the user, and does not suggest switching the
  mode of another Issue or a path without this check. create in a detached HEAD is refused anywhere. The limit that create
  in the main work tree without a working Issue is treated as interactive remains ([Issue I/O](issues.md#issue-io)).
- `release <n>` removes an entry only when this session has one; otherwise it creates no folder, lock or file.

## Concurrent sessions

This is when two sessions on the same machine (Claude and Claude, or Codex) take over one Issue through a handoff or a
message.

- Ledger writes read, modify and replace through a temporary file under a short lock (`ledger.lock`). No network is used
  inside the lock, so a lock older than 10 seconds is discarded, and a write that cannot take the lock within 2 seconds is
  refused.
- `ledger-update` changes the top-level keys it is sent, and appended records use `note` (to prevent losing concurrent
  records).
  On an Issue branch both write only their own ledger; on a branch with another name (such as main) they write the
  ledger of the number, but `note` needs the ledger to exist. A detached HEAD (it may be in the middle of a rebase) and a
  linked worktree not on an Issue branch are refused.
- Writes (to the Issue and the ledger) leave the session in `sessions.json` (id hash and time). When another session
  wrote within 30 minutes and did not release, the resume card and the write output warn. This does not refuse, and reads
  are not counted. The warnings end with one line for the warned session: hold the Issue's state and ledger key writes
  (`ledger-update`, `mode`, `running`) until the owner or that session confirms a handoff, since each replaces what the
  other session may still write and a re-read only shows what it has written so far, while `note` appends under the
  lock and may go on; hold other writes their work may touch until a re-read rules that out;
  after a write, re-read the current state; keep independent work; and never release or end another session by
  guessing, because the record is a recent unreleased write, not proof that the other session is running or has ended.
- [Current session id passing](hooks.md#common-contract-of-both-hosts): the CLI uses the first non-empty value of
  `CODEX_THREAD_ID` → `DEVFLOW_SESSION_ID` → `CLAUDE_CODE_SESSION_ID`. Nested hosts follow the same order. A subagent has
  the parent's id; without an id, nothing is recorded or warned.
- At a handoff, after finishing checks, commits, state records and delegated work, run `release <n>` as the last ledger
  action. Follow this order when passing a unit of work on with `/clear` as well. Then report the next action to the user
  and leave `/clear` to them. Writing again after the release registers the session again, so finish additional records
  before releasing. A direct `/clear` in Codex does not end the previous thread right away and does not give the previous
  id to the new hook, so automatic release is not guaranteed ([observation](../research/host-facts.md#codex)). Do not
  remove another session by guessing. When a session ends, the SessionEnd hook of both hosts removes it from every Issue
  (in Claude, including `/clear`). When the hook does not run (a Codex hook before it is trusted, an abnormal exit), it
  is left to the 30-minute expiry. So a brief handed to another session (another host, a headless run) has that session
  run `release <n>` at the end. If that is missed and the hook does not run either, warnings about the ended session
  continue for 30 minutes.
- SessionEnd confirms the main work tree through the local back link without an external `git`, so lookup delays or
  failures do not make it miss the release.
  It does not release another repository through an unconfirmed link. It removes only that id from the JSON object it
  read and preserves other values and locked ledgers.
  A lock, read or rewrite failure of an explicit release is reported as a release failure, not assumed to be a lock
  conflict.
- Issue writes are not locked. Sessions on other machines are unknown, and another host launched inside a host (Claude
  inside Codex) appears as the outer session.
