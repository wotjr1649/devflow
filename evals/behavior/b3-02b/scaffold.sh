#!/usr/bin/env bash
# Builds the run folder: the case project and the plugin snapshot of the arm being measured (docs/specs/eval.md, behavior eval).
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
cp -R "$here/fixture/project" ./project
cp -R "$here/../../../arm" ./plugin
