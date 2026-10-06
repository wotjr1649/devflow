# devflow

An Issue-driven development loop for Claude Code and Codex, shipped as one plugin
that both hosts load.

devflow keeps work state in GitHub Issues so a session can resume after compaction
or a restart, lets one main agent decide and write code while subagents read and
verify, and backs its rules with scripts, hooks and CI rather than prose alone.

**Status:** in use. devflow runs its own development, from Issue #1 on, on Claude Code and Codex.

- What devflow is: [docs/design/overview.md](docs/design/overview.md)
- Why each choice was made: [docs/design/decisions/](docs/design/decisions/)
- Contracts: [documents](docs/specs/documents.md), [issues](docs/specs/issues.md), [ledger](docs/specs/ledger.md),
  [lifecycle](docs/specs/lifecycle.md), [orchestration](docs/specs/orchestration.md),
  [repository](docs/specs/repository.md), [metrics](docs/specs/metrics.md), [eval](docs/specs/eval.md)

## Install

Install `devflow@wotjr1649` from the publisher's shared
[marketplace](https://github.com/wotjr1649/marketplace). Its two host catalogs point at the same release tag in this
repository. Installation and updates are owner actions; see the [distribution contract](docs/specs/repository.md#배포).

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
disabling the old plugin to avoid missing guards or running duplicate hooks. Keep other plugins enabled.

To update after the publisher advances the release tag in the catalog:

```bash
claude plugin marketplace update wotjr1649
claude plugin update devflow@wotjr1649
codex plugin marketplace upgrade wotjr1649
codex plugin add devflow@wotjr1649
```

Start a new session after updating. A new tag or GitHub Release alone does not change the catalog; the publisher
updates both catalog entries after the release passes validation. The plugin manifest version must also change for
Claude Code to replace its cached copy. See [release and rollback](docs/specs/repository.md#릴리스와-롤백).
If Codex registers a local checkout of the shared catalog, use the
[local catalog update procedure](https://github.com/wotjr1649/marketplace#codex에-로컬-catalog-checkout을-등록한-경우).

From a checkout of this repository, compare an installed copy with its release tag using
`node bin/devflow-install-check --ref v0.2.0 <installed-plugin-directory>`. It checks tracked files; separately check
for unexpected files left in an installation.

For local development, this repository's catalogs are named `devflow-local`, with the identifier
`devflow@devflow-local`. Codex installs from that catalog; Claude Code can load the same clean worktree directly
with `--plugin-dir`, displayed as `devflow@inline`. See the [local development runbook](docs/local-development.md)
for isolated profiles, startup, source and cache updates, and verification. This development path is not the
release channel ([distribution contract](docs/specs/repository.md#배포)).

## Prerequisites and limits

- Node.js 22 or 24 (the CI matrix), Git and authenticated GitHub CLI (`gh`) must be available to hooks and commands.
  Issue tracking expects a `github.com` origin and an account with write access to that repository.
- Installing the plugin does not configure a project. Add its `.devflow.json` and project files using the
  [repository contract](docs/specs/repository.md); without that profile the resume card and Issue guard do not run.
- Hooks are guardrails, not an OS sandbox. Shell analysis cannot resolve arbitrary runtime-generated commands,
  and host timeouts can bypass hook enforcement. Keep credential scope and host permissions appropriate.
- Codex uses its built-in agents; this plugin does not install Codex agent definitions. A report-only instruction
  does not restrict their tools. See [host facts](docs/research/host-facts.md#codex).
- Before clearing a Codex session, complete the [handoff](docs/specs/ledger.md#동시-세션): release its record last,
  then use `/clear`. Clearing alone can leave the previous session's warning until expiry.

Version changes happen only during an explicitly requested release; see [version policy](docs/specs/repository.md#버전).
Installing, trusting hooks and updating a host remain owner actions.

## License

Apache-2.0. Third-party parts listed in [SOURCES.md](SOURCES.md) keep their own licenses, whose texts are in
[LICENSES/](LICENSES/). See [LICENSE](LICENSE) and [NOTICE](NOTICE).
