"""Ограничение частоты запросов (скользящее окно).

Считает в Redis, если он настроен, — тогда лимит общий для всех процессов
приложения. Без Redis откатывается в память процесса: так работает и локально,
и на пилоте с одним воркером. Разница видна только со второго процесса, где
память у каждого своя и лимит фактически делился бы между ними.

Если Redis настроен, но не отвечает, запрос НЕ падает: считаем в памяти и
пишем предупреждение в лог. Ограничение частоты — защита, а не смысл сервиса.
"""
import logging
import time
import uuid
from collections import defaultdict

from fastapi import Depends, HTTPException, Request

from . import redisclient
from .security import current_principal

_log = logging.getLogger("staffswipe")

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


def _too_many_error() -> HTTPException:
    return HTTPException(status_code=429, detail="Слишком часто. Попробуйте позже.")


def _hit_redis(bucket: str, limit: int, window: float) -> bool | None:
    """Учёт обращения в общей памяти. True — можно, False — превышено.

    None означает «Redis не сработал» — вызывающий считает в памяти процесса.
    Скользящее окно на сортированном множестве: свои отметки складываем по
    времени, старые выкидываем, лишние — снимаем обратно. Всё одним
    транзакционным конвейером, поэтому параллельные запросы не могут
    посчитать одно и то же дважды.
    """
    client = redisclient.sync_client()
    if client is None:
        return None
    key = f"rl:{bucket}"
    now = time.time()
    member = f"{now}:{uuid.uuid4().hex[:8]}"  # свои отметки должны быть разными
    try:
        pipe = client.pipeline(transaction=True)
        pipe.zremrangebyscore(key, 0, now - window)
        pipe.zadd(key, {member: now})
        pipe.zcard(key)
        pipe.expire(key, int(window) + 1)     # ключ уберётся сам, мусор не копится
        count = pipe.execute()[2]
        if count > limit:
            # Своя отметка лишняя — снимаем, иначе она держала бы окно занятым
            # и после отказа человек ждал бы дольше положенного.
            client.zrem(key, member)
            return False
        return True
    except Exception as exc:  # noqa: BLE001 — Redis отвалился: не роняем запрос
        _log.warning("Redis недоступен при подсчёте частоты (%s): %s", bucket, exc)
        redisclient.reset()
        return None


def hit(bucket: str, limit: int, window: float) -> None:
    """Учёт обращения по произвольному ключу (для неавторизованных ручек).

    Бросает 429 при превышении. Используется там, где нет принципала —
    например, запрос/проверка SMS-кода (ключ = телефон).
    """
    allowed = _hit_redis(bucket, limit, window)
    if allowed is False:
        raise _too_many_error()
    if allowed is True:
        return
    # Redis не настроен или недоступен — считаем в памяти этого процесса.
    now = time.monotonic()
    recent = [t for t in _hits[bucket] if now - t < window]
    if len(recent) >= limit:
        raise _too_many_error()
    recent.append(now)
    _hits[bucket] = recent
    _maybe_sweep(window)


def client_ip(request: Request) -> str:
    """IP клиента с учётом того, что перед API стоит Caddy.

    Берём ПОСЛЕДНИЙ элемент X-Forwarded-For, а не первый. Раньше был первый —
    и это полностью отключало все ограничения по IP: Caddy не заменяет
    заголовок, а ДОПИСЫВАЕТ настоящий адрес в конец, поэтому первый элемент
    задаёт сам клиент. Проверено: с меняющимся X-Forwarded-For лимит «10 в
    час» пропускал все 15 запросов подряд. Последний элемент дописывает наш
    собственный прокси, подделать его нельзя.

    Без прокси (локально, тесты) — адрес соединения. Пусто — общая корзина
    «unknown»: лучше ограничить всех вместе, чем не ограничивать никого.
    """
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[-1].strip()[:64] or "unknown"
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
        hit(f"{key}:{principal['id']}", limit, window)
        return principal

    return dep


def reset() -> None:
    """Сброс счётчиков (для тестов)."""
    _hits.clear()
