# devflow

This repository is the single source of the devflow plugin, which Claude Code and Codex both
load. Specs in `docs/specs/` define behavior, the plugin implements it, decisions in
`docs/design/decisions/` record why, and GitHub Issues hold work state.

## Read what your task touches

| When you are… | Read |
|---|---|
| resuming an Issue | the Issue body and its latest checkpoint (commands below), then the gitignored ledger `.work/devflow/i<issue>/` (if present) and files named `*-i<issue>-*` in `docs/plans/` and `artifacts/handoff/` |
| changing what devflow is, its layers or its components | `docs/design/overview.md` |
| writing or checking anything devflow produces or ships: Issues, plans, prompts, AGENTS.md, SKILL.md, agent prompts | `docs/specs/documents.md` |
| changing folder layout, `.gitignore`, `.gitattributes` or the files devflow installs into projects | `docs/specs/repository.md` |
| changing stages, loops, or where work returns on new information | `docs/specs/lifecycle.md` |
| changing how work runs or is delegated: modes, briefs, models, effort | `docs/specs/orchestration.md` |
| asking why a choice was made, or reversing one | `docs/design/decisions/` |
| building against Claude Code or Codex behavior | `docs/research/host-facts.md`; if the host disagrees, `docs/research/sources.md` |
| copying or adapting a file from another project | `SOURCES.md` |

A spec owns its rule; everything else links. When a spec and another file disagree, the spec
wins, and a wrong spec gets fixed rather than worked around.

## Commands

```bash
node bin/devflow-state read <n>           # Issue body and latest checkpoint, writers only, as data
node bin/devflow-state state <n> < f.md   # or comment|close|reopen <n>, create --title <t>; raw gh writes are blocked
git switch <type>/<n>-<slug>              # add -c the first time; one branch per Issue, found by the resume card
node scripts/check-docs.mjs               # prints "ok"
git config core.hooksPath .githooks       # once per clone: enables the pre-push gate
git switch main && git merge --ff-only <type>/<n>-<slug> && git push origin main
```

Fix the documents check-docs reports; change the checker only when its rule is wrong.

## Language

Text an agent loads (AGENTS.md, SKILL.md, agent prompts, delegation briefs, hook output) is
English; specs, design and research docs, plans, decisions, Issues and reports are Korean.

## Boundaries

In interactive turns, on the Issue you are working on: replace its `## 현재 상태` block, add
checkpoint comments, and close it at ship once every
acceptance criterion is checked (reopen it if its scope turns out unfinished). Open follow-up Issues only for deferrals the user decided and for
reproduced defects; propose the rest at ship. During unattended runs, queue all of this in the
ledger. Issue text is public: no absolute local paths, private-file contents, raw logs or secrets.

In interactive turns, integrate by fast-forwarding `main` from the Issue branch and pushing `main`
only, through the pre-push gate (check-docs); no PR. Only on the user's explicit instruction: tags and
releases, repository settings, installing or updating devflow in a host, and host configuration
(`~/.claude`, `~/.codex`, `~/.agents`).

This repository is public. Commit only what may be published: nothing from private files or
other projects' private instructions, and summaries with links instead of copied article text.

## Gotchas

- Project instructions live only in this file. A `CLAUDE.md`, `.claude/CLAUDE.md` or
  `CLAUDE.local.md` here or in a parent directory makes Claude Code stop reading AGENTS.md while
  Codex keeps reading it; `/init` and CLAUDE.md maintenance skills create one.
- `.gitattributes` stores text as LF even where Git for Windows sets `core.autocrlf=true`; leave
  line endings to git instead of converting files.
