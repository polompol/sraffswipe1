"""Пересекающиеся смены: предупреждаем, но не запрещаем.

Ничто не мешало человеку взять две смены на одно время. Физически он в двух
местах не будет — значит, одно заведение останется без работника и узнает об
этом в день смены, когда искать замену уже поздно.

Запрет был бы вреднее: смену отменили или перенесли, человек берёт другую на
то же время — и упирается в стену, хотя ничего не нарушает. Поэтому
показываем предупреждение и даём подтвердить осознанно.
"""
from app.db import SessionLocal
from app.models import Employer, User
from app.timeutil import local_today


def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _detach(owner_id, tg_id):
    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        o.tg_id = tg_id
        if (o.phone or "").startswith("tg:"):
            o.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _shift(client, emp_h, start, end, date=None):
    return client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": date or local_today(),
        "start_time": start, "end_time": end,
        "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    }).json()


def _match(client, emp_h, seeker_h, seeker_id, vac_id):
    """Мэтч именно по ЭТОЙ смене.

    Порядок важен: лайк заведения ищет любой встречный отклик по любой своей
    смене, и при нескольких сменах мэтч мог получиться не по той. Поэтому
    заведение лайкает первым, а соискатель — последним: его путь привязан к
    конкретной смене.
    """
    client.post("/swipes", headers=emp_h, json={
        "target_id": seeker_id, "target_type": "user", "direction": "like"})
    r = client.post("/swipes", headers=seeker_h, json={
        "target_id": vac_id, "target_type": "vacancy",
        "direction": "like"}).json()
    return r["match_id"]


def _pair(client, tg_emp, tg_seeker):
    emp_h, eid = _auth(client, "employer")
    seeker_h, sid = _auth(client, "seeker")
    _detach(eid, tg_emp)
    _detach(sid, tg_seeker)
    return emp_h, seeker_h, sid


def test_warns_about_overlapping_shift(client):
    """Вторая смена в то же время — предупреждение, а не молчаливое согласие."""
    emp_h, seeker_h, sid = _pair(client, 840001, 840002)
    first = _shift(client, emp_h, 600, 1080)     # 10:00–18:00
    second = _shift(client, emp_h, 900, 1200)    # 15:00–20:00 — пересекается

    m1 = _match(client, emp_h, seeker_h, sid, first["id"])
    assert client.post(f"/matches/{m1}/confirm",
                       headers=seeker_h).status_code == 200

    m2 = _match(client, emp_h, seeker_h, sid, second["id"])
    r = client.post(f"/matches/{m2}/confirm", headers=seeker_h)
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["code"] == "shift_conflict"
    assert "пересекается" in detail["message"]
    assert "10:00–18:00" in detail["message"]


def test_can_take_it_anyway(client):
    """Предупредили — но решает человек: с подтверждением смена берётся."""
    emp_h, seeker_h, sid = _pair(client, 840010, 840011)
    first = _shift(client, emp_h, 600, 1080)
    second = _shift(client, emp_h, 900, 1200)
    m1 = _match(client, emp_h, seeker_h, sid, first["id"])
    client.post(f"/matches/{m1}/confirm", headers=seeker_h)
    m2 = _match(client, emp_h, seeker_h, sid, second["id"])

    r = client.post(f"/matches/{m2}/confirm", headers=seeker_h,
                    params={"force": True})
    assert r.status_code == 200
    assert r.json()["confirmed_by_seeker"] is True


def test_shifts_that_only_touch_do_not_warn(client):
    """Смены встык (18:00 и 18:00) — не пересечение, предупреждать не о чем."""
    emp_h, seeker_h, sid = _pair(client, 840020, 840021)
    first = _shift(client, emp_h, 600, 1080)     # 10:00–18:00
    second = _shift(client, emp_h, 1080, 1320)   # 18:00–22:00
    m1 = _match(client, emp_h, seeker_h, sid, first["id"])
    client.post(f"/matches/{m1}/confirm", headers=seeker_h)
    m2 = _match(client, emp_h, seeker_h, sid, second["id"])
    assert client.post(f"/matches/{m2}/confirm",
                       headers=seeker_h).status_code == 200


def test_night_shift_overlaps_next_morning(client):
    """Ночная смена 22:00→06:00 пересекается с утренней СЛЕДУЮЩЕГО дня.

    Ради этого случая сравниваются абсолютные моменты, а не «дата и часы»:
    по датам смены разные, а человек в шесть утра ещё на первой.
    """
    from datetime import date, timedelta

    emp_h, seeker_h, sid = _pair(client, 840030, 840031)
    today = local_today()
    tomorrow = (date.fromisoformat(today) + timedelta(days=1)).isoformat()

    night = _shift(client, emp_h, 1320, 360, date=today)      # 22:00 → 06:00
    morning = _shift(client, emp_h, 300, 720, date=tomorrow)  # 05:00 → 12:00

    m1 = _match(client, emp_h, seeker_h, sid, night["id"])
    client.post(f"/matches/{m1}/confirm", headers=seeker_h)
    m2 = _match(client, emp_h, seeker_h, sid, morning["id"])
    r = client.post(f"/matches/{m2}/confirm", headers=seeker_h)
    assert r.status_code == 409, "ночная смена и утро следующего дня пересекаются"


def test_different_days_are_fine(client):
    """Смены в разные дни в одно время — не конфликт."""
    from datetime import date, timedelta

    emp_h, seeker_h, sid = _pair(client, 840040, 840041)
    today = local_today()
    later = (date.fromisoformat(today) + timedelta(days=3)).isoformat()
    a = _shift(client, emp_h, 600, 1080, date=today)
    b = _shift(client, emp_h, 600, 1080, date=later)
    m1 = _match(client, emp_h, seeker_h, sid, a["id"])
    client.post(f"/matches/{m1}/confirm", headers=seeker_h)
    m2 = _match(client, emp_h, seeker_h, sid, b["id"])
    assert client.post(f"/matches/{m2}/confirm",
                       headers=seeker_h).status_code == 200


def test_employer_confirmation_is_not_affected(client):
    """Предупреждение — про занятость РАБОТНИКА. Заведение подтверждает как
    обычно: у него смены идут параллельно по определению."""
    emp_h, seeker_h, sid = _pair(client, 840050, 840051)
    first = _shift(client, emp_h, 600, 1080)
    second = _shift(client, emp_h, 900, 1200)
    m1 = _match(client, emp_h, seeker_h, sid, first["id"])
    client.post(f"/matches/{m1}/confirm", headers=seeker_h)
    client.post(f"/matches/{m1}/confirm", headers=emp_h)
    m2 = _match(client, emp_h, seeker_h, sid, second["id"])
    assert client.post(f"/matches/{m2}/confirm",
                       headers=emp_h).status_code == 200
