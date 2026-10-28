# Plan: clamp out-of-range pages

1. In `page_bounds`, clamp a page number past the end to the last page instead of returning an inverted slice.
2. Note the behaviour change in CHANGELOG.md under Unreleased.
3. Run the existing pager tests locally and record the result in `.work/records.yaml`.
4. Request the final review required by POLICY.md.
