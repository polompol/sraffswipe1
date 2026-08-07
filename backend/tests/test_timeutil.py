"""Время смен считается по Москве, а не по часам сервера.

Сервер живёт в UTC (так настроены все хостинги), а смена «10:00–18:00» — это
московское время. Разница в три часа ломала три вещи сразу: напоминание
«сегодня смена», отсечку прошедших смен в ленте и срок авто-закрытия.
"""
from datetime import UTC, datetime, timedelta

from app.timeutil import business_tz, local_today, shift_end_utc


def test_shift_end_is_moscow_time_not_server_time():
    """Смена 10:00–18:00 заканчивается в 15:00 UTC, а не в 18:00 UTC.

    Именно из-за этой разницы авто-закрытие срабатывало через 15 часов
    вместо обещанных в оферте 12.
    """
    end = shift_end_utc("2026-08-08", 600, 1080)
    assert end == datetime(2026, 8, 8, 15, 0, tzinfo=UTC)


def test_night_shift_ends_next_day():
    """20:00 → 04:00: конец на следующий день, иначе закрывали бы на сутки
    раньше срока."""
    end = shift_end_utc("2026-08-08", 1200, 240)
    assert end == datetime(2026, 8, 9, 1, 0, tzinfo=UTC)


def test_local_today_follows_moscow_midnight():
    """Дата «сегодня» переключается в московскую полночь, а не в UTC."""
    now_msk = datetime.now(UTC).astimezone(business_tz())
    assert local_today() == now_msk.date().isoformat()


def test_broken_timezone_name_still_gives_moscow_offset(monkeypatch):
    """Если в образе не окажется базы часовых поясов, смещение +03:00
    остаётся: лучше правильное время, чем молчаливый возврат к UTC."""
    from app import timeutil

    monkeypatch.setattr(timeutil.settings, "business_tz", "Нет/Такого", False)
    end = shift_end_utc("2026-08-08", 600, 1080)
    assert end == datetime(2026, 8, 8, 15, 0, tzinfo=UTC)


_next_tg_id = 900_000   # счётчик, а не hash(): нужен предсказуемый, без совпадений


def _detach(*owner_ids: str) -> None:
    """Отвязать участников от tg_id=0, чтобы следующая пара была НОВОЙ.

    В тестах insecure-логин выдаёт всем tg_id=0, поэтому второй вызов
    «создай пару» молча переиспользовал ту же самую пару: свайп заведения
    по тому же соискателю — дубль, нового мэтча не появлялось, и обе
    проверки в тесте работали с одной и той же сменой.
    """
    from app.db import SessionLocal
    from app.models import Employer, User

    global _next_tg_id
    db = SessionLocal()
    try:
        for oid in owner_ids:
            obj = db.get(User, oid) or db.get(Employer, oid)
            if obj is None:
                continue
            _next_tg_id += 1
            obj.tg_id = _next_tg_id
            if (obj.phone or "").startswith("tg:"):
                obj.phone = f"tg:{obj.tg_id}"
        db.commit()
    finally:
        db.close()


def _confirmed_code_checkin(client, hours_ago: int):
    """Смена, которая закончилась `hours_ago` часов назад по МЕСТНОМУ времени,
    и работник отметился кодом."""
    from app.db import SessionLocal
    from app.models import Match, Vacancy

    emp = client.post("/auth/telegram",
                      json={"init_data": "", "role": "employer"}).json()
    eh = {"Authorization": f"Bearer {emp['access_token']}"}
    v = client.post("/vacancies", headers=eh, json={
        "role": "barista", "date": local_today(), "start_time": 600,
        "end_time": 1080, "rate": 350, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Тверская, 1",
    }).json()
    seek = client.post("/auth/telegram",
                       json={"init_data": "", "role": "seeker"}).json()
    sh = {"Authorization": f"Bearer {seek['access_token']}"}
    client.post("/swipes", headers=sh, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    me = client.get("/me", headers=sh).json()
    sw = client.post("/swipes", headers=eh, json={
        "target_id": me["id"], "target_type": "user", "direction": "like"}).json()
    mid = sw["match_id"]
    client.post(f"/matches/{mid}/confirm", headers=sh)
    client.post(f"/matches/{mid}/confirm", headers=eh)
    rows = client.get("/matches", headers=eh).json()
    code = [m for m in rows if m["id"] == mid][0]["checkin_code"]
    client.post(f"/matches/{mid}/checkin", headers=sh, json={"code": code})

    # Сдвигаем смену так, чтобы она закончилась ровно hours_ago назад
    # по местному времени.
    end_local = datetime.now(UTC).astimezone(business_tz()) - timedelta(
        hours=hours_ago)
    db = SessionLocal()
    try:
        m = db.get(Match, mid)
        employer_id = m.employer_id   # читаем ДО закрытия сессии
        vac = db.get(Vacancy, m.vacancy_id)
        vac.date = end_local.date().isoformat()
        vac.start_time = 0
        # Ровно полночь дала бы end_time == start_time, а это трактуется как
        # ночная смена и переносит конец на сутки вперёд. Смещаем на минуту.
        vac.end_time = (end_local.hour * 60 + end_local.minute) or 1
        db.commit()
    finally:
        db.close()
    # Освобождаем tg_id=0, чтобы следующий вызов создал НОВУЮ пару.
    _detach(me["id"], employer_id)
    return mid


def test_auto_close_waits_twelve_hours_of_local_time(client):
    """Через 10 часов смену не закрываем, через 14 — закрываем.

    Раньше время смены считалось как UTC, и смена, закончившаяся 14 часов
    назад, выглядела закончившейся 11 часов назад — авто-закрытие молчало,
    хотя в оферте обещаны 12 часов. Берём запас по два часа с каждой стороны,
    чтобы тест не зависел от того, в какую минуту его запустили.
    """
    from app.db import SessionLocal
    from app.digest import auto_close_shifts
    from app.models import Match

    early = _confirmed_code_checkin(client, hours_ago=10)
    db = SessionLocal()
    try:
        assert auto_close_shifts(db) == 0
        assert db.get(Match, early).status == "confirmed"
    finally:
        db.close()

    late = _confirmed_code_checkin(client, hours_ago=14)
    db = SessionLocal()
    try:
        assert auto_close_shifts(db) == 1
        assert db.get(Match, late).status == "completed"
        assert db.get(Match, early).status == "confirmed"   # эту не тронули
    finally:
        db.close()
