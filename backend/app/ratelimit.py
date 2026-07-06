"""Простой in-memory рейт-лимит (скользящее окно) на принципала.

В проде заменить на Redis (общий для нескольких инстансов). Здесь — защита от
примитивного спама свайпами/сообщениями/вакансиями в рамках одного процесса.
"""
import time
from collections import defaultdict

from fastapi import Depends, HTTPException

from .security import current_principal

_hits: dict[str, list[float]] = defaultdict(list)
_calls = 0


def _maybe_sweep(window: float) -> None:
    """Периодически чистим пустые/протухшие корзины, чтобы dict не рос вечно."""
    global _calls
    _calls += 1
    if _calls % 1000:
        return
    now = time.monotonic()
    for k in list(_hits):
        if not [t for t in _hits[k] if now - t < window]:
            _hits.pop(k, None)


def hit(bucket: str, limit: int, window: float) -> None:
    """Учёт обращения по произвольному ключу (для неавторизованных ручек).

    Бросает 429 при превышении. Используется там, где нет принципала —
    например, запрос/проверка SMS-кода (ключ = телефон).
    """
    now = time.monotonic()
    recent = [t for t in _hits[bucket] if now - t < window]
    if len(recent) >= limit:
        raise HTTPException(
            status_code=429, detail="Слишком часто. Попробуйте позже."
        )
    recent.append(now)
    _hits[bucket] = recent
    _maybe_sweep(window)


def rate_limit(key: str, limit: int, window: float):
    """Зависимость FastAPI: не более `limit` вызовов за `window` секунд."""

    def dep(principal: dict = Depends(current_principal)) -> dict:
        bucket = f"{key}:{principal['id']}"
        _maybe_sweep(window)
        now = time.monotonic()
        recent = [t for t in _hits[bucket] if now - t < window]
        if len(recent) >= limit:
            raise HTTPException(
                status_code=429, detail="Слишком часто. Попробуйте позже."
            )
        recent.append(now)
        _hits[bucket] = recent
        return principal

    return dep


def reset() -> None:
    """Сброс счётчиков (для тестов)."""
    _hits.clear()
