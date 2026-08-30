"""Бот: первое, что открывает человек, и до сих пор ни одной проверки.

Бот — отдельный процесс на 178 строк. Через него люди входят в сервис:
кнопка «Открыть StaffSwipe» стоит и в /start, и в меню слева от поля ввода,
и в ответе на любое сообщение. Если он молчит или ведёт не туда, сервиса для
человека просто не существует — а тестов на него не было вовсе.
"""
import asyncio

import pytest

pytest.importorskip("aiogram")

from bot.main import (  # noqa: E402
    _open_app_kb,
    anything_else,
    check_app_url,
    help_cmd,
    start,
    support_cmd,
)


class FakeMessage:
    """Сообщение, каким его видит обработчик, — с записью ответов."""

    def __init__(self):
        self.answers: list[tuple[str, object]] = []
        self.chat = type("C", (), {"id": 1})()
        outer = self

        class _Bot:
            async def send_chat_action(self, *a, **kw):
                outer.typing = True

        self.bot = _Bot()
        self.typing = False

    async def answer(self, text, reply_markup=None):
        self.answers.append((text, reply_markup))
        return self


def _run(handler):
    """Прогнать обработчик и вернуть последний ответ.

    Через asyncio.run, а не через плагин для асинхронных тестов: так же
    сделано в проверках общего состояния, и лишней зависимости не нужно.
    """
    m = FakeMessage()
    asyncio.run(handler(m))
    assert m.answers, "бот обязан ответить — молчание читается как «не работает»"
    return m.answers[-1]


def test_start_opens_the_app(monkeypatch):
    """/start даёт кнопку в приложение — иначе входа нет."""
    text, kb = _run(start)
    assert "StaffSwipe" in text
    assert kb is not None, "без кнопки человеку некуда нажать"
    url = kb.inline_keyboard[0][0].web_app.url
    assert url, "у кнопки должен быть адрес"


def test_help_explains_the_check_in_code():
    """В /help должно быть про код прихода: это защита работника от неявки."""
    text, _kb = _run(help_cmd)
    assert "код" in text.lower()
    assert "/support" in text


def test_support_asks_for_what_the_operator_needs():
    text, _kb = _run(support_cmd)
    assert "заведени" in text.lower() and "день смены" in text.lower()


def test_any_other_message_gets_an_answer_and_a_button():
    """Люди пишут боту «здравствуйте» и «есть работа?».

    Молчащий бот читается как «сервис не работает».
    """
    text, kb = _run(anything_else)
    assert "приложени" in text.lower()
    assert kb is not None


def test_the_button_always_carries_a_url():
    kb = _open_app_kb()
    btn = kb.inline_keyboard[0][0]
    assert btn.web_app is not None and btn.web_app.url


@pytest.mark.parametrize(("url", "bad"), [
    ("https://staffswipe.ru", False),
    ("https://example.com", True),          # значение по умолчанию — заглушка
    ("https://sub.example.com", True),
    ("", True),
    ("http://staffswipe.ru", True),         # Telegram открывает только https
    ("https://localhost", True),
    ("https://", True),                     # пустой DOMAIN в compose
    ("https://api", True),                  # домен без точки
])
def test_placeholder_url_is_refused(url, bad):
    """Бот не должен запускаться с адресом-заглушкой.

    Иначе он выглядит совершенно рабочим: приходит текст, появляется кнопка —
    а по нажатию открывается чужой сайт. Человек решит, что сломан сервис.
    """
    assert (check_app_url(url) is not None) is bad, url
