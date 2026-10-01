# Sources

Every file in this repository that is derived from another project has a row here.

| devflow path | Upstream | Commit | Upstream path | License | Changes |
|---|---|---|---|---|---|
| `skills/` (six skills, 14 files) | owner's deployed skill set (`~/.claude/skills` and `~/.agents/skills`, identical) | no VCS; per-file SHA-256 under [Imported owner skills](#imported-owner-skills) | `<skill>/…` | Apache-2.0 (owner) | 2026-10-01 import `1d1b75d`: line endings only (the copies were already LF, so no bytes changed). Then devflow adaptations: `development-start` (`SKILL.md`, `references/tracking.md`: description, no resume, Issue writes through `devflow-state`; `3744f51`, `7a5c12d`, `0b38e16`); `pr-review-workflow` (`SKILL.md`, `references/cleanup.md`, `completion.md`, `integration.md`: description without standalone review, cleanup skill called by name, local gate, criteria checked before closing; `3744f51`, `add5aef`, `7a5c12d`, `0b38e16`); `grilling` and `prompt-generator` (`SKILL.md`: description, a devflow section in prompt-generator; `3744f51`). `workspace-cleanup` and `writing-for-agents` are unchanged. |

## Imported owner skills

Imported 2026-10-01. The deployed bytes are hashed as read; the committed bytes are the git blob.

| File | Deployed SHA-256 | Committed SHA-256 |
|---|---|---|
| `skills/development-start/SKILL.md` | `e544d193f099fc85fe9774935a4553e90136555aa3320a9e9f0e9b0047d41748` | `e544d193f099fc85fe9774935a4553e90136555aa3320a9e9f0e9b0047d41748` |
| `skills/development-start/references/tracking.md` | `26de5e33946fa2018e72361e0ff96664940ec2a119afd2f69db10fdb14e7d33a` | `26de5e33946fa2018e72361e0ff96664940ec2a119afd2f69db10fdb14e7d33a` |
| `skills/development-start/references/workspace.md` | `804e570072ec347fa3f64e1582d522b4879a95538dc396a5ee7cd6a42311cf01` | `804e570072ec347fa3f64e1582d522b4879a95538dc396a5ee7cd6a42311cf01` |
| `skills/grilling/SKILL.md` | `fb2be666081c8dde7fa2a06b0b981fa7b2e1927c524bb7c7222bb0a06424a688` | `fb2be666081c8dde7fa2a06b0b981fa7b2e1927c524bb7c7222bb0a06424a688` |
| `skills/grilling/agents/openai.yaml` | `1411d7df7d99b7e621a1ff8283c8133cc2464be63d064e52d8ce169c6800ee9b` | `1411d7df7d99b7e621a1ff8283c8133cc2464be63d064e52d8ce169c6800ee9b` |
| `skills/pr-review-workflow/SKILL.md` | `105d365cdc685c18184b46647809ddcaab837a623628debff8e8bd0452d4b3a3` | `105d365cdc685c18184b46647809ddcaab837a623628debff8e8bd0452d4b3a3` |
| `skills/pr-review-workflow/references/cleanup.md` | `52c0b721dbff64bb0f73ce5247a251ce25f43ec6207f04c0b678dfa5f52762d4` | `52c0b721dbff64bb0f73ce5247a251ce25f43ec6207f04c0b678dfa5f52762d4` |
| `skills/pr-review-workflow/references/completion.md` | `8dd76d3d2463ee2e6d536d0bef9c99b3ad6a3f677d68e125deb3933cfacb8eb5` | `8dd76d3d2463ee2e6d536d0bef9c99b3ad6a3f677d68e125deb3933cfacb8eb5` |
| `skills/pr-review-workflow/references/integration.md` | `93f087eff9740db19a535be329b33ff826566a136cbb4167f9db306756a367fc` | `93f087eff9740db19a535be329b33ff826566a136cbb4167f9db306756a367fc` |
| `skills/pr-review-workflow/references/review.md` | `075865be0cc0bae30f2adf0824e4e0c1f3778b62dad0ff41c11477a947c9710e` | `075865be0cc0bae30f2adf0824e4e0c1f3778b62dad0ff41c11477a947c9710e` |
| `skills/prompt-generator/SKILL.md` | `d5e334f732783fc0158a29dc1208270daa3cc928485b5874bfec72c000eda62d` | `d5e334f732783fc0158a29dc1208270daa3cc928485b5874bfec72c000eda62d` |
| `skills/workspace-cleanup/SKILL.md` | `8d391c77e71090821aab15eb69ae9182b2833774fada74c33d2854fbb022dd69` | `8d391c77e71090821aab15eb69ae9182b2833774fada74c33d2854fbb022dd69` |
| `skills/workspace-cleanup/references/remote-deletion.md` | `c236f884d40de1a30893915643fb3e6808d23bc2ca5deb36658fffd04c6efa31` | `c236f884d40de1a30893915643fb3e6808d23bc2ca5deb36658fffd04c6efa31` |
| `skills/writing-for-agents/SKILL.md` | `02f65837a753f71407868d3d223cf1bd7a1a145d7b7c9f52b3c117ef8b3eeb31` | `02f65837a753f71407868d3d223cf1bd7a1a145d7b7c9f52b3c117ef8b3eeb31` |

## Rules

- Pin the upstream commit at copy time and add the row in the same commit as the copy.
- Third-party Apache-2.0 files keep their notices and get a header line stating they were modified in devflow. The
  owner's own skills are licensed by the owner here, so their changes are recorded in the row above instead.
- MIT files keep their copyright and permission notice; the full upstream license text goes to
  `LICENSES/<upstream>-MIT.txt`.
- Copy only the parts listed under "Take" below; anything else needs a decision record first.

## Candidates

| Upstream | License | Take | Leave |
|---|---|---|---|
| [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) `feature-dev` | Apache-2.0 | explorer and architect agents; "return key files, then read them" pattern | five approval gates; clean-architecture default |
| same, `pr-review-toolkit` | Apache-2.0 | review lenses (code, silent failures, tests, types, comments); reviewer selection by change type | code-simplifier |
| same, `claude-md-management`, `claude-code-setup`, `hookify`, `plugin-dev` | Apache-2.0 | instruction-file quality criteria; automation patterns; hook rule examples; plugin and skill validators | Claude-only wording |
| [obra/superpowers](https://github.com/obra/superpowers) `5bf4e78` | MIT | spike/bounded/architectural paths; plan task structure (files, interfaces, global constraints, review focus); BASE recorded before delegation; per-task review; worktree detection; failing-test-first check | the session bootstrap that forces skill use; automatic `.gitignore` commits; verification skill that duplicates the global contract |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | MIT | dual-host packaging (`.claude-plugin`, `.codex-plugin`, `.agents/plugins`); Node hook runtime | — |
| owner's deployed skill set: development-start, pr-review-workflow, workspace-cleanup, grilling, writing-for-agents, prompt-generator | owner; published under Apache-2.0 once moved here | all six from the deployed copies as they are at import time: an import commit that only normalizes line endings to LF, recording per file the SHA-256 of the deployed bytes and of the committed bytes, then adaptations in later commits | the copies in the owner's private seed repository (retired or pointed here after the import, on instruction) and older copies in project working folders |

## Known pitfalls in the candidates

- `feature-dev` agents list tool names the current hosts no longer have (`LS`, `NotebookRead`, `KillShell`,
  `BashOutput`) and have no `Bash`, so they cannot run `git diff` themselves. Rewrite the `tools` line.
- `pr-review-toolkit` agents have no `tools` limit, so they can edit files, and they default to reviewing the
  unstaged `git diff`. Restrict tools and pass the BASE..HEAD diff explicitly.
- `pr-review-workflow` links to `../workspace-cleanup/SKILL.md`; move the two skills together and update the path.
- superpowers `subagent-driven-development/SKILL.md` is about 32 KB, far over the skill budget; take the pattern,
  not the file.
- `feature-dev`'s command stops for approval five times; devflow's gates come from the global instructions instead.

Installed rather than copied: `skill-creator` (evals, trigger tuning), `session-report` (token and
cache reports), `security-guidance` (optional security layer).
