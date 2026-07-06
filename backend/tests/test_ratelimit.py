"""Юнит-тест рейт-лимита (без HTTP)."""
import pytest
from fastapi import HTTPException

from app.ratelimit import rate_limit, reset


def test_rate_limit_blocks_after_limit():
    reset()
    dep = rate_limit("unit", limit=2, window=60)
    principal = {"id": "user-1", "role": "seeker"}
    assert dep(principal)["id"] == "user-1"  # 1
    dep(principal)  # 2
    with pytest.raises(HTTPException) as exc:
        dep(principal)  # 3 → блок
    assert exc.value.status_code == 429


def test_rate_limit_is_per_principal():
    reset()
    dep = rate_limit("unit2", limit=1, window=60)
    dep({"id": "a", "role": "seeker"})
    # Другой пользователь не затронут.
    assert dep({"id": "b", "role": "seeker"})["id"] == "b"
