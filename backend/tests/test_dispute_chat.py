"""Оператор должен видеть переписку, по которой принимает решение.

Жалобы бывают ровно про написанное: «мошенничество», «абьюз», «спам». Цель
такой жалобы так и называется — «переписка по мэтчу». А самой переписки
оператору не показывали нигде: он видел имена, дату смены, код прихода — и
ни одного сообщения. Решать предлагалось по одному тексту заявителя.

И обратное правило не менее важно: это личная переписка двух людей. Читать
её можно только там, где на неё пожаловались.
"""
from app.db import SessionLocal
from app.models import Employer, User


def _auth(client, role):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _detach(owner_id, tg_id):
    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        o.tg_id = tg_id
        o.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _tomorrow():
    from datetime import date, timedelta

    from app.timeutil import local_today

    return (date.fromisoformat(local_today()) + timedelta(days=1)).isoformat()


def _pair_with_chat(client):
    """Смена с перепиской: работник и заведение написали друг другу."""
    emp_h, eid = _auth(client, "employer")
    v = client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": _tomorrow(), "start_time": 600,
        "end_time": 1080, "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
        "city": "Москва",
    }).json()
    see_h, sid = _auth(client, "seeker")
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})
    mid = client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy",
        "direction": "like"}).json()["match_id"]
    client.post(f"/matches/{mid}/messages", headers=emp_h,
                json={"text": "Приходите к десяти, спросите Олю"})
    client.post(f"/matches/{mid}/messages", headers=see_h,
                json={"text": "Понял, буду"})
    _detach(eid, 771001)
    _detach(sid, 771002)
    return emp_h, see_h, mid


def test_operator_reads_the_chat_of_a_disputed_shift(client):
    emp_h, see_h, mid = _pair_with_chat(client)
    # Спор: работник нажал «Проблема».
    client.post(f"/matches/{mid}/dispute", headers=see_h,
                json={"note": "не заплатили"})

    admin_h, _ = _auth(client, "employer")   # tg_id=0 — оператор
    r = client.get(f"/admin/matches/{mid}/messages", headers=admin_h)
    assert r.status_code == 200, r.text
    rows = r.json()

    texts = [m["text"] for m in rows]
    assert "Приходите к десяти, спросите Олю" in texts
    assert "Понял, буду" in texts

    # Видно, кто написал и когда — без этого переписка не доказательство.
    by_text = {m["text"]: m for m in rows}
    assert by_text["Понял, буду"]["side"] == "seeker"
    assert by_text["Приходите к десяти, спросите Олю"]["side"] == "employer"
    assert by_text["Понял, буду"]["at"], "у сообщения должно быть время"
    assert any(m["side"] == "system" for m in rows), "системные тоже видны"


def test_chat_without_a_complaint_stays_private(client):
    """Без жалобы и спора переписка закрыта — даже для оператора."""
    _emp_h, _see_h, mid = _pair_with_chat(client)
    admin_h, _ = _auth(client, "employer")
    r = client.get(f"/admin/matches/{mid}/messages", headers=admin_h)
    assert r.status_code == 403, "чужой разговор просто так не открывают"
    assert "жалоб" in r.json()["detail"].lower()


def test_chat_is_closed_for_everyone_but_the_operator(client):
    """Не-оператору ручка недоступна, даже по своей смене."""
    emp_h, see_h, mid = _pair_with_chat(client)
    client.post(f"/matches/{mid}/dispute", headers=see_h, json={"note": "спор"})
    for headers in (emp_h, see_h):
        r = client.get(f"/admin/matches/{mid}/messages", headers=headers)
        assert r.status_code in (401, 403), r.status_code


def test_complaint_on_the_chat_also_opens_it(client):
    """Жалобы достаточно — спор для этого заводить не нужно."""
    _emp_h, see_h, mid = _pair_with_chat(client)
    client.post("/reports", headers=see_h, json={
        "target_type": "match", "target_id": mid,
        "reason": "abuse", "text": "грубят",
    })
    admin_h, _ = _auth(client, "employer")
    r = client.get(f"/admin/matches/{mid}/messages", headers=admin_h)
    assert r.status_code == 200, r.text
    assert len(r.json()) >= 2


def test_unknown_shift_is_not_found(client):
    admin_h, _ = _auth(client, "employer")
    r = client.get("/admin/matches/нет-такой/messages", headers=admin_h)
    assert r.status_code == 404
