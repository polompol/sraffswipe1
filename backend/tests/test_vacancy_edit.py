"""Правка и снятие смены + отсечение прошедших смен из ленты."""
from datetime import date, timedelta

from app.timeutil import local_today


def _d(days: int) -> str:
    """Дата смены относительно «сегодня» — по местному времени, как её
    видит человек: у сервера в UTC с 21:00 уже другая дата."""
    return (date.fromisoformat(local_today()) + timedelta(days=days)).isoformat()


def _auth(client, role="employer"):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role})
    return r.json()["access_token"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def _mine(client, headers):
    """Свои вакансии заведения (в т.ч. прошедшие — это история)."""
    return client.get("/vacancies", params={"mine": 1}, headers=headers).json()


def _payload(**over):
    base = {
        "role": "barista", "date": _d(3), "start_time": 600, "end_time": 1080,
        "rate": 350, "rate_type": "perHour", "lat": 55.75, "lng": 37.61,
        "address": "Тверская, 1",
    }
    base.update(over)
    return base


def _make(client, headers, **over):
    return client.post("/vacancies", headers=headers, json=_payload(**over)).json()


def test_employer_fixes_typo_in_rate(client):
    """Ошибся в ставке при публикации — можно исправить."""
    h = _hdr(_auth(client))
    v = _make(client, h, rate=3500)

    r = client.put(f"/vacancies/{v['id']}", headers=h, json=_payload(rate=350))
    assert r.status_code == 200
    assert r.json()["rate"] == 350

    feed = client.get("/vacancies").json()
    assert [x for x in feed if x["id"] == v["id"]][0]["rate"] == 350


def test_only_owner_employer_can_touch_vacancy(client):
    """Соискателю смена недоступна на правку, несуществующая — 404."""
    owner = _hdr(_auth(client))
    v = _make(client, owner)

    seeker = _hdr(_auth(client, role="seeker"))
    assert client.put(f"/vacancies/{v['id']}", headers=seeker,
                      json=_payload()).status_code == 403
    assert client.delete(f"/vacancies/{v['id']}", headers=seeker).status_code == 403

    assert client.put("/vacancies/нет-такой", headers=owner,
                      json=_payload()).status_code == 404
    assert client.delete("/vacancies/нет-такой", headers=owner).status_code == 404
    # Смена на месте и не изменилась
    assert _mine(client, owner)[0]["rate"] == 350


def test_cannot_change_terms_after_someone_responded(client):
    """Главная защита: по смене есть отклик — ставку менять нельзя.
    Иначе можно снизить оплату уже после того, как человек согласился."""
    emp = _hdr(_auth(client, role="employer"))
    v = _make(client, emp)
    seeker = _hdr(_auth(client, role="seeker"))

    # Взаимный лайк → мэтч по этой смене.
    client.post("/swipes", headers=seeker, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    me = client.get("/me", headers=seeker).json()
    client.post("/swipes", headers=emp, json={
        "target_id": me["id"], "target_type": "user", "direction": "like"})

    r = client.put(f"/vacancies/{v['id']}", headers=emp, json=_payload(rate=100))
    assert r.status_code == 409
    assert "отклик" in r.json()["detail"].lower()
    # Ставка осталась прежней
    mine = _mine(client, emp)
    assert [x for x in mine if x["id"] == v["id"]][0]["rate"] == 350


def test_employer_removes_unneeded_shift(client):
    """Смена больше не нужна — снимается и пропадает из ленты."""
    h = _hdr(_auth(client))
    v = _make(client, h)
    assert v["id"] in {x["id"] for x in client.get("/vacancies").json()}

    assert client.delete(f"/vacancies/{v['id']}", headers=h).status_code == 204
    assert v["id"] not in {x["id"] for x in client.get("/vacancies").json()}
    assert v["id"] not in {x["id"] for x in _mine(client, h)}


def test_cannot_remove_shift_with_response(client):
    """Снять смену, по которой уже договорились, нельзя — человек остался бы
    без смены и без объяснения."""
    emp = _hdr(_auth(client, role="employer"))
    v = _make(client, emp)
    seeker = _hdr(_auth(client, role="seeker"))
    client.post("/swipes", headers=seeker, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    me = client.get("/me", headers=seeker).json()
    client.post("/swipes", headers=emp, json={
        "target_id": me["id"], "target_type": "user", "direction": "like"})

    r = client.delete(f"/vacancies/{v['id']}", headers=emp)
    assert r.status_code == 409
    assert v["id"] in {x["id"] for x in _mine(client, emp)}


def test_past_shift_disappears_from_feed(client):
    """Вчерашняя смена не показывается: раньше отсечка работала только при
    явном фильтре по датам, и прошедшие смены висели в ленте вечно."""
    h = _hdr(_auth(client))
    past = _make(client, h, date=_d(-1))
    future = _make(client, h, date=_d(2))

    ids = {x["id"] for x in client.get("/vacancies").json()}
    assert past["id"] not in ids
    assert future["id"] in ids

    # В своих вакансиях заведение прошедшую смену по-прежнему видит (история).
    assert past["id"] in {x["id"] for x in _mine(client, h)}


def test_admin_can_send_reminders_without_duplicates(client):
    """Рассылка напоминаний доступна оператору и не дублирует сообщения."""
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = _hdr(admin.json()["access_token"])
    first = client.post("/admin/reminders/send", headers=ah)
    assert first.status_code == 200
    assert "sent" in first.json()
    # Повторный запуск не падает и не шлёт заново.
    assert client.post("/admin/reminders/send", headers=ah).json()["sent"] == 0


def test_repeat_pairs_endpoint(client):
    """Счётчик повторных пар доступен оператору (пустой, пока смен нет)."""
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = _hdr(admin.json()["access_token"])
    r = client.get("/admin/repeat-pairs", headers=ah)
    assert r.status_code == 200
    assert r.json() == []


def _match_ready_for_checkin(client):
    """Доводит пару до подтверждённой смены на сегодня и возвращает данные."""
    emp = _hdr(_auth(client, role="employer"))
    v = _make(client, emp, date=_d(0))
    seeker = _hdr(_auth(client, role="seeker"))
    client.post("/swipes", headers=seeker, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    me = client.get("/me", headers=seeker).json()
    sw = client.post("/swipes", headers=emp, json={
        "target_id": me["id"], "target_type": "user", "direction": "like"}).json()
    mid = sw["match_id"]
    client.post(f"/matches/{mid}/confirm", headers=seeker)
    client.post(f"/matches/{mid}/confirm", headers=emp)
    return emp, seeker, mid


def _code_of(client, emp, mid):
    rows = client.get("/matches", headers=emp).json()
    return [m for m in rows if m["id"] == mid][0]["checkin_code"]


def test_shift_with_code_checkin_auto_closes_when_venue_silent(client):
    """Работник отметился кодом, заведение молчит — смена закрывается сама.
    Раньше это был самый частый спор: правило разбора однозначное, но
    исполнял его оператор вручную."""
    from datetime import UTC, datetime, timedelta

    from app.db import SessionLocal
    from app.digest import auto_close_shifts
    from app.models import Match, Vacancy

    emp, seeker, mid = _match_ready_for_checkin(client)
    code = _code_of(client, emp, mid)
    assert client.post(f"/matches/{mid}/checkin", headers=seeker,
                       json={"code": code}).status_code == 200

    db = SessionLocal()
    try:
        # Смена ещё не закончилась — закрывать рано.
        assert auto_close_shifts(db) == 0
        # Отматываем смену во вчера, чтобы срок ожидания истёк.
        m = db.get(Match, mid)
        v = db.get(Vacancy, m.vacancy_id)
        v.date = (datetime.now(UTC) - timedelta(days=1)).strftime("%Y-%m-%d")
        db.commit()

        assert auto_close_shifts(db) == 1
        db.refresh(m)
        assert m.status == "completed"
        assert m.no_show is False
        # Повторный запуск ничего не делает — смена уже закрыта.
        assert auto_close_shifts(db) == 0
    finally:
        db.close()


def test_geo_checkin_never_auto_closes(client):
    """По гео смена сама НЕ закрывается: рядом с кафе можно оказаться и не
    работая, это слабое доказательство — такие случаи решает оператор."""
    from datetime import UTC, datetime, timedelta

    from app.db import SessionLocal
    from app.digest import auto_close_shifts
    from app.models import Match, Vacancy

    emp, seeker, mid = _match_ready_for_checkin(client)
    r = client.post(f"/matches/{mid}/checkin", headers=seeker,
                    json={"lat": 55.75, "lng": 37.61})
    assert r.status_code == 200

    db = SessionLocal()
    try:
        m = db.get(Match, mid)
        v = db.get(Vacancy, m.vacancy_id)
        v.date = (datetime.now(UTC) - timedelta(days=2)).strftime("%Y-%m-%d")
        db.commit()
        assert auto_close_shifts(db) == 0
        db.refresh(m)
        assert m.status == "confirmed"
    finally:
        db.close()


def test_auto_close_endpoint_available_to_operator(client):
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = _hdr(admin.json()["access_token"])
    r = client.post("/admin/shifts/auto-close", headers=ah)
    assert r.status_code == 200
    assert "closed" in r.json()
