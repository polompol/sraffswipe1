"""Оператор должен видеть, что планировщик жив.

Самая тихая поломка во всём сервисе. Планировщик — отдельный процесс, и если
он перестанет запускаться (упал контейнер, забыли поднять после обновления),
на вид не сломается НИЧЕГО: приложение работает, смены публикуются, люди
переписываются. Не будет только закрытия смен — а значит и комиссии. Ни рубля,
и никто не узнает.

Хуже: через две недели такие смены закрываются как «слишком старые» уже без
денег. Выручка за время простоя не догоняется никогда.

Отметки о выполнении лежали в базе с самого начала, но их не читала ни одна
ручка.
"""
from datetime import date, timedelta

from app.db import SessionLocal
from app.models import JobRun
from app.timeutil import local_today


def _auth(client, role="seeker"):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}


def _mark(job: str, days_ago: int) -> None:
    day = (date.fromisoformat(local_today()) - timedelta(days=days_ago)).isoformat()
    db = SessionLocal()
    try:
        db.add(JobRun(job=job, day=day))
        db.commit()
    finally:
        db.close()


def test_operator_sees_a_scheduler_that_never_ran(client):
    """Планировщик не поднимали ни разу — это должно быть видно сразу."""
    rows = client.get("/admin/jobs", headers=_auth(client)).json()
    assert rows, "список задач не может быть пустым"
    assert all(r["stale"] for r in rows), "ни одна не отрабатывала — тревога"
    assert all(r["daysAgo"] == -1 for r in rows)
    # Главная задача — закрытие смен: без неё нет комиссии вообще.
    assert any(r["id"] == "settle" for r in rows)


def test_a_job_that_ran_today_is_calm(client):
    _mark("settle", 0)
    rows = {r["id"]: r for r in client.get("/admin/jobs", headers=_auth(client)).json()}
    assert rows["settle"]["daysAgo"] == 0
    assert rows["settle"]["stale"] is False


def test_yesterday_is_still_calm_but_older_is_not(client):
    """Вчера — нормально: сегодня задача могла ещё не наступить по времени."""
    _mark("settle", 1)
    _mark("reminders", 3)
    rows = {r["id"]: r for r in client.get("/admin/jobs", headers=_auth(client)).json()}
    assert rows["settle"]["stale"] is False, "вчера — не повод для тревоги"
    assert rows["reminders"]["stale"] is True, "три дня — планировщик встал"
    assert rows["reminders"]["daysAgo"] == 3


def test_only_the_operator_sees_this(client):
    from app.db import SessionLocal
    from app.models import User

    headers = _auth(client)
    # Уводим аккаунт с админского tg_id.
    db = SessionLocal()
    try:
        u = db.query(User).first()
        u.tg_id = 992001
        u.phone = "tg:992001"
        db.commit()
    finally:
        db.close()
    assert client.get("/admin/jobs", headers=headers).status_code in (401, 403)
