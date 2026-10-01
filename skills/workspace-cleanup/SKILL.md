---
name: workspace-cleanup
description: Use when assessing or performing authorized Git branch/worktree cleanup, with or without a PR. Excludes tracker closure and releases.
---

# Workspace cleanup

Resolve repository/root/remotes, changes, project cleanup/validation rules and intended integration base. Accept a PR handoff, but refresh mutable facts. Missing rules require proportionate checks and stated uncertainty, not invented gates. Assess only the requested scope; a verified merge puts its task branches and worktrees in that scope. Missing required post-merge evidence permits assessment, not dependent removal. Review-only does not initiate cleanup. Tracker closure, tags, releases and publication are separate.

Before each mutation recheck current state. Remove eligible targets without reapproval and report held targets. Reconcile uncertain results before retries; record partial success without repeating it.

Treat local/remote branches, tracking refs and worktrees separately; tracking-ref removal leaves the remote branch. Preserve main worktree/default/protected branches and active work.

Before selection inventory all tips/PR head/result, worktree occupancy/locks, users/processes, submodules/settings, staged/unstaged/untracked/ignored bytes, post-merge/detached history. Prove intended-base integration, not upstream; squash/rebase needs change-equivalence review and unique-history preservation. Uncertain ownership/use/integration holds target.

Unrelated/unowned material stays in place, blocking its worktree removal. Preserve every nonreproducible item; omit only verified-reproducible items/caches with disposal authority.

Archive: authorized, effectively Git-ignored, outside removal target; default artifacts/worktree-archive/ in the primary long-lived checkout, unique task/revision. Resolve real paths; reject link/reparse redirects. No guessed destinations, overwrites or automatic secret/private-setting copies.

Record inventory/size/hash/needed metadata, original root/revision, preserved refs/commits, restoration steps and resumable index/worktree distinctions. Bundles omit local state. Check space, copy/compare and verify restoration separately within bounds before source removal. Incomplete inventory, unsupported types, source changes, copy/restore/hash failures hold target; partial preservation is not success.

Immediately recheck source/tips/active use. Delete a local branch before its remote branch, while the remote ref still shows it merged; local removal uses non-forcing Git, and a refusal retains the target even after equivalence. No force/clean/reset/manual-delete bypass. Verified residual files need exact-file authority and fresh preservation before removal. For remote deletion, read [remote deletion](references/remote-deletion.md).

Report removed/retained targets, reasons, archive path/size, observed/unrun checks, remaining prerequisites and revisit date. Count/age/disk pressure triggers review, not deletion. Prune removes stale administrative records, not workspaces. Do not archive whole reproducible checkouts or retain completed worktrees solely for unique evidence.
