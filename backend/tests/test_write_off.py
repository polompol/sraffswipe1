"""Списание комиссии: прощённый спор и безнадёжный долг.

У оператора была одна кнопка — «Оплачено». Ею закрывали и реальную оплату, и
прощённую после спора комиссию, и долг, за которым никто не пойдёт в суд
из-за трёх тысяч. В отчёте всё это выглядело выручкой, которой не было, —
то есть владелец видел заработок больше настоящего и планировал по нему.
"""
from app.db import SessionLocal
from app.models import Commission, Employer, User


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


def _employer_with_debt(client, tg_id, make_match, amounts=(280, 450)):
    emp_h, eid = _auth(client, "employer")
    _detach(eid, tg_id)
    # Смены настоящие, а не выдуманные идентификаторы: комиссия ссылается на
    # смену внешним ключом, и в бою висеть в воздухе она не может.
    shifts = [make_match(eid) for _ in amounts]
    db = SessionLocal()
    try:
        for amount, mid in zip(amounts, shifts, strict=True):
            db.add(Commission(employer_id=eid, match_id=mid,
                              shift_pay=amount * 10, amount=amount))
        db.commit()
    finally:
        db.close()
    admin_h, _ = _auth(client, "seeker")   # tg_id=0 — оператор в тестах
    return admin_h, eid, shifts


def _revenue(client, admin_h):
    return client.get("/admin/revenue", headers=admin_h).json()


def test_write_off_does_not_look_like_revenue(client, make_match):
    """Списанное не попадает ни в «оплачено», ни в «к оплате»."""
    admin_h, eid, shifts = _employer_with_debt(client, 850001, make_match)
    before = _revenue(client, admin_h)
    assert before["commissionPendingRub"] == 730

    r = client.post(f"/admin/commissions/{eid}/write-off", headers=admin_h,
                    json={"reason": "спор решён в пользу заведения"})
    assert r.status_code == 200
    assert r.json() == {"ok": True, "written_off": 2, "amount_rub": 730}

    after = _revenue(client, admin_h)
    assert after["commissionPendingRub"] == 0
    assert after["commissionPaidRub"] == 0, "списание — не выручка"
    assert after["commissionWrittenOffRub"] == 730
    # Начислено за всё время не меняется: смены были.
    assert after["commissionAccruedRub"] == before["commissionAccruedRub"]


def test_reason_is_required_and_saved(client, make_match):
    """Через полгода никто не вспомнит, почему обнулили конкретное начисление."""
    admin_h, eid, shifts = _employer_with_debt(client, 850010, make_match)
    assert client.post(f"/admin/commissions/{eid}/write-off", headers=admin_h,
                       json={"reason": "ок"}).status_code == 422

    client.post(f"/admin/commissions/{eid}/write-off", headers=admin_h,
                json={"reason": "заведение закрылось, долг безнадёжный"})
    db = SessionLocal()
    try:
        rows = db.query(Commission).filter(Commission.employer_id == eid).all()
        assert all(c.status == "written_off" for c in rows)
        assert all("безнадёжный" in c.note for c in rows)
    finally:
        db.close()


def test_can_write_off_a_single_shift(client, make_match):
    """Спор по одной смене не должен обнулять весь счёт заведения."""
    admin_h, eid, shifts = _employer_with_debt(client, 850020, make_match)
    r = client.post(f"/admin/commissions/{eid}/write-off", headers=admin_h,
                    json={"reason": "работник не вышел, комиссия ошибочна",
                          "match_id": shifts[0]})
    assert r.json()["written_off"] == 1
    assert r.json()["amount_rub"] == 280
    assert _revenue(client, admin_h)["commissionPendingRub"] == 450


def test_nothing_to_write_off_is_404(client, make_match):
    admin_h, eid, shifts = _employer_with_debt(client, 850030, make_match, amounts=())
    r = client.post(f"/admin/commissions/{eid}/write-off", headers=admin_h,
                    json={"reason": "нечего списывать"})
    assert r.status_code == 404


def test_write_off_requires_admin(client, make_match):
    admin_h, eid, shifts = _employer_with_debt(client, 850040, make_match)
    emp_h, other = _auth(client, "employer")
    _detach(other, 850041)
    r = client.post(f"/admin/commissions/{eid}/write-off", headers=emp_h,
                    json={"reason": "сам себе прощу"})
    assert r.status_code in (401, 403)


def test_written_off_debt_stops_blocking_publishing(client, make_match):
    """Списали долг — блокировка публикации снимается.

    Иначе списание было бы бессмысленным: долга нет, а заведение всё ещё не
    может публиковать смены. Проверяем саму функцию просрочки: через вход
    это потребовало бы жонглирования tg_id и проверяло бы не то.
    """
    from datetime import UTC, datetime, timedelta

    from app.routers.billing import commission_overdue

    admin_h, eid, shifts = _employer_with_debt(client, 850050, make_match)
    db = SessionLocal()
    try:
        for c in db.query(Commission).filter(Commission.employer_id == eid):
            c.created_at = datetime.now(UTC) - timedelta(days=30)
        db.commit()
        assert commission_overdue(db, eid) is True
    finally:
        db.close()

    client.post(f"/admin/commissions/{eid}/write-off", headers=admin_h,
                json={"reason": "безнадёжный долг, списываем"})

    db = SessionLocal()
    try:
        assert commission_overdue(db, eid) is False
    finally:
        db.close()
