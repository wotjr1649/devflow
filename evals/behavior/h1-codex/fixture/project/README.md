# tidepool

Small catalog utilities for a fictional tide-pool survey app.

## Pagination

`tidepool.pager.page_bounds(total, page, size)` returns slice indices for one page of results:

```python
start, end = page_bounds(len(items), page=2, size=10)
visible = items[start:end]
```

Run the tests with `python -m pytest`.
