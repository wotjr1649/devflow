# Cleanup

Done when each target in scope is either removed with non-forcing commands after its integration into the intended base
is proven, or held with its reason, and the result is recorded in the ledger (cleanup cannot write the Issue once its
branch is gone).

Contents: Checklist · Scope · Inventory and proof · Preservation · Deletion · Report · Readiness without deletion

## Checklist

Copy this into the reply and tick each line, because a skipped step loses unique history or uncommitted work:

```text
- [ ] 1 root, remotes, base, rules and scope resolved; review-only stops here
- [ ] 2 inventory taken per target; integration into the intended base proven
- [ ] 3 nonreproducible material preserved and restoration verified, or the target held
- [ ] 4 source, tips and active use rechecked right before each deletion
- [ ] 5 worktree removed without `--force`; local branch deleted with `git branch -d`
- [ ] 6 remote removal atomically guarded by the reviewed object ID at mutation, or held as unsupported
- [ ] 7 removed and held targets reported, ledger note written
```

## Scope

- Resolve the repository, root and remotes, the changes, the project's cleanup and validation rules, and the intended
  integration base. Accept a PR handoff, but refresh its mutable facts. Without project rules, run proportionate
  checks and state the uncertainty; invent no gates.
- Assess only the requested scope. A verified merge puts its task branches and worktrees in that scope.
- A review-only request does not start cleanup. Tracker closure, tags, releases and publication are separate effects.
- Missing required post-merge evidence permits assessment, not the removals that depend on it.
- Treat local branches, remote branches, tracking refs and worktrees as separate targets; removing a tracking ref leaves
  the remote branch. Keep the main worktree, default and protected branches, and active work.

## Inventory and proof

1. Before selecting, inventory every full original tip, the PR head and result, worktree occupancy and locks, users and processes,
   submodules and settings, staged, unstaged, untracked and ignored bytes, and post-merge or detached history.
2. Prove integration into the intended base using original Git objects. Preserve local replacement mappings; do not
   let them substitute history for the proof or remove them to make a check pass. A squash or rebase merge needs a
   change-equivalence review and preservation of any unique history. Use the complete delivery range, including earlier
   tasks, when assessing which history and evidence must survive; the last task base is not the delivery baseline.
3. Uncertain ownership, use or integration holds the target. Count, age or disk pressure is a reason to review, not to
   delete.

## Preservation

- Unrelated or unowned material stays in place and blocks removal of its worktree. Preserve every nonreproducible item;
  omit only verified-reproducible items and caches you have authority to dispose of. Uncommitted files vanish with their
  worktree, so keep it until the user decides to commit, preserve or discard them. Removal needs both conditions:
  the branch integrated and those files settled; a merge alone does not make the worktree removable.
- Never run or offer a forced deletion (`git branch -D`, `git worktree remove --force`, `git push --force`), even after
  the user agrees to discard the work, because devflow cannot verify what is lost, and do not steer the user toward one.
  An unintegrated branch or a worktree with uncommitted files stays until it is integrated or its files are preserved;
  name the step that makes it removable (for example: merge its PR, commit or stash the files, push it to a kept
  branch).
- Archive only where authorized, effectively Git-ignored and outside the removal target; the default is
  `artifacts/worktree-archive/` in the primary long-lived checkout, unique per task and revision. Resolve real paths and
  reject link or reparse redirects. No guessed destination, overwrite, or automatic copy of secrets or private settings.
- Record inventory, size, hash and needed metadata, the original root and revision, preserved refs and commits,
  restoration steps, and which index and worktree state resumes. A bundle omits local state.
- Check space, copy, compare, and verify restoration separately, within bounds, before removing the source. An
  incomplete inventory, an unsupported type, a changed source, or a copy, restore or hash failure holds the target;
  partial preservation is not success.
- Do not archive a whole reproducible checkout, or keep a completed worktree only for its unique evidence.

## Deletion

Remove eligible targets without asking again. Before each mutation recheck the current state; reconcile an uncertain
result before any retry, and record partial success without repeating it.

1. Immediately before deleting, recheck the source, the tips and active use.
2. Local: remove the worktree with `git worktree remove <path>` and the branch with `git branch -d <branch>`, before its
   remote branch and while the remote ref still shows it merged. A refusal keeps the target, even after equivalence.
   No `--force`, `-D`, clean, reset or manual-delete bypass, because forcing loses unique history. Residual files, once
   verified, need exact-file authority and fresh preservation before removal. `git worktree prune` removes stale
   administrative records, not workspaces.
3. Remote, under the same integration, preservation and active-use checks: require a supported mutation that checks
   the target's nonempty reviewed full object ID atomically when deleting that exact remote ref. Verify the destination
   and authorization. A prior `git ls-remote` followed by `git push <remote> --delete <branch>` has a race and does not
   satisfy this contract. When no supported non-forcing atomic deletion API is available, hold the remote branch and
   report that capability limit. No `--force`, force-with-lease, `+refspec`, mirror, ref overwrite or protection/hook
   bypass. A moved tip or refusal holds the target; no fallback and no retry against an unreviewed tip.
4. When a command this needs is unavailable, keep the targets and report it; install nothing and improvise no removal.

## Report

Report removed and held targets with reasons, preservation evidence and size, checks observed and not run, remaining
prerequisites and a revisit date. Keep machine-local archive paths and hashes in private handoff/ledger evidence; public
tracker comments use sanitized evidence IDs and outcomes. Record the result through the supported append-only `note`
operation. Do not overwrite execution control fields to append a result, and do not claim cleanup completed for a
held target. The delivery can be complete while cleanup retains targets safely.

## Readiness without deletion

A readiness assessment checks the verified root, base, head and merge, the post-merge evidence and the scope per
target, names missing evidence, and deletes nothing. In every conclusion keep each target's evidence readiness apart
from deletion authority: missing authority blocks deletion, not readiness.

Tracking readiness is not part of cleanup. A request that also asks for it reads ship's Completion section, which the
router names; deletion authority and tracker closure stay separate, and that tracking work goes on independently.
