"""Кнопка в уведомлении должна открывать нужный экран, а не корень.

Человеку приходило «отметьтесь на смене», он жал кнопку — и попадал в ленту
вакансий, где нужный экран надо искать самому.
"""
from app.config import settings
from app.notify import webapp_url


def test_screen_goes_into_query(monkeypatch):
    """Экран передаём query-параметром, а не хэшем.

    Telegram кладёт initData во фрагмент URL (#tgWebAppData=…) — собственный
    хэш приложения там просто затирается.
    """
    monkeypatch.setattr(settings, "mini_app_url", "https://app.example.ru")
    url = webapp_url("shifts")
    assert url == "https://app.example.ru?go=shifts"
    assert "#" not in url


def test_existing_query_is_kept(monkeypatch):
    monkeypatch.setattr(settings, "mini_app_url", "https://app.example.ru/?v=2")
    assert webapp_url("matches") == "https://app.example.ru/?v=2&go=matches"


def test_without_screen_url_is_untouched(monkeypatch):
    monkeypatch.setattr(settings, "mini_app_url", "https://app.example.ru")
    assert webapp_url() == "https://app.example.ru"


def test_without_configured_url_nothing_breaks(monkeypatch):
    monkeypatch.setattr(settings, "mini_app_url", "")
    assert webapp_url("shifts") == ""
