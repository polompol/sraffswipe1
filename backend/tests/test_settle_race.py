"""Возражение, поданное ВО ВРЕМЯ расчёта, должно побеждать.

Ночной расчёт читает список смен одним запросом, и условия «не спорная» и
«никто не заявил, что смены не было» проверялись ровно там — один раз. Дальше
шёл проход по списку с записью в базу, и между чтением и записью проходит весь
прогон.

За это время заведение может нажать «Смена не состоялась», а работник —
открыть спор. Присваивание полю (m.status = "completed") затирало возражение и
начисляло комиссию за смену, против которой только что возразили ЯВНО. Это
прямо противоречит доктрине сервиса: молчание значит согласие, но явное
возражение сильнее молчания всегда.

Гонка воспроизводится детерминированно: возражение подаётся из ОТДЕЛЬНОЙ
сессии в тот момент, когда расчёт уже прочитал список и разбирает эту смену.
По-другому на одной машине это не подделать — и именно так устроены остальные
проверки гонок в проекте.
"""
from app import digest
from app.db import SessionLocal
from app.models import Commission, Employer, Match, User
from app.timeutil import local_today

from .shifttime import age_shift


def _auth(client, role):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role}).json()
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


def _worked_shift(client, tg):
    """Смена, о которой договорились и которая уже прошла."""
    emp_h, eid = _auth(client, "employer")
    v = client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": local_today(), "start_time": 600,
        "end_time": 1080, "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    }).json()
    see_h, sid = _auth(client, "seeker")
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})
    mid = client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy",
        "direction": "like"}).json()["match_id"]
    client.post(f"/matches/{mid}/confirm", headers=see_h)
    client.post(f"/matches/{mid}/confirm", headers=emp_h)
    _detach(eid, tg)
    _detach(sid, tg + 1)
    age_shift(mid, 1)
    return mid


def _object_mid_run(field: str, value):
    """Подать возражение из чужой сессии — как это сделал бы живой человек."""
    def hook(v):
        db = SessionLocal()
        try:
            m = db.query(Match).filter(Match.vacancy_id == v.id).first()
            if m is not None and getattr(m, field) in ("", False):
                setattr(m, field, value)
                db.commit()
        finally:
            db.close()
        return digest.shift_end_utc(v.date, v.start_time, v.end_time, v.city)
    return hook


def test_not_held_pressed_during_the_run_wins(client, monkeypatch):
    """«Смена не состоялась» нажали, пока шёл расчёт, — комиссии быть не должно."""
    mid = _worked_shift(client, 990101)
    monkeypatch.setattr(
        digest, "_shift_end", _object_mid_run("not_held_by", "employer"),
    )

    db = SessionLocal()
    try:
        digest.settle_shifts(db)
    finally:
        db.close()

    db = SessionLocal()
    try:
        m = db.get(Match, mid)
        assert m.status != "completed", (
            "расчёт закрыл смену, против которой возразили во время прогона"
        )
        left = db.query(Commission).filter(Commission.match_id == mid).first()
        assert left is None, (
            "начислена комиссия за смену, которую объявили несостоявшейся"
        )
    finally:
        db.close()


def test_dispute_opened_during_the_run_wins(client, monkeypatch):
    """Спор открыли во время расчёта — решать оператору, а не расчёту."""
    mid = _worked_shift(client, 990111)
    monkeypatch.setattr(digest, "_shift_end", _object_mid_run("disputed", True))

    db = SessionLocal()
    try:
        digest.settle_shifts(db)
    finally:
        db.close()

    db = SessionLocal()
    try:
        m = db.get(Match, mid)
        assert m.status != "completed", "спорную смену расчёт закрывать не должен"
        assert db.query(Commission).filter(
            Commission.match_id == mid).first() is None
    finally:
        db.close()


def test_without_objections_the_shift_still_closes(client):
    """Обратная половина: молчание по-прежнему закрывает смену с комиссией.

    Без неё проверки выше доказывали бы лишь то, что расчёт перестал работать.
    """
    mid = _worked_shift(client, 990121)
    db = SessionLocal()
    try:
        assert digest.settle_shifts(db) >= 1
    finally:
        db.close()

    db = SessionLocal()
    try:
        assert db.get(Match, mid).status == "completed"
        assert db.query(Commission).filter(
            Commission.match_id == mid).first() is not None
    finally:
        db.close()
