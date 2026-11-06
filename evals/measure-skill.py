#!/usr/bin/env python3
"""Compare static skill read sets. Token counts are not host usage or billing.

Python 3.10+; optional tokenizer: pip install tiktoken==0.14.0.
Example: python evals/measure-skill.py --base <full-commit> --encoding o200k_base
The default candidate is the working tree. This program does not modify Git.
"""

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
PREFIX = "skills/devflow/"


def git(*args):
    return subprocess.check_output(
        ["git", "--no-replace-objects", "--no-pager", *args], cwd=ROOT
    )


def snapshot(revision):
    if revision == "WORKTREE":
        return {
            p.relative_to(ROOT).as_posix(): p.read_bytes()
            for p in sorted((ROOT / PREFIX).rglob("*.md"))
        }
    names = git("ls-tree", "-r", "--name-only", revision, "--", PREFIX).decode().splitlines()
    return {name: git("show", f"{revision}:{name}") for name in names if name.endswith(".md")}


def measure(data, encoding):
    text = data.decode("utf-8")
    return {
        "bytes": len(data),
        "lines": len(text.splitlines()),
        "tokens": len(encoding.encode(text, disallowed_special=())) if encoding else None,
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def summarize(files, sets, encoding):
    measured = {name.removeprefix(PREFIX): measure(data, encoding) for name, data in files.items()}

    def total(names):
        unique = list(dict.fromkeys(names))
        missing = [name for name in unique if name not in measured]
        if missing:
            raise ValueError(f"Read set references absent files: {missing}")
        return {
            "files": unique,
            "bytes": sum(measured[name]["bytes"] for name in unique),
            "tokens": sum(measured[name]["tokens"] for name in unique) if encoding else None,
        }

    digest_input = "\n".join(f"{name}\0{measured[name]['sha256']}" for name in sorted(measured))
    return {
        "snapshot_sha256": hashlib.sha256(digest_input.encode()).hexdigest(),
        "file_count": len(measured),
        "files": measured,
        "total": total(sorted(measured)),
        "read_sets": {name: total(names) for name, names in sets.items()},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True, help="Baseline commit or ref")
    parser.add_argument("--candidate", default="WORKTREE", help="Candidate commit/ref, or WORKTREE")
    parser.add_argument("--manifest", type=Path, default=ROOT / "evals/read-sets.json")
    parser.add_argument("--encoding", help="Optional tiktoken encoding; no bytes/4 estimate is used")
    args = parser.parse_args()
    baseline = git("rev-parse", "--verify", "--end-of-options", f"{args.base}^{{commit}}").decode().strip()
    candidate = args.candidate if args.candidate == "WORKTREE" else git(
        "rev-parse", "--verify", "--end-of-options", f"{args.candidate}^{{commit}}"
    ).decode().strip()
    encoding = None
    version = None
    if args.encoding:
        try:
            import tiktoken
        except ImportError as error:
            raise SystemExit("--encoding requires the optional tiktoken package") from error
        encoding = tiktoken.get_encoding(args.encoding)
        version = importlib.metadata.version("tiktoken")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    result = {
        "kind": "static-file-counts",
        "method": "Sum complete UTF-8 files once per read set; tokenizer counts each file separately.",
        "limits": "Excludes requests, tools, responses, children, caches and host framing; not billed usage or an exact Claude token count.",
        "tokenizer": {"package": "tiktoken", "version": version, "encoding": args.encoding} if encoding else None,
        "base_revision": baseline,
        "candidate_revision": candidate,
        "base": summarize(snapshot(baseline), manifest["base"], encoding),
        "candidate": summarize(snapshot(candidate), manifest["candidate"], encoding),
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
