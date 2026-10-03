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
  [repository](docs/specs/repository.md), [metrics](docs/specs/metrics.md)

## Install

Hosts load a local plugin in place, so devflow is installed from a separate deploy worktree at a commit of `main`,
never from the working tree you edit ([ADR-0002](docs/design/decisions/ADR-0002-repository-root-is-plugin-root.md)).
Installing and updating are the owner's call. Host behaviour behind each step:
[host-facts](docs/research/host-facts.md).

First install:

```bash
git worktree add --detach ../devflow-deploy main
```

- Claude Code: add `../devflow-deploy` as a marketplace and install `devflow@devflow` from it with `/plugin`, then run
  `/reload-plugins` in an open session. Claude loads the plugin from that folder.
- Codex: `codex plugin marketplace add <path to devflow-deploy>`, then `codex plugin add devflow@devflow`. Codex copies
  the plugin into `~/.codex/plugins/cache/devflow/devflow/<version>/`; start a new session and trust its hooks.

Update to the current `main`, then check that every file `main` tracks is the same in both copies (files left over in a
copy, such as a skill `main` removed, are not checked):

```bash
git -C ../devflow-deploy checkout --detach main
codex plugin add devflow@devflow < /dev/null
node bin/devflow-install-check --ref main ../devflow-deploy ~/.codex/plugins/cache/devflow/devflow/0.1.0
```

Claude picks up edits to the plugin with `/reload-plugins`; each hook call starts a new `node` process that loads the
hook script (`hooks/hooks.json`), so a script change applies at once.
Codex does not ask to trust the hooks again when only the hook scripts change; the trust is recorded per entry of
`hooks/hooks.json`.

## License

Apache-2.0. Third-party parts listed in [SOURCES.md](SOURCES.md) keep their own licenses, whose texts are in
[LICENSES/](LICENSES/). See [LICENSE](LICENSE) and [NOTICE](NOTICE).
