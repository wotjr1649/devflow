"""Metadata parser controls; no native namespace or sandbox claim."""
import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("environment", pathlib.Path(__file__).with_name("native-environment.py"))
environment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(environment)


class MetadataControls(unittest.TestCase):
    def test_zero_is_distinct_from_unavailable_or_malformed(self):
        with tempfile.TemporaryDirectory() as root:
            file = pathlib.Path(root) / "setting"
            self.assertIsNone(environment.number(file))
            file.write_text("0\n")
            self.assertEqual(environment.number(file), 0)
            file.write_text("1\n")
            self.assertEqual(environment.number(file), 1)
            for value in ["invalid", "", "1" * 100, "-1"]:
                file.write_text(value)
                self.assertIsNone(environment.number(file))

    def test_labels_and_process_fields_are_bounded_and_filtered(self):
        self.assertEqual(environment.label("unprivileged_userns (enforce)\n"), "unprivileged_userns (enforce)")
        for value in [None, "", "x" * 200, "hidden\ncontent", "name\x1b"]:
            self.assertIsNone(environment.label(value))
        self.assertEqual(environment.status_fields("Name:\tignored\nCapEff:\t0000000000000000\nSeccomp:\t2\nNoNewPrivs:\t0\n"),
                         {"CapEff": "0000000000000000", "Seccomp": "2", "NoNewPrivs": "0"})
        self.assertEqual(environment.status_fields("CapEff: malformed\nSeccomp: hidden\n"), {})


if __name__ == "__main__":
    unittest.main()
