# Devflow data handling and terms of use

This page describes how the Devflow plugin handles development records and how its license and the services it uses apply.

## Privacy and data handling

Devflow reads the project instructions and work records used for the requested task. Depending on project setup, it can maintain
a local ledger and session records under `.work/devflow/` and read assignment, approval, and verification records. These records
can contain project paths, task details, and test evidence. Keep private evidence in the project’s approved local storage.

Issue-tracked workflows use the configured GitHub CLI identity to read the selected Issue and may write authorized Issue
updates and checkpoints. Devflow's Issue writer filters messages intended for public posting. Review public Issue and PR text
for private paths, raw prompts, logs, and secrets before posting. The host and GitHub handle model inputs, session history,
accounts, and service data under their own settings and policies.

- [OpenAI policies](https://openai.com/policies/)
- [Anthropic policies and terms](https://www.anthropic.com/legal)
- [GitHub site policies](https://docs.github.com/en/site-policy)

## Terms of use

Devflow is distributed under the [Apache License, Version 2.0](../LICENSE). The services you connect to Devflow, including
Codex, Claude Code and GitHub, have their own applicable terms. Use only accounts, repositories and environments you are
authorized to access. Review the prior approval and target before allowing a workflow to publish, merge, deploy, or remove work.

See the [credential boundary](specs/credentials.md) and the [release and rollback procedure](specs/repository.md#release-and-rollback).
