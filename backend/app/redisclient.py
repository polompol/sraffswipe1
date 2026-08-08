"""Общая память для нескольких процессов приложения: Redis.

Зачем. Счётчики частоты («не чаще 5 попыток кода в минуту») и раздача
сообщений чата жили в памяти ОДНОГО процесса. Пока процесс один — работает;
со вторым процессом счётчик делится пополам, а два человека в одном чате
перестают видеть сообщения друг друга. Redis делает это состояние общим, и
только после этого можно поднимать WEB_CONCURRENCY выше единицы.

Главное правило здесь — **не ронять приложение из-за Redis**. Если он не
поднялся или отвалился, счётчики возвращаются в память процесса, а чат — к
локальной раздаче. Это хуже, чем с Redis, но несравнимо лучше, чем пятисотая
ошибка на каждый запрос. Пусто в REDIS_URL — просто работаем без него.
"""
import logging

from .config import settings

_log = logging.getLogger("staffswipe")

_sync_client = None      # redis.Redis | None
_async_client = None     # redis.asyncio.Redis | None
_sync_ready = False
_async_ready = False


def enabled() -> bool:
    return bool(settings.redis_url)


def sync_client():
    """Клиент для обычных (не-async) ручек: счётчики частоты.

    Соединение проверяется один раз при первом обращении. Если Redis не
    отвечает — возвращаем None, и вызывающий тихо уходит на память.
    """
    global _sync_client, _sync_ready
    if not enabled():
        return None
    if _sync_ready:
        return _sync_client
    _sync_ready = True
    try:
        import redis

        client = redis.Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_timeout=0.5,          # счётчик не должен тормозить запрос
            socket_connect_timeout=0.5,
        )
        client.ping()
        _sync_client = client
        _log.info("Redis подключён (счётчики частоты общие для процессов)")
    except Exception as exc:  # noqa: BLE001 — любая проблема = работаем без Redis
        _sync_client = None
        _log.warning("Redis недоступен, счётчики частоты в памяти процесса: %s", exc)
    return _sync_client


async def async_client():
    """Клиент для WebSocket-чата (pub/sub между процессами)."""
    global _async_client, _async_ready
    if not enabled():
        return None
    if _async_ready:
        return _async_client
    _async_ready = True
    try:
        import redis.asyncio as aioredis

        client = aioredis.Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_timeout=2,
            socket_connect_timeout=2,
        )
        await client.ping()
        _async_client = client
        _log.info("Redis подключён (чат работает между процессами)")
    except Exception as exc:  # noqa: BLE001
        _async_client = None
        _log.warning("Redis недоступен, чат раздаётся внутри процесса: %s", exc)
    return _async_client


def reset() -> None:
    """Сброс кэша соединений — для тестов и смены настроек на лету."""
    global _sync_client, _async_client, _sync_ready, _async_ready
    _sync_client = None
    _async_client = None
    _sync_ready = False
    _async_ready = False
