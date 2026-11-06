# devflow

An Issue-driven development loop for Claude Code and Codex, shipped as one plugin
that both hosts load.

devflow keeps approved intent in GitHub Issues and execution in a bound local ledger.
Each delivery has its own criteria and review baseline. One main session owns shared
state and integration; scoped workers implement or inspect, and review and actual checks
establish what is complete. The CLI enforces its exact contracts without acting as a
general command firewall.

**Status:** development build. Schema-2 verification and external writes currently require the
[Linux supervisor profile](docs/specs/execution.md); Windows/macOS do not have a supported execution adapter.
Use the recorded test scope to distinguish repository checks from real host loading and measured usage.
The release manifests are not bumped by this redesign.

- What devflow is: [docs/design/overview.md](docs/design/overview.md)
- Current choices and reasons: [docs/design/current-decisions.md](docs/design/current-decisions.md)
- What a session does: [the devflow skill](skills/devflow/SKILL.md) and its references
- Contracts: [documents](docs/specs/documents.md), [issues](docs/specs/issues.md), [ledger](docs/specs/ledger.md),
  [lifecycle](docs/specs/lifecycle.md), [orchestration](docs/specs/orchestration.md),
  [evidence](docs/specs/evidence.md), [execution](docs/specs/execution.md),
  [repository](docs/specs/repository.md), [eval](docs/specs/eval.md)

The scope/evidence redesign separates task, delivery and whole-Issue completion, reads only the selected stage and
role contracts, and keeps unknown execution or external effects unverified. Migration and native-host checks remain
explicit parts of adopting a development build; this does not update the marketplace or an installed host.

## Use

devflow works in repositories that have a `.devflow.json` ([repository contract](docs/specs/repository.md)). Open a
session there and the SessionStart hook prints a `[devflow]` resume card with the Issue state, the ledger and the
`Tool:` path for Issue I/O. Then ask in plain words (start new work, continue the Issue, review it, open or merge the
PR, clean up merged branches, hand off to another session) or invoke the `devflow` skill. One skill, `devflow`, runs
the whole lifecycle and reads the reference for the current stage.

The four independent skills (`decision-interview`, `write-prompts`, `audit-prompts`, `agent-instruction-design`)
work in any repository, devflow or not.

**Compatibility:** `/development-start`, `/pr-review-workflow` and `/workspace-cleanup` are gone. In a devflow
repository their requests go to `devflow`; repositories without `.devflow.json` no longer get starting, PR review or
cleanup from this plugin.

## Install

Install `devflow@wotjr1649` from the publisher's shared
[marketplace](https://github.com/wotjr1649/marketplace). Its two host catalogs point at the same release tag in this
repository. Installation and updates are owner actions; see the [distribution contract](docs/specs/repository.md#distribution).

Claude Code:

```bash
claude plugin marketplace add wotjr1649/marketplace
claude plugin install devflow@wotjr1649
```

Codex:

```bash
codex plugin marketplace add wotjr1649/marketplace
codex plugin add devflow@wotjr1649
```

Start a new session after installation. In Codex, review and trust this plugin's hooks in `/hooks`; installation
alone does not trust them. When migrating from `devflow@devflow`, confirm the new installation and hook trust before
disabling the old plugin to avoid running duplicate hooks. Keep other plugins enabled.

To update after the publisher advances the release tag in the catalog:

```bash
claude plugin marketplace update wotjr1649
claude plugin update devflow@wotjr1649
codex plugin marketplace upgrade wotjr1649
codex plugin add devflow@wotjr1649
```

Start a new session after updating. A new tag or GitHub Release alone does not change the catalog; the publisher
updates both catalog entries after the release passes validation. The plugin manifest version must also change for
Claude Code to replace its cached copy. See [release and rollback](docs/specs/repository.md#release-and-rollback).
If Codex registers a local checkout of the shared catalog, use the
[local catalog update procedure](https://github.com/wotjr1649/marketplace#codex에-로컬-catalog-checkout을-등록한-경우).

For local development, this repository's catalogs are named `devflow-local`, with the identifier
`devflow@devflow-local`. Codex installs from that catalog; Claude Code can load the same clean worktree directly
with `--plugin-dir`, displayed as `devflow@inline`. See the [local development runbook](docs/local-development.md)
for isolated profiles, startup, source and cache updates, and verification. This development path is not the
release channel ([distribution contract](docs/specs/repository.md#distribution)).

## Verify a local checkout

Use this path to check a clone before installing anything. Steps 1 and 2 only read the repository and run its
checks. Step 3 runs against a scratch Claude Code profile, so it leaves your default profile, plugins and trust
choices alone.

1. Check the tools. Node.js must be 22 or 24, and `gh` must be signed in:

   ```bash
   node --version
   git --version
   gh auth status
   ```

2. Clone this repository and run the repository checks from its root:

   ```bash
   git clone https://github.com/wotjr1649/devflow.git
   cd devflow
   node --test --test-timeout=120000 tests/*.test.js
   ```

   The test run takes a couple of minutes and reports `fail 0`; a few skipped tests are normal.

3. Confirm Claude Code loads this checkout. `CLAUDE_CONFIG_DIR` points the command at an empty scratch profile,
   so nothing is written to your default one:

   ```bash
   scratch=$(mktemp -d)
   CLAUDE_CONFIG_DIR="$scratch" claude --plugin-dir "$PWD" plugin list
   rm -rf "$scratch"
   ```

   `devflow@inline` should show your checkout as its path and `loaded` as its status.

This confirms the checkout is sound and loads. It does not open a session, exercise hooks, or cover Codex and the
release channel. Opening a session with a dedicated profile, logging in, trusting hooks and installing are owner
decisions; the [local development runbook](docs/local-development.md) covers them, including isolated test
profiles and what to verify for each kind of change. The resume card and session hooks run only in a project with a
`.devflow.json`; see the [repository contract](docs/specs/repository.md).

## Prerequisites and limits

- Node.js 22 or 24 (the CI matrix), Git and authenticated GitHub CLI (`gh`) must be available to hooks and commands.
  Issue tracking expects a `github.com` origin and an account with write access to that repository.
- Schema-2 verification and GitHub mutations currently require Linux, an available system Python 3 and a working child-subreaper
  capability. The command runner waits for the local process tree, including detached descendants. On Windows, macOS
  or a missing capability the target is not launched: verification is unverified and the mutation is a recorded non-dispatch
  failure. Read-only queries and local state inspection remain available. Repository tests and
  plugin loading on another OS do not establish that this attestation adapter is supported there. See the
  [execution profile](docs/specs/ledger.md#execution-profile).
- Installing the plugin does not configure a project. Add its `.devflow.json` and project files using the
  [repository contract](docs/specs/repository.md); without that profile the hooks do not run.
- Hooks block nothing: they resume work and track sessions. Issue text posted without `devflow-state` skips its
  public text filter, and test changes are left to review. Keep credential scope and host permissions appropriate.
- Static review uses original publishable Git objects and a controlled reader; a role name is not a sandbox.
- Remote cleanup retains a ref when no policy-permitted server operation can compare the reviewed OID and delete
  atomically. The current no-lease policy is unchanged; eligible local cleanup is independent.
- Delegated agents are the hosts' built-ins (`general-purpose` in Claude Code, `spawn_agent` in Codex); this plugin
  installs no agent definitions. A role's report-only or no-spawn limit is an instruction, not a tool restriction. The
  main session's check before and after each explorer and reviewer (`devflow-state delegation-check`) catches visible
  effects without running git after the agent; it is not isolation. See [host facts](docs/research/host-facts.md).
- Before clearing a Codex session, complete the [handoff](docs/specs/ledger.md#concurrent-sessions): release its record last,
  then use `/clear`. Clearing alone can leave the previous session's warning until expiry.

Version changes happen only during an explicitly requested release; see [version policy](docs/specs/repository.md#version).
Installing, trusting hooks and updating a host remain owner actions.

## License

Apache-2.0. Third-party parts listed in [SOURCES.md](SOURCES.md) keep their own licenses, whose texts are in
[LICENSES/](LICENSES/). See [LICENSE](LICENSE) and [NOTICE](NOTICE).
