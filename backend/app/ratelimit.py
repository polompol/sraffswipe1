"""Простой in-memory рейт-лимит (скользящее окно) на принципала.

В проде заменить на Redis (общий для нескольких инстансов). Здесь — защита от
примитивного спама свайпами/сообщениями/вакансиями в рамках одного процесса.
"""
import time
from collections import defaultdict

from fastapi import Depends, HTTPException, Request

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


def client_ip(request: Request) -> str:
    """IP клиента с учётом того, что перед API стоит Caddy.

    Прокси кладёт исходный адрес в X-Forwarded-For; берём ПЕРВЫЙ элемент —
    остальные может дописать кто угодно. Без прокси (локально, тесты) —
    адрес соединения. Пусто — общая корзина «unknown»: лучше ограничить
    всех вместе, чем не ограничивать никого.
    """
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()[:64] or "unknown"
    return (request.client.host if request.client else "") or "unknown"


def rate_limit_ip(key: str, limit: int, window: float):
    """Зависимость FastAPI для ручек БЕЗ авторизации: ограничение по IP.

    Нужна там, где принципала ещё нет, — вход через Telegram. Иначе один
    скрипт может бесконечно дёргать вход, нагружая проверку подписи и базу.
    """

    def dep(request: Request) -> None:
        hit(f"{key}:{client_ip(request)}", limit, window)

    return dep


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
