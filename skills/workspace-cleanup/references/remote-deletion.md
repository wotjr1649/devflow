# Remote deletion

Apply [shared cleanup rules](../SKILL.md), including integration, preservation and active-use checks.

Immediately before deleting, read the remote tip with `git ls-remote <remote> <full-ref>` and delete with `git push <remote> --delete <branch>` only while it still equals the reviewed SHA; each deletion needs its own nonempty reviewed SHA. Verify the push destination. No --force, lease, +refspec, mirror, ref overwrite or hook/protection bypass. A moved tip or a refusal holds the target; no fallback or unreviewed-tip retry.
