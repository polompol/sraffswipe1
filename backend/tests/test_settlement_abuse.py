"""Попытки не заплатить за состоявшуюся смену.

Правило сервиса: договорились → смена считается состоявшейся, пока кто-то
явно не сказал обратного. Каждый тест здесь — конкретный обходной путь,
который до этого работал: заведение получало работу и не платило комиссию.
"""
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models import Commission, Employer, Match, User, Vacancy
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


def _worked_shift(client, tg_emp, tg_seeker):
    """Смена, о которой договорились и которая УЖЕ прошла."""
    emp_h, eid = _auth(client, "employer")
    v = client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": local_today(), "start_time": 600,
        "end_time": 1080, "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    }).json()
    seeker_h, sid = _auth(client, "seeker")
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})
    mid = client.post("/swipes", headers=seeker_h, json={
        "target_id": v["id"], "target_type": "vacancy",
        "direction": "like"}).json()["match_id"]
    client.post(f"/matches/{mid}/confirm", headers=seeker_h)
    client.post(f"/matches/{mid}/confirm", headers=emp_h)
    _detach(eid, tg_emp)
    _detach(sid, tg_seeker)
    # Отматываем смену во вчера — человек уже отработал.
    db = SessionLocal()
    try:
        m = db.get(Match, mid)
        vac = db.get(Vacancy, m.vacancy_id)
        vac.date = (datetime.now(UTC) - timedelta(days=1)).strftime("%Y-%m-%d")
        db.commit()
    finally:
        db.close()
    return emp_h, seeker_h, mid


def _commission(mid):
    db = SessionLocal()
    try:
        return db.query(Commission).filter(Commission.match_id == mid).first()
    finally:
        db.close()


def test_cannot_cancel_a_shift_that_already_happened(client):
    """Отмена задним числом была универсальной кнопкой «не платить».

    Заведение не называло код, не жало «человек пришёл», а наутро отменяло
    смену: статус уходил в «отменена», расчёт её больше не видел, и работа
    получалась бесплатной. Двумя тапами, даже не через API.
    """
    emp_h, seeker_h, mid = _worked_shift(client, 880001, 880002)
    r = client.post(f"/matches/{mid}/cancel", headers=emp_h,
                    json={"reason": "передумали"})
    assert r.status_code == 409

    from app.digest import settle_shifts
    db = SessionLocal()
    try:
        assert settle_shifts(db) == 1
    finally:
        db.close()
    assert _commission(mid) is not None


def test_cannot_reschedule_a_shift_that_already_happened(client):
    """Перенос отработанной смены на будущее уводил её из-под расчёта."""
    emp_h, seeker_h, mid = _worked_shift(client, 880010, 880011)
    future = (datetime.now(UTC) + timedelta(days=20)).strftime("%Y-%m-%d")
    r = client.post(f"/matches/{mid}/reschedule", headers=emp_h,
                    json={"date": future, "start_time": 600, "end_time": 1080})
    assert r.status_code == 409


def test_hours_cannot_be_cut_to_nothing(client):
    """«Уточнить часы» было ретро-скидкой на комиссию.

    Смену 8 часов можно было «уточнить» до получаса и платить копейки.
    """
    emp_h, seeker_h, mid = _worked_shift(client, 880020, 880021)
    from app.digest import settle_shifts
    db = SessionLocal()
    try:
        settle_shifts(db)
    finally:
        db.close()
    before = _commission(mid).amount

    r = client.post(f"/matches/{mid}/hours", headers=emp_h, json={"minutes": 30})
    assert r.status_code == 409, "вдвое меньше объявленного — уже не уточнение"
    assert _commission(mid).amount == before


def test_no_show_verdict_survives_the_nightly_run(client):
    """Заведение выиграло спор — и получало счёт за смену, которой не было.

    Вердикт «неявка» оставлял смену подтверждённой, и ночной расчёт закрывал
    её как состоявшуюся: снимал неявку и начислял комиссию.
    """
    emp_h, seeker_h, mid = _worked_shift(client, 880030, 880031)
    client.post(f"/matches/{mid}/dispute", headers=seeker_h, json={"note": "был"})
    admin_h, _ = _auth(client, "seeker")  # conftest: tg_id=0 — админ
    r = client.post(f"/matches/{mid}/resolve", headers=admin_h,
                    json={"outcome": "no_show"})
    assert r.status_code == 200

    from app.digest import settle_shifts
    db = SessionLocal()
    try:
        assert settle_shifts(db) == 0
        m = db.get(Match, mid)
        assert m.status == "expired"
        assert m.no_show is True, "вердикт оператора не должен отменяться"
    finally:
        db.close()
    assert _commission(mid) is None


def test_marked_no_show_is_not_billed(client):
    """Заведение честно сказало «не вышел» — и получало за это счёт."""
    emp_h, seeker_h, mid = _worked_shift(client, 880040, 880041)
    r = client.post(f"/matches/{mid}/attendance", headers=emp_h,
                    json={"attended": False})
    assert r.status_code == 200

    from app.digest import settle_shifts
    db = SessionLocal()
    try:
        assert settle_shifts(db) == 0
        assert db.get(Match, mid).status == "expired"
    finally:
        db.close()
    assert _commission(mid) is None


def test_cannot_declare_not_held_before_the_shift_ends(client):
    """Заявление «смены не было» до её конца лишало работника доказательств.

    Заведение жало это в момент начала: смена уходила в «не состоялась» с
    неявкой на работнике, а он в это время шёл работать и уже не мог даже
    отметиться кодом.
    """
    emp_h, eid = _auth(client, "employer")
    v = client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": local_today(), "start_time": 0,
        "end_time": 1439, "rate": 400,
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    }).json()
    seeker_h, sid = _auth(client, "seeker")
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})
    mid = client.post("/swipes", headers=seeker_h, json={
        "target_id": v["id"], "target_type": "vacancy",
        "direction": "like"}).json()["match_id"]
    client.post(f"/matches/{mid}/confirm", headers=seeker_h)
    client.post(f"/matches/{mid}/confirm", headers=emp_h)

    r = client.post(f"/matches/{mid}/not-held", headers=emp_h,
                    json={"reason": "не вышел"})
    assert r.status_code == 409, "смена ещё идёт — для отказа есть отмена"


def test_disputes_reach_the_operator(client):
    """Автоматический спор не создавал разбор — деньги зависали молча."""
    from app.models import Report

    emp_h, seeker_h, mid = _worked_shift(client, 880050, 880051)
    code = [m for m in client.get("/matches", headers=emp_h).json()
            if m["id"] == mid][0]["checkin_code"]
    client.post(f"/matches/{mid}/checkin", headers=seeker_h, json={"code": code})
    client.post(f"/matches/{mid}/not-held", headers=emp_h, json={"reason": "не вышел"})

    db = SessionLocal()
    try:
        assert db.get(Match, mid).disputed is True
        rep = (
            db.query(Report)
            .filter(Report.target_id == mid, Report.target_type == "match")
            .first()
        )
        assert rep is not None, "спор обязан попасть в очередь оператора"
    finally:
        db.close()
