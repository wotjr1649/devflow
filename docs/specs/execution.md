# Verification execution adapter

This contract owns local process-tree supervision for verification and v2 GitHub mutations. The [ledger](ledger.md) owns scope, reservation, evidence applicability
and completion transitions. The adapter records execution; main and independent review judge whether the command
actually exercises its declared acceptance criteria.

## Supported profile

These jobs use `lib/devflow-execution.js`, not the ordinary parent-only command runner. The implemented profile is
Linux with an available system Python 3 and successful `PR_SET_CHILD_SUBREAPER` setup. The isolated interpreter loads
the packaged supervisor, which launches the exact executable and argument array, adopts orphaned descendants and waits
until the root is reaped and no descendants remain. Detached sessions and double forks do not make the parent exit
sufficient. The adapter does not install an interpreter or change host settings.

V2 GitHub mutations use a 10-second local supervisor deadline. Read-only GitHub queries retain the ordinary runner.
When the supervisor times out, remote visibility cannot supply the missing process termination report.

## Result and evidence

The adapter validates the full supported job schema and cross-field consistency. `isSettledResult` confirms local
termination even for a nonzero root, signal or observed child failure; `isNotStartedResult` validates non-dispatch.
`isSettledSuccess` additionally requires complete output and no failure. The actual result code must match the recorded
root termination, and root/observed-exit identities and failure summaries must agree. Caller-supplied success flags alone
cannot satisfy these predicates. None of these local predicates establishes a remote operation's outcome.

| Job state | Meaning and permitted outcome |
|---|---|
| `settled` | The local process tree ended. A pass additionally needs root exit 0, no observed failed exit, complete output and unchanged post-run inputs |
| `not_started` | No command launched; verification is terminal `NOT_VERIFIED`, and a v2 mutation is `failed / not_sent` |
| `unknown` | Exit, descendants, output or supervisor status is unresolved; retain the verification reservation or pending effect and recover explicitly |

Raw output bytes, the actual command/cwd, root exit and observed adopted-child exits are retained in the private
evidence. A command can reap its own children; their individual statuses are not independently observed by the
supervisor. Timeout leaves the user job alone and retains output artifacts, which may continue growing. Missing or
malformed job metadata cannot be promoted to success from an integer exit code. Oversized output is not complete evidence.

## Limits and host verification

Windows, macOS and other unsupported platforms fail closed before launch. The v2 ledger records unsupported verification
as unverified and unsupported mutations as non-dispatched failures; read-only GitHub queries use the ordinary runner.
Cross-platform unit tests may exercise the
state contract through a trusted runner seam; that does not test a native process supervisor. A future host adapter must
demonstrate healthy execution, detached/double-fork completion, timeout and failed-descendant behavior on that host
before it may produce passing receipts. The local process profile does not cover work dispatched to an unrelated
daemon, remote service or another host; those operations need separate completion evidence. It is not an OS sandbox
against a same-user process that attacks its supervisor or evidence files.

The Linux contracts used by this original implementation are documented by
[PR_SET_CHILD_SUBREAPER](https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html) and
[waitpid](https://man7.org/linux/man-pages/man2/waitpid.2.html).
