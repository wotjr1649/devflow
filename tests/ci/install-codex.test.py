"""Adversarial archive controls; these are not native sandbox evidence."""
import hashlib
import importlib.util
import io
import pathlib
import tarfile
import unittest

spec = importlib.util.spec_from_file_location("installer", pathlib.Path(__file__).with_name("install-codex.py"))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


def packet(names, kind=tarfile.REGTYPE):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as archive:
        for name in names:
            entry = tarfile.TarInfo(name)
            entry.type = kind
            if kind == tarfile.REGTYPE:
                entry.size = 3
                archive.addfile(entry, io.BytesIO(b"bin"))
            else:
                entry.linkname = "../outside"
                archive.addfile(entry)
    return output.getvalue()


class ArchiveControls(unittest.TestCase):
    def decode(self, data, digest=None):
        return installer.binary_from_archive(data, "codex", digest or hashlib.sha256(data).hexdigest())

    def test_expected_binary(self):
        self.assertEqual(self.decode(packet(["codex"])), b"bin")

    def test_digest_mismatch(self):
        with self.assertRaisesRegex(ValueError, "ASSET_DIGEST_MISMATCH"):
            self.decode(packet(["codex"]), "0" * 64)

    def test_paths_duplicates_and_links(self):
        for names in [["../codex"], ["/codex"], ["codex", "codex"], ["codex", "extra"], []]:
            with self.subTest(names=names), self.assertRaisesRegex(ValueError, "UNEXPECTED_ARCHIVE_ENTRY"):
                self.decode(packet(names))
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.DIRTYPE, tarfile.CHRTYPE]:
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, "UNEXPECTED_ARCHIVE_ENTRY"):
                self.decode(packet(["codex"], kind))


if __name__ == "__main__":
    unittest.main()
