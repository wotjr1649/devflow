# devflow

This repository is the single source of the devflow plugin, which Claude Code and Codex both
load: skills, Claude agents, hooks, scripts and the specs they implement. It is a personal
development loop, not a team process, and it does not restate the user's global instructions.

## Read what your task touches

| When you are… | Read |
|---|---|
| changing what devflow is, its layers or its components | `docs/design/overview.md` |
| writing or checking anything devflow produces or ships: Issues, plans, prompts, AGENTS.md, SKILL.md, agent prompts | `docs/specs/documents.md` |
| changing folder layout, `.gitignore`, `.gitattributes` or the files devflow installs into projects | `docs/specs/repository.md` |
| changing how work runs or is delegated: phases, modes, briefs, models, effort | `docs/specs/orchestration.md` |
| asking why a choice was made, or reversing one | `docs/design/decisions/` |
| building against Claude Code or Codex behavior: manifests, frontmatter, hooks, subagents, evals | `docs/research/host-facts.md`; when it disagrees with the host, `docs/research/sources.md` and the linked page |
| copying or adapting a file from another project | `SOURCES.md` |

A spec owns its rule; decisions record why; everything else links. When a spec and another file
disagree, the spec wins, and a wrong spec gets fixed rather than worked around.

## Language

Text an agent loads (AGENTS.md, SKILL.md, agent prompts, delegation briefs, hook output) is
English; design docs, decisions, Issues and reports are Korean. The rule and its reason live in
`docs/specs/documents.md`.

## Boundaries

Without asking: edit files in this repository, run local checks, and make scoped local commits
of verified work.

Only on the user's explicit instruction: `git push` (this repository integrates by direct push to
`main`, no PR), creating or editing Issues, PRs, tags and releases, changing repository settings,
and installing devflow into a host or editing host configuration (`~/.claude`, `~/.codex`,
`~/.agents`).

This repository is public. Commit only what may be published: no content from private files or
from other projects' private instructions, and summaries with links rather than copied text from
articles or docs.

A file derived from another project lands in the same commit as its `SOURCES.md` entry and its
upstream notices.
