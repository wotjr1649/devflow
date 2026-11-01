# Credentials and isolation

This spec sets `gh` authentication, the credential boundary within one OS user, and the prerequisites of the OS
isolation needed to create that boundary.
The public filter and unattended write refusal of [Issue I/O](issues.md#issue-입출력) are not this boundary.

## Authentication and the credential boundary

- The owner decides `gh` authentication. A fine-grained token limited to the repositories agents work on is
  recommended. Its permissions are write for Contents, Issues and Pull requests and read for Metadata, Actions and
  Commit statuses, with no administration or workflow permissions. With an OAuth or classic token whose scopes are
  `repo` or `public_repo`, the resume card warns. The owner decides whether to keep using a broad token. The warning
  appears only on a card whose lookup succeeded on an Issue branch, and it looks only at the token gh used for that
  call. Removing old GitHub credentials (such as entries in the git credential manager) is recommended.
- Without OS isolation there is no credential boundary inside the repository between the shell and `devflow-state`.
  Processes of the same OS user can extract tokens through the keyring and git credential helpers, and `devflow-state`
  is also a child process of the agent's shell. So a write run directly reaches as far as every GitHub credential that
  user can read. Within the selected repositories that includes push, force push and branch deletion.
  The owner can set a ruleset that blocks force pushes to and deletion of the default branch. When a boundary is
  needed, follow [Prerequisites for OS isolation](#os-격리의-전제).

## Prerequisites for OS isolation

To separate the credentials of the agent's shell and of Issue writes with OS isolation, the following path and
prerequisites must all be met.
The Claude Code sandbox, in supported environments (macOS, Linux, WSL2), does not allow `api.github.com` and runs only
`devflow-state` outside the sandbox.
Codex runs in a sandbox without network and runs `devflow-state` with approval. Host support and the observed scope
follow [host-facts](../research/host-facts.md). This section does not mean isolation is implemented or verified on a
real host.

The script's location alone is not a boundary. Even when run outside the sandbox, `devflow-state` uses the state of the
working repository.
The write target is affected by the origin in `.git/config` and the Issue number of the current branch, the unattended
decision by the ledger's `mode`, and git execution by all of `.git/config` and the cwd. If the sandbox can change these
values, an outside runner cannot trust those inputs either.

To use it as a boundary, settle the following outside the sandbox.

- Put the script and its runtime where the sandbox cannot write.
- Pin the target repository with configuration outside the sandbox.
- Call git and gh by absolute path.
- Decide whether a run is unattended outside the working folder. Do not let the ledger's `mode`, which the working
  folder can change, alone decide whether an outside run may post.
- Pin the Issue number to write outside the sandbox. Otherwise the sandbox side decides which Issue in the pinned
  repository is written.

Until these prerequisites are in place, do not call this execution path a credential boundary. Refusing all Issue
writes in unattended mode and confirming the content in the next interactive turn stay as
[Issue I/O](issues.md#issue-입출력) sets them, and content to post stays in the ledger notes.
