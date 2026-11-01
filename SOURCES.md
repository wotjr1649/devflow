# Sources

Every file in this repository that is derived from another project has a row here.

| devflow path | Upstream | Commit | Upstream path | License | Changes |
|---|---|---|---|---|---|
| `skills/` (three skills, 10 files) | owner's deployed skill set (`~/.claude/skills` and `~/.agents/skills`, identical) | no VCS; per-file SHA-256 under [Imported owner skills](#imported-owner-skills) | `<skill>/…` | Apache-2.0 (owner) | 2026-10-01 import `1d1b75d`: LF line endings; imported snapshots and per-file hashes are recorded below. Changes in devflow: `development-start` — descriptions, entry routing, filtered Issue writes and intent updates (`3744f51`, `7a5c12d`, `0b38e16`, `28237f5`); `pr-review-workflow` — descriptions, cleanup routing, verification and Issue completion (`3744f51`, `add5aef`, `7a5c12d`, `0b38e16`, `3a9bb6f`). `grilling`, `prompt-generator` and `writing-for-agents` were imported too and removed in #124. Current behavior is defined by the skills and specs. |
| removed in #124: `skills/writing-for-agents/SKILL.md`, `skills/grilling/SKILL.md`, `skills/grilling/agents/openai.yaml` | [mattpocock/skills](https://github.com/mattpocock/skills) | `0ab1b63` - the revision copied: the owner's clone was made at this commit on 2026-08-20 and never fetched, and the owner's repository added the copies on 2026-08-21 (pinned afterwards, from the clone's reflog and those dates) | `skills/productivity/writing-for-agents/SKILL.md` (and the Invocation section of `SKILL-MECHANICS.md`), `skills/productivity/grilling/SKILL.md`, `skills/productivity/grilling/agents/openai.yaml` | MIT, Copyright (c) 2026 Matt Pocock: [LICENSES/mattpocock-skills-MIT.txt](LICENSES/mattpocock-skills-MIT.txt); the owner's changes Apache-2.0 | Adapted privately by the owner, then imported with the owner's skills on 2026-10-01. `writing-for-agents`: condensed and rewritten, several sentences kept nearly as written, a safety-floor exception added, the hierarchy and splitting sections dropped. `grilling/SKILL.md`: rewritten from the design-tree and frontier concepts, one question per round by default. `openai.yaml`: copied as is; in devflow its short description now matches one question at a time. Removed in #124; no file in this repository now carries text from this upstream (no shared six-word passage with `0ab1b63`), and the license text stays for the releases that shipped these files. |
| `skills/decision-interview/`, `skills/write-prompts/`, `skills/audit-prompts/`, `skills/agent-instruction-design/` (`SKILL.md`, `agents/openai.yaml`) | owner-supplied skill drafts | no VCS; per-file SHA-256 under [Owner skill drafts](#owner-skill-drafts) | `<skill>/…` | Apache-2.0 (owner) | Added in #124 as independent skills with minimal edits: descriptions narrowed to non-overlapping situations, revision left to the caller or user instead of another skill, a further audit pass only after a change or new evidence, product changes during an interview limited to explicitly authorized work no open decision affects, file delivery for requested prompt files, size reporting only when size matters. `agents/openai.yaml` is unchanged. The accompanying design notes are not imported. |

## Patterns without copied text

These parts are devflow's own text. They take ideas from the projects below and copy no passage, so they have no row
above; they are listed so the ideas can be traced.

| devflow path | Ideas from |
|---|---|
| `skills/devflow/`, `references/` | [obra/superpowers](https://github.com/obra/superpowers) `5bf4e78`: the spike/bounded/architectural paths, the plan task structure, BASE recorded before delegation, per-task review, failing test first; [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) `feature-dev`: comparing two or three approaches |
| `references/discover.md`, `docs/specs/lifecycle.md` (discover row) | [obra/superpowers](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/brainstorming/SKILL.md) `2ce8aa15`, `skills/brainstorming/SKILL.md`: a request that already says what it wants goes ahead without questions, look before asking, lay out approaches before building; adapted to discover's dispositions and devflow's existing start and decision owners |
| `agents/explorer.md` | `feature-dev` `code-explorer`: return the key files and let the main session read them |
| `agents/reviewer.md` | `pr-review-toolkit` and superpowers' task reviewer: an explicit BASE..HEAD diff, no verdict handed over |
| `agents/implementer.md`, `agents/explorer.md` (diagnosis) | superpowers: status words for delegated work, a stronger model after repeated failures, cause before fix |
| `hooks/`, `.claude-plugin/`, `.codex-plugin/`, `.agents/plugins/` | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail): one repository root packaged for both hosts, a Node hook runtime |

## Imported owner skills

Imported 2026-10-01. The deployed bytes are hashed as read; the committed bytes are the git blob.

| File | Deployed SHA-256 | Committed SHA-256 |
|---|---|---|
| `skills/development-start/SKILL.md` | `e544d193f099fc85fe9774935a4553e90136555aa3320a9e9f0e9b0047d41748` | `e544d193f099fc85fe9774935a4553e90136555aa3320a9e9f0e9b0047d41748` |
| `skills/development-start/references/tracking.md` | `26de5e33946fa2018e72361e0ff96664940ec2a119afd2f69db10fdb14e7d33a` | `26de5e33946fa2018e72361e0ff96664940ec2a119afd2f69db10fdb14e7d33a` |
| `skills/development-start/references/workspace.md` | `804e570072ec347fa3f64e1582d522b4879a95538dc396a5ee7cd6a42311cf01` | `804e570072ec347fa3f64e1582d522b4879a95538dc396a5ee7cd6a42311cf01` |
| `skills/pr-review-workflow/SKILL.md` | `105d365cdc685c18184b46647809ddcaab837a623628debff8e8bd0452d4b3a3` | `105d365cdc685c18184b46647809ddcaab837a623628debff8e8bd0452d4b3a3` |
| `skills/pr-review-workflow/references/cleanup.md` | `52c0b721dbff64bb0f73ce5247a251ce25f43ec6207f04c0b678dfa5f52762d4` | `52c0b721dbff64bb0f73ce5247a251ce25f43ec6207f04c0b678dfa5f52762d4` |
| `skills/pr-review-workflow/references/completion.md` | `8dd76d3d2463ee2e6d536d0bef9c99b3ad6a3f677d68e125deb3933cfacb8eb5` | `8dd76d3d2463ee2e6d536d0bef9c99b3ad6a3f677d68e125deb3933cfacb8eb5` |
| `skills/pr-review-workflow/references/integration.md` | `93f087eff9740db19a535be329b33ff826566a136cbb4167f9db306756a367fc` | `93f087eff9740db19a535be329b33ff826566a136cbb4167f9db306756a367fc` |
| `skills/pr-review-workflow/references/review.md` | `075865be0cc0bae30f2adf0824e4e0c1f3778b62dad0ff41c11477a947c9710e` | `075865be0cc0bae30f2adf0824e4e0c1f3778b62dad0ff41c11477a947c9710e` |
| `skills/workspace-cleanup/SKILL.md` | `8d391c77e71090821aab15eb69ae9182b2833774fada74c33d2854fbb022dd69` | `8d391c77e71090821aab15eb69ae9182b2833774fada74c33d2854fbb022dd69` |
| `skills/workspace-cleanup/references/remote-deletion.md` | `c236f884d40de1a30893915643fb3e6808d23bc2ca5deb36658fffd04c6efa31` | `c236f884d40de1a30893915643fb3e6808d23bc2ca5deb36658fffd04c6efa31` |

## Owner skill drafts

Supplied 2026-11-01 for #124. Each `SKILL.md` was edited before commit, so its committed bytes differ; each
`agents/openai.yaml` is committed as supplied.

| File | Supplied SHA-256 |
|---|---|
| `skills/agent-instruction-design/SKILL.md` | `2762a77251c0463048d38c38d9e144286df4296e14e064e50a1f53d64dadc070` |
| `skills/agent-instruction-design/agents/openai.yaml` | `2ae5ea6061321ec3a4e3a5ceca0327ac8910b2275c9180d7cad47f5a23eada4e` |
| `skills/audit-prompts/SKILL.md` | `146b7ce0c8b260abc9cf5746f9eee3a51e936cb14c0502fac4f77877972ee75c` |
| `skills/audit-prompts/agents/openai.yaml` | `98ede49280f901321069272e4b601ee3b03c40a3b29c3cda3c99e8ea484da43f` |
| `skills/decision-interview/SKILL.md` | `89a7f1d95a0d763609d61f7e70267b440748310bb547b3cb652e0fc0d3e6d963` |
| `skills/decision-interview/agents/openai.yaml` | `8f7cb2ccfa9636910591a30ffec171b43124b78a9c0d8e7660b87a2802610d73` |
| `skills/write-prompts/SKILL.md` | `9416839996a125faadb80677c519ff58c70351e3df6db40f58b22c557f15796b` |
| `skills/write-prompts/agents/openai.yaml` | `f641eabe4f2cbcca1894df07be6f6f60cdc97f76f53bdcf5de9b3e87789e5bbe` |

## Rules

- Pin the upstream commit at copy time and add the row in the same commit as the copy.
- Third-party Apache-2.0 files keep their notices and get a header line stating they were modified in devflow. The
  owner's own skills are licensed by the owner here, so their changes are recorded in the row above instead.
- MIT files keep their copyright and permission notice; the full upstream license text goes to
  `LICENSES/<upstream>-MIT.txt`.
- Copy only the parts listed under "Take" in the Integration scope table below; for anything else, record the choice and reason in [current decisions](docs/design/current-decisions.md) first, with the change history in the Issue and git.

## Integration scope

| Upstream | License | Take | Leave |
|---|---|---|---|
| [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) `feature-dev` | Apache-2.0 | explorer and architect agents; "return key files, then read them" pattern | five approval gates; clean-architecture default |
| same, `pr-review-toolkit` | Apache-2.0 | review lenses (code, silent failures, tests, types, comments); reviewer selection by change type | code-simplifier |
| same, `claude-md-management`, `claude-code-setup`, `hookify`, `plugin-dev` | Apache-2.0 | instruction-file quality criteria; automation patterns; hook rule examples; plugin and skill validators | Claude-only wording |
| [obra/superpowers](https://github.com/obra/superpowers) `5bf4e78` | MIT | spike/bounded/architectural paths; plan task structure (files, interfaces, global constraints, review focus); BASE recorded before delegation; per-task review; worktree detection; failing-test-first check | the session bootstrap that forces skill use; automatic `.gitignore` commits; verification skill that duplicates the global contract |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | MIT | dual-host packaging (`.claude-plugin`, `.codex-plugin`, `.agents/plugins`); Node hook runtime | — |
| owner's deployed skill set: development-start, pr-review-workflow, workspace-cleanup (grilling, writing-for-agents and prompt-generator removed in #124) | owner; Apache-2.0 for the owner's contributions | all six imported deployed snapshots (three remain), normalized to LF; per-file deployed and committed SHA-256 values are recorded under Imported owner skills; adaptations are recorded in the attribution table | obsolete copies outside this repository; remove or redirect them only on owner instruction |
