# Ledger storage and worktree safety

These filesystem, lock, and worktree rules apply to both version 1 compatibility commands and protected workflows.
The [ledger contract](ledger.md) defines canonical control, migration, evidence, and coordinator handoff. A coordinator
ownership recovery and a short-lived filesystem lock recovery are separate operations with different prerequisites.

## Task worktrees

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
- Legacy `release <n>` removes only this session's activity entry; an absent entry creates no folder, lock or file. Protected release also relinquishes canonical ownership as specified in the [ledger contract](ledger.md#concurrent-sessions).

## Nonexpiring exclusion and recovery

All cooperating local mutations acquire the `ledger.lock` directory using atomic mkdir. Its `owner.json` contains a
version, random token, PID and hostname. No mtime, age or timeout permits takeover of a potentially live writer.
A contender that cannot acquire the lock within the bounded wait refuses. Acquisition checks the nonexpiring
`ledger.recovery` gate before and after creating the lock. The owner checks directory identity and exact owner
contents before committing and releases only its own lock. A file, symlink, missing owner or malformed owner is
not silently discarded.

The read-modify-write and atomic replacement occur while this non-stealable exclusion is held. The ownership check
is a consistency check under exclusion; check-then-rename alone would not fence competing writers. Temporary files
are exclusive, privately created, flushed, atomically renamed and directory-synced where supported. Provider network
operations occur outside the lock and retain their protected pending-effect record across that interval.

`ledger-lock inspect <n>` is read-only. Explicit `ledger-lock recover <n> --quiescent < owner-JSON` requires known
quiescence and the exact inspected owner object. Recovery acquires a separate nonexpiring recovery gate, checks its
version/contents and same hostname, and requires the recorded PID to be confirmed absent. A live PID, PID reuse,
permission-denied liveness check or another hostname refuses recovery. It rechecks the owner before removing the
confirmed abandoned directory. A missing owner, legacy regular lock file, or interrupted recovery gate requires
offline inspection after all writers have stopped; there is no automatic fallback or age-based cleanup.

## Session attribution

Writes record session hash/time in `sessions.json`; reads do not. Recent unreleased entries warn for 30 minutes.
These warnings do not prove process liveness or quiescence. Hold conflicting work until handoff is confirmed.

The CLI takes the first nonempty ID in `CODEX_THREAD_ID` → `DEVFLOW_SESSION_ID` → `CLAUDE_CODE_SESSION_ID`.
Children can inherit an outer session's identity. This known host-attribution limit remains documented in
[hooks](hooks.md#common-contract-of-both-hosts); hashes and workflow revisions do not repair it.

SessionEnd removes only its identified activity entry using the confirmed main-worktree backlink, with no external
Git lookup. Unconfirmed links, locks and read/rewrite failures cannot authorize cleanup. Review-only does not write.
SessionEnd never relinquishes canonical workflow ownership. Codex `/clear` may not immediately end the previous
thread. In nested runs, omit a release that would remove the outer session; let its coordinator perform the handoff.
Sessions on other machines are unknown. Provider writes are not globally locked, and raw clients bypass local gates.

## Protected migration

Version 1 `ledger.json` remains readable and its old explicit commands remain available until migration. New skill
mutation routes require protected mode first. A schemaVersion field alone does not stop an old executable that ignores
it, so migration moves canonical state to `workflow.json` and atomically replaces `ledger.json` with a deliberately
non-JSON tombstone. The tombstone is a regular file, not an unlink-then-mkdir sequence. The exact original bytes are
preserved in `ledger.v1.json`. Tests execute pinned actual old CLI and hook code against the migrated directory; their
JSON readers refuse it and cannot change new canonical state through their normal mutation paths.

Run `workflow migrate <n> --quiescent` only after confirming old and new writers are quiescent. It requires the current
Issue branch, an identified coordinator, no running workers or legacy pending posts, and release of every other
recorded session, including old entries. A session list is not proof that no unrecorded old process exists; the caller
must establish that fact before cutover. An old writer that had already read state must not overlap migration.

Initialization explicitly supplies delivery identity, delivery comparison base, target, scope and relevant-input
digest; it never guesses deliveryBase from legacy `base`, which may only describe the last task. A valid known legacy
stage is retained unless an explicit validated initial stage is supplied. Ship or later cannot be asserted without
new delivery evidence. A known open legacy task must be recovered explicitly, with its attempt/base; consumed
continuations carry into its new delivery/task key. Unknown consumption is exhausted pending reconciliation, not
reset to zero.

Cutover durably writes the backup and `workflow.migration.json` journal, replaces the legacy file with the tombstone,
writes the canonical record, verifies it, then removes the journal. Any journal blocks ordinary reads and writes.
Resume an interrupted migration with the same owner and initialization JSON after quiescence is re-established.
Recovery verifies the journal, original bytes and backup; changed late legacy writes refuse recovery. Interrupted
state is recoverably fail-closed, not silently read as an empty ledger. Raw filesystem bypass and arbitrary old
programs that ignore read failure are outside this cooperative compatibility guarantee.

## Review artifacts and conditional deletion

`review-package <base> <head> --owned-clean-snapshot` stores a bounded full-source JSON artifact in a private file
outside the snapshot and prints only summary/path/digest. Explicit outputs are normalized absolute paths with no
symlink parent and no overwrite. The host must provide exclusive ownership and canonical raw bytes matching HEAD;
a Git-clean autocrlf/CRLF checkout may be refused. There is no implied dirty, untracked, or ignored-input coverage.

For conditional deletion, `delete-destination <remote>` observes a validated single destination. Preparation binds
`{remote, ref, expectedOid, expectedDestination}` in the protected effect payload; execution uses that exact payload
and checks destination drift before a conditional ref/OID delete. The caller must actually exclude repository/remote
and all effective Git-configuration changes throughout resolution and native push, or defer deletion. Comparing the
prepared and current destination is not an atomic race fence. Native hooks, credentials, transport identity and
server policy remain host-trusted. The helper preserves native hooks and uses a conditional remote mutation rather
than claiming a prior lookup prevents a concurrent ref change.
