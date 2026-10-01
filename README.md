# devflow

An Issue-driven development loop for Claude Code and Codex, shipped as one plugin
that both hosts load.

devflow keeps work state in GitHub Issues so a session can resume after compaction
or a restart, lets one main agent decide and write code while subagents read and
verify, and backs its rules with scripts, hooks and CI rather than prose alone.

**Status:** design stage. There is nothing to install yet.

- What devflow is: [docs/design/overview.md](docs/design/overview.md)
- Why each choice was made: [docs/design/decisions/](docs/design/decisions/)
- Contracts: [documents](docs/specs/documents.md), [repository](docs/specs/repository.md),
  [orchestration](docs/specs/orchestration.md)

## License

Apache-2.0. See [LICENSE](LICENSE), [NOTICE](NOTICE) and [SOURCES.md](SOURCES.md).
