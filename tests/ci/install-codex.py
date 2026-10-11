"""Install only pinned official binaries into a new CI-owned directory."""
import hashlib
import io
import pathlib
import sys
import tarfile
import urllib.request

ASSETS = (
    ("codex-x86_64-unknown-linux-musl", "codex", 120_000_000,
     "86f268d81b898f3e144c5ecff2ad2fda2c5802e042d6195b72538fe0fa125057"),
    ("bwrap-x86_64-unknown-linux-musl", "codex-resources/bwrap", 300_000,
     "fa78980959466bd7a04643384c6293511f06a3140345c1237cfc75ccde7f3eea"),
)


def binary_from_archive(data, expected_name, digest):
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError("ASSET_DIGEST_MISMATCH")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        members = archive.getmembers()
        if (len(members) != 1 or members[0].name != expected_name
                or not members[0].isfile() or members[0].linkname
                or not 0 < members[0].size <= 300_000_000):
            raise ValueError("UNEXPECTED_ARCHIVE_ENTRY")
        return archive.extractfile(members[0]).read()


if __name__ == "__main__":
    destination = pathlib.Path(sys.argv[1]).resolve()
    destination.mkdir(parents=True, exist_ok=False)
    for name, output, limit, digest in ASSETS:
        url = "https://github.com/openai/codex/releases/download/rust-v0.162.1/" + name + ".tar.gz"
        with urllib.request.urlopen(url, timeout=30) as response:
            data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("ASSET_SIZE_BOUND")
        binary = binary_from_archive(data, name, digest)
        target = destination / output
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as stream:
            stream.write(binary)
        target.chmod(0o755)
    print("Verified Codex 0.162.1 and its bundled bubblewrap")
