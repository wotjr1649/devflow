# Sources

Every file in this repository that is derived from another project has a row here.

| devflow path | Upstream | Commit | Upstream path | License | Changes |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

## Rules

- Pin the upstream commit at copy time and add the row in the same commit as the copy.
- Apache-2.0 files keep their notices and get a header line stating they were modified in devflow.
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
| owner's deployed skill set: development-start, pr-review-workflow, workspace-cleanup, grilling, writing-for-agents, prompt-generator | owner; published under Apache-2.0 once moved here | all six from the deployed copies: an import commit that changes only line endings to LF (four deployed files use CRLF), recording per file the SHA-256 of the deployed bytes and of the committed bytes, then adaptations in later commits | older copies in a legacy private repository and in project working folders |

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
