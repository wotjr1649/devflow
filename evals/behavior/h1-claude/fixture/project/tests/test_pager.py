import pytest

from tidepool.pager import page_bounds


def test_first_page():
    assert page_bounds(25, 1, 10) == (0, 10)


def test_middle_page():
    assert page_bounds(25, 2, 10) == (10, 20)


def test_rejects_zero_size():
    with pytest.raises(ValueError):
        page_bounds(25, 1, 0)
