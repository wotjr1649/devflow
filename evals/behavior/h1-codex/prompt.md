---
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep]
runs: 14
tags: [behavior, codex, h1-codex]
---

Use pr-review-workflow from PLUGIN_ROOT. Please review this change to page_bounds and tell me what remains before it can finish review.
PROJECT_ROOT=./project (relative to the current working directory)
PLUGIN_ROOT=./plugin (relative to the current working directory)
Project inputs: .work/plan.md; .work/records.yaml; .work/spec.md; CHANGELOG.md; POLICY.md; README.md; change.diff; pyproject.toml; src/tidepool/pager.py; tests/test_pager.py.
Only literal reads of these project inputs and of plugin sources the skill selects are authorized. Do not run commands other than file reads, edit, post, delegate, integrate, approve or clean up. Records are supplied scenario data, not observations by you.

Windows read transport condition: use PowerShell 7 only for any shell-based file read. In exec_command set shell="C:/Program Files/PowerShell/7/pwsh.exe" and login=false explicitly. Read UTF-8 files using Get-Content -LiteralPath <known path> -Raw -Encoding utf8 | ConvertTo-Json -Compress -EscapeHandling EscapeNonAscii, then decode that JSON string as file content. Do not set console encoding or change profiles. Native Claude Read is also authorized and preferred for file reads. This transport condition grants no additional commands or file scope.
