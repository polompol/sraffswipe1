"""Демо-данные должны быть ВИДНЫ в приложении.

Даты смен были вписаны числами и давно прошли: команда из инструкции
отрабатывала «Демо-данные добавлены», а лента оставалась пустой — прошедшие
смены в неё не попадают. Со стороны это выглядит как сломанное приложение.
Нашлось это только когда приложение собрали против настоящего сервера, а не
против заглушек.
"""
from app.timeutil import local_today


def test_seeded_shifts_are_visible_in_feed(client):
    from app.seed import run

    run()
    feed = client.get("/vacancies").json()
    assert len(feed) >= 2, "демо-смены не видны в ленте — проверьте даты в seed.py"
    assert all(v["date"] >= local_today() for v in feed)


def test_seed_is_idempotent(client):
    """Повторный запуск не плодит дубли."""
    from app.seed import run

    run()
    first = len(client.get("/vacancies").json())
    run()
    assert len(client.get("/vacancies").json()) == first
