"""Общее состояние между процессами: счётчики частоты и раздача чата.

Раньше и то и другое жило в памяти ОДНОГО процесса, поэтому в проде стояло
жёсткое `WEB_CONCURRENCY=1`. Со вторым процессом лимит «5 попыток в минуту»
превращался бы в 10, а два человека в одном чате, попавшие на разные
процессы, не видели бы сообщений друг друга.

Тесты идут на НАСТОЯЩЕМ Redis, если он есть в системе, иначе на fakeredis:
подделка проверяет логику, настоящий — что мы не разошлись с поведением
реального сервера.
"""
import asyncio

import pytest

from app import ratelimit, redisclient


@pytest.fixture()
def redis_url(tmp_path):
    """Настоящий redis-server на своём сокете, иначе fakeredis."""
    import shutil
    import subprocess
    import time

    exe = shutil.which("redis-server")
    if exe:
        sock = tmp_path / "r.sock"
        proc = subprocess.Popen(
            [exe, "--port", "0", "--unixsocket", str(sock), "--save", ""],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(50):
            if sock.exists():
                break
            time.sleep(0.1)
        url = f"unix://{sock}"
        redisclient.reset()
        try:
            yield url
        finally:
            proc.terminate()
            proc.wait(timeout=10)
            redisclient.reset()
        return

    fakeredis = pytest.importorskip("fakeredis")
    server = fakeredis.FakeServer()

    def _fake_sync():
        return fakeredis.FakeStrictRedis(server=server, decode_responses=True)

    redisclient.reset()
    yield ("fake", _fake_sync)
    redisclient.reset()


@pytest.fixture()
def limiter(redis_url, monkeypatch):
    """Счётчик, считающий в Redis."""
    if isinstance(redis_url, tuple):        # fakeredis
        _, factory = redis_url
        client = factory()
        monkeypatch.setattr(redisclient, "sync_client", lambda: client)
    else:
        monkeypatch.setattr(redisclient.settings, "redis_url", redis_url, False)
        redisclient.reset()
        assert redisclient.sync_client() is not None, "Redis не поднялся"
    ratelimit.reset()
    return ratelimit


def test_limit_is_enforced(limiter):
    """Три попытки можно, четвёртая — отказ."""
    from fastapi import HTTPException

    for _ in range(3):
        limiter.hit("проверка", limit=3, window=60)
    with pytest.raises(HTTPException) as e:
        limiter.hit("проверка", limit=3, window=60)
    assert e.value.status_code == 429


def test_counter_is_shared_between_processes(limiter):
    """Главное, ради чего всё затевалось.

    Память процесса очищаем полностью — как будто запрос пришёл в ДРУГОЙ
    процесс, который про предыдущие попытки ничего не знает. Счётчик всё
    равно должен помнить: он в Redis, а не в памяти.
    """
    from fastapi import HTTPException

    for _ in range(5):
        limiter.hit("общий", limit=5, window=60)
    limiter.reset()                      # «второй процесс»: своя пустая память
    with pytest.raises(HTTPException):
        limiter.hit("общий", limit=5, window=60)


def test_rejected_attempt_does_not_extend_the_wait(limiter):
    """Отказ не должен продлевать окно: своя отметка снимается обратно."""
    from fastapi import HTTPException

    for _ in range(2):
        limiter.hit("окно", limit=2, window=60)
    for _ in range(5):
        with pytest.raises(HTTPException):
            limiter.hit("окно", limit=2, window=60)

    client = redisclient.sync_client()
    assert client.zcard("rl:окно") == 2, "лишние отметки остались в окне"


def test_window_expires(limiter):
    """Окно короткое — после него снова можно."""
    import time

    from fastapi import HTTPException

    limiter.hit("короткое", limit=1, window=1)
    with pytest.raises(HTTPException):
        limiter.hit("короткое", limit=1, window=1)
    time.sleep(1.2)
    limiter.hit("короткое", limit=1, window=1)   # не должно бросить


def test_falls_back_to_memory_when_redis_dies(monkeypatch):
    """Redis отвалился — запросы продолжают работать, а не падают 500-й.

    Ограничение частоты это защита, а не смысл сервиса: лучше считать в
    памяти процесса, чем возвращать ошибку каждому пользователю.
    """
    from fastapi import HTTPException

    class Broken:
        def pipeline(self, transaction=True):
            raise ConnectionError("redis умер")

    monkeypatch.setattr(redisclient, "sync_client", lambda: Broken())
    ratelimit.reset()
    ratelimit.hit("падение", limit=2, window=60)   # не бросает
    ratelimit.hit("падение", limit=2, window=60)
    with pytest.raises(HTTPException):             # лимит всё ещё работает
        ratelimit.hit("падение", limit=2, window=60)


def test_chat_message_reaches_another_process(redis_url):
    """Сообщение, отправленное в одном процессе, доходит до сокета в другом.

    Два ConnectionManager = два процесса приложения. Сокет подключён только
    ко второму, а сообщение публикует первый.
    """
    if isinstance(redis_url, tuple):
        pytest.skip("нужен настоящий Redis: pub/sub у подделки не полный")

    from app.routers.chat import ConnectionManager

    class FakeSocket:
        def __init__(self):
            self.got = []

        async def accept(self):
            pass

        async def send_json(self, data):
            self.got.append(data)

    async def scenario():
        redisclient.reset()
        redisclient.settings.redis_url = redis_url
        proc_a = ConnectionManager()     # процесс, который принимает сообщение
        proc_b = ConnectionManager()     # процесс, где сидит собеседник
        ws = FakeSocket()
        await proc_b.connect("match-1", ws)
        await asyncio.sleep(0.3)         # даём подписке встать
        await proc_a.broadcast("match-1", {"text": "привет из другого процесса"})
        for _ in range(30):
            if ws.got:
                break
            await asyncio.sleep(0.1)
        return ws.got

    old = redisclient.settings.redis_url
    try:
        got = asyncio.run(scenario())
    finally:
        redisclient.settings.redis_url = old
        redisclient.reset()

    assert got, "сообщение не дошло до сокета в другом процессе"
    assert got[0]["text"] == "привет из другого процесса"
