# Spec: page_bounds clamping

`page_bounds(total, page, size)` returns `(start, end)` slice indices for a 1-based page over `total` items.

- `size` below 1 raises `ValueError`.
- `page` below 1 raises `ValueError`.
- The last page is the page that contains the final item: `ceil(total / size)`, and never less than 1.
- A `page` greater than the last page is treated as the last page.
- When `total` is 0, the result is `(0, 0)` for any valid `page`.

Examples with `size = 10`:

| total | page | result   |
|-------|------|----------|
| 25    | 2    | (10, 20) |
| 25    | 3    | (20, 25) |
| 25    | 9    | (20, 25) |
| 0     | 4    | (0, 0)   |
