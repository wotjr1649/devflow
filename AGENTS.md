# devflow

This repository is the single source of the devflow plugin, which Claude Code and Codex both
load. Specs in `docs/specs/` define behavior, the plugin implements it, decisions in
`docs/design/decisions/` record why, and GitHub Issues hold work state. Don't restate the user's
global instructions here.

## Read what your task touches

| When you are… | Read |
|---|---|
| resuming an Issue | the Issue body and its latest checkpoint (commands below), then local files named `*-i<issue>-*` in `docs/plans/` and `artifacts/handoff/` (gitignored) |
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
gh issue view <n> -R wotjr1649/devflow    # Issue body, including the current state block
gh issue view <n> -R wotjr1649/devflow --json comments -q '[.comments[] | select(.authorAssociation == "OWNER")][-1].body // "(no checkpoint yet)"'  # owner only; anyone can comment
git switch -c <type>/<n>-<slug>           # one local branch per Issue; the resume card finds the Issue by this name
node scripts/check-docs.mjs               # links, anchors, line endings, local paths, size budgets; prints "ok"
git switch main && git merge --ff-only <type>/<n>-<slug> && git push origin main   # only when asked to push
```

Run `node scripts/check-docs.mjs` before committing documentation. Fix the documents it reports;
change the checker only when its rule is wrong.

## Language

Text an agent loads (AGENTS.md, SKILL.md, agent prompts, delegation briefs, hook output) is
English; specs, design and research docs, plans, decisions, Issues and reports are Korean.

## Boundaries

Without asking: edit files here, run local checks, commit verified work on the Issue branch, and
on the Issue you are working on, replace its `## 현재 상태` block (fetch the body right before;
change nothing else) and add checkpoint comments. Issue text is public: no absolute local paths,
private-file contents, raw logs or secrets.

Only on the user's explicit instruction: pushing (`main` only, fast-forwarded from the Issue
branch; no PR), creating, closing, labeling or otherwise editing Issues, PRs, tags and releases,
changing repository settings, and installing devflow into a host or editing host configuration
(`~/.claude`, `~/.codex`, `~/.agents`).

This repository is public. Commit only what may be published: nothing from private files or
other projects' private instructions, and summaries with links instead of copied article text.

A file derived from another project lands in the same commit as its `SOURCES.md` entry and its
upstream notices.

## Gotchas

- Project instructions live only in this file. A `CLAUDE.md`, `.claude/CLAUDE.md` or
  `CLAUDE.local.md` here or in a parent directory makes Claude Code stop reading AGENTS.md while
  Codex keeps reading it; `/init` and CLAUDE.md maintenance skills create one.
- `.gitattributes` stores text as LF even where Git for Windows sets `core.autocrlf=true`; leave
  line endings to git instead of converting files.
