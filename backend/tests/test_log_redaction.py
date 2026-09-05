"""Токен не должен попадать в журнал.

Токен чата едет в АДРЕСЕ WebSocket — заголовки браузерному WebSocket задать
нельзя, другого места нет. А uvicorn пишет строку запроса целиком. Замерено на
живом сервере ДО правки:

    INFO: 127.0.0.1:35358 - "WebSocket /ws/chat/abc?token=eyJhbGciOiJIUzI1NiJ9.
    SEKRETNYJ_TOKEN_DOSTUPA.podpis" 403

Это рабочий ключ от аккаунта на семь суток, лежащий открытым текстом в журнале
контейнера. Кто читает журналы — тот входит под чужим именем.

Первой попыткой был флаг uvicorn --no-access-log. Замер показал, что он не
помогает: строку про WebSocket пишет логгер uvicorn.error, а флаг глушит
только uvicorn.access. Поэтому фильтр — он не зависит ни от логгера, ни от
версии uvicorn.

После правки на том же живом сервере:

    INFO: 127.0.0.1:57642 - "WebSocket /ws/chat/abc?token=REDACTED" 403
"""
import logging

from app.main import _RedactTokensInLogs

SECRET = "eyJhbGciOiJIUzI1NiJ9.SEKRETNYJ_TOKEN.podpis"


def _through_filter(msg, args=None):
    """Пропустить запись через фильтр и вернуть готовую строку."""
    record = logging.LogRecord("uvicorn.error", logging.INFO, __file__, 1,
                               msg, args, None)
    _RedactTokensInLogs().filter(record)
    return record.getMessage()


def test_token_in_the_message_is_cut_out():
    out = _through_filter(f'"WebSocket /ws/chat/abc?token={SECRET}" 403')
    assert SECRET not in out, out
    assert "token=REDACTED" in out, out
    # Остальное должно остаться: строка нужна для наблюдения за подключениями.
    assert "/ws/chat/abc" in out and "403" in out, out


def test_token_in_the_arguments_is_cut_out_too():
    """uvicorn подставляет адрес аргументом, а не пишет в саму строку."""
    out = _through_filter(
        '%s - "%s" %s',
        ("127.0.0.1:1", f"WebSocket /ws/chat/a?token={SECRET}", 403),
    )
    assert SECRET not in out, out
    assert "token=REDACTED" in out, out


def test_ordinary_lines_are_untouched():
    """Фильтр не должен портить обычные записи.

    Без этой половины он мог бы «работать», вырезая всё подряд.
    """
    out = _through_filter("GET /vacancies?city=Москва -> 200 12.3ms rid=abc")
    assert out == "GET /vacancies?city=Москва -> 200 12.3ms rid=abc"


def test_filter_is_installed_on_uvicorn_loggers():
    """Фильтр должен стоять там, где пишется строка запроса.

    У логгеров uvicorn свои обработчики и propagate=False — до корневого
    логгера их записи не доходят, поэтому одного корня мало.
    """
    for name in ("", "uvicorn", "uvicorn.error", "uvicorn.access"):
        installed = [f for f in logging.getLogger(name).filters
                     if isinstance(f, _RedactTokensInLogs)]
        assert installed, f"на логгере «{name or 'корневом'}» фильтра нет"
