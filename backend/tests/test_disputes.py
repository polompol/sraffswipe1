"""Спор по смене: он должен где-то закончиться.

Спорную смену расчёт не трогает вообще — она не закрывается и комиссия по ней
не начисляется. Значит, у каждого спора обязан быть выход: либо вердикт
оператора, либо «оснований нет». Иначе смена висит вечно, а деньги сервиса
теряются молча — без ошибки, без записи, без единого следа.
"""
from datetime import date, timedelta

from app.db import SessionLocal
from app.models import Commission, Employer, Match, Report, User
from app.timeutil import local_today

from .shifttime import age_shift


def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _set_tg(owner_id: str, tg_id: int) -> None:
    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        o.tg_id = tg_id
        o.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _tomorrow() -> str:
    return (date.fromisoformat(local_today()) + timedelta(days=1)).isoformat()


def _confirmed_shift(client, tg_emp, tg_seeker):
    """Подтверждённая обеими сторонами смена (заведение и работник — разные)."""
    emp_h, eid = _auth(client, "employer")
    v = client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": _tomorrow(), "start_time": 600,
        "end_time": 1080, "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10", "city": "Москва",
    }).json()
    see_h, sid = _auth(client, "seeker")
    _set_tg(eid, tg_emp)
    _set_tg(sid, tg_seeker)
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})
    mid = client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy",
        "direction": "like"}).json()["match_id"]
    client.post(f"/matches/{mid}/confirm", headers=see_h)
    client.post(f"/matches/{mid}/confirm", headers=emp_h)
    return emp_h, see_h, eid, sid, mid


def _admin(client):
    # В тестах вход без подписи даёт tg_id=0, а он в ADMIN_TG_IDS (conftest).
    h, _ = _auth(client, "employer")
    return h


def _match(mid):
    db = SessionLocal()
    try:
        return db.get(Match, mid)
    finally:
        db.close()


def test_closing_the_complaint_lets_the_shift_go_on(client):
    """«Закрыть жалобу» = «оснований нет» — и смена идёт своим чередом.

    Раньше кнопка помечала жалобу разобранной, но признак спора со смены не
    снимала: смена зависала навсегда — не закрывалась, комиссия не
    начислялась. Один тап оператора стоил денег без единого следа.
    """
    from app.digest import settle_shifts

    emp_h, see_h, eid, sid, mid = _confirmed_shift(client, 850001, 850002)
    age_shift(mid, days=1)
    assert client.post(f"/matches/{mid}/dispute", headers=see_h,
                       json={"note": "не смог отметиться"}).status_code == 200
    assert _match(mid).disputed is True

    db = SessionLocal()
    try:
        assert settle_shifts(db) == 0, "спорную смену автоматика не трогает"
    finally:
        db.close()

    rep = None
    db = SessionLocal()
    try:
        rep = db.query(Report).filter(Report.target_id == mid).first()
        assert rep is not None, "спор обязан оставить жалобу оператору"
        rep_id = rep.id
    finally:
        db.close()

    admin_h = _admin(client)
    assert client.post(f"/admin/reports/{rep_id}/resolve", headers=admin_h,
                       json={"reply": "разобрались"}).status_code == 200
    assert _match(mid).disputed is False, "спор снят — смена больше не висит"

    db = SessionLocal()
    try:
        assert settle_shifts(db) == 1, "смена наконец закрывается"
        assert db.query(Commission).filter(
            Commission.match_id == mid).count() == 1, "комиссия начислена"
    finally:
        db.close()


def test_operator_verdict_still_wins(client):
    """Явный вердикт оператора не подменяется «оснований нет»."""
    emp_h, see_h, eid, sid, mid = _confirmed_shift(client, 850010, 850011)
    age_shift(mid, days=1)
    client.post(f"/matches/{mid}/dispute", headers=emp_h,
                json={"note": "человек не вышел"})
    admin_h = _admin(client)
    r = client.post(f"/matches/{mid}/resolve", headers=admin_h,
                    json={"outcome": "no_show"})
    assert r.status_code == 200, r.text
    m = _match(mid)
    assert m.disputed is False
    assert m.no_show is True
    assert m.status == "expired", "неявка — смены не было, комиссии нет"


def test_worker_can_complain_after_the_shift_is_closed(client):
    """«Мне не заплатили» — уже по ЗАКРЫТОЙ смене.

    Деньги идут напрямую от заведения, и сервис их не видит. Единственный ход
    человека — позвать оператора; до этого в приложении не оставалось ничего:
    кнопка «Проблема» жила лишь пока смена не закрыта, а закрывается она сама.
    """
    from app.digest import settle_shifts

    emp_h, see_h, eid, sid, mid = _confirmed_shift(client, 850020, 850021)
    age_shift(mid, days=1)
    db = SessionLocal()
    try:
        assert settle_shifts(db) == 1
    finally:
        db.close()
    assert _match(mid).status == "completed"

    r = client.post(f"/matches/{mid}/dispute", headers=see_h,
                    json={"note": "Не заплатили за смену"})
    assert r.status_code == 200, "по закрытой смене жалоба обязана приниматься"
    assert _match(mid).disputed is True

    db = SessionLocal()
    try:
        rep = db.query(Report).filter(Report.target_id == mid).first()
        assert rep is not None and "Не заплатили" in rep.text
    finally:
        db.close()


def test_a_stranger_cannot_open_a_dispute(client):
    """Спор по чужой смене открыть нельзя."""
    emp_h, see_h, eid, sid, mid = _confirmed_shift(client, 850030, 850031)
    other_h, other_id = _auth(client, "seeker")
    _set_tg(other_id, 850039)
    assert client.post(f"/matches/{mid}/dispute", headers=other_h,
                       json={"note": "просто так"}).status_code == 403
    assert _match(mid).disputed is False
