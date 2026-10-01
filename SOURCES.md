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
| owner's skills: development-start, pr-review-workflow, workspace-cleanup, grilling, writing-for-agents, prompt-generator | owner; published under Apache-2.0 once moved here | moved in whole, then adapted to the specs | — |

Installed rather than copied: `skill-creator` (evals, trigger tuning), `session-report` (token and
cache reports), `security-guidance` (optional security layer).
