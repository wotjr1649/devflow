# Workspace

Inspect root/remotes, HEAD/upstream, worktree occupancy, active users/processes, and staged/unstaged/untracked/ignored ownership. Preserve unrelated state. Check hooks and missing local-only tests/guidance before checkout/scripts; inspect restoration effects. Clean status or zero tests is not readiness.

Reuse the same task's active branch. After merge, verify required post-merge gates; start separate work on a new branch from the project's verified base SHA. Cached refs are not fresh remote evidence. Detached/unborn/non-Git inputs need an explicit path, not guessed main.

Use the current folder if safe; otherwise prepare a worktree for isolation/parallel work. Validate name with `git check-ref-format --branch`, collisions, base ancestry, and authorized unoccupied destination. Never force occupied branches, reset/stash/clean unrelated work, bypass hooks, or prune others' worktrees.

Recheck branch/HEAD, tracking, preserved bytes/index, required local inputs, and proportionate baseline results after preparation. Report missing inputs/checks and task-created state for recovery.

For separately authorized non-repository deliverables, record exact targets, versions/hashes and validation. A tracking branch SHA does not identify external artifact bytes. Use a branch for repository change work; do not invent a repository diff or PR for local-only global artifacts.
