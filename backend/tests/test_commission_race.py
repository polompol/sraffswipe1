"""Две стороны считают одну и ту же смену одновременно.

Ночной расчёт (`settle_shifts`) и кнопка заведения «Человек пришёл» могут
сойтись на одной смене в одну секунду. Обе стороны сначала смотрят, есть ли
уже начисление, обе видят «нет» — и обе вставляют. Дальше зависит от кода:
без защиты заведение получает ДВЕ комиссии за одну смену и списание вдвойне,
а ночной расчёт падает на этой смене и не доходит до остальных.

Защита в коде есть — уникальность `match_id`, SAVEPOINT и перехват ошибки, —
но проверялась она только чтением. Здесь гонка воспроизводится по-настоящему:
двумя сессиями базы, с тем же порядком шагов, что и в жизни.
"""
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models import Commission, Employer, Entitlement, Match, User, WalletTxn

RATE = 400
SHIFT_PAY = RATE * 8
FEE = SHIFT_PAY // 10


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


def _matched(client, tg=960000):
    """Довести пару до мэтча и вернуть (заголовки заведения, id заведения, id мэтча)."""
    emp_h, eid = _auth(client, "employer")
    day = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    v = client.post("/vacancies", headers=emp_h, json={
        "role": "barista", "date": day, "start_time": 600, "end_time": 1080,
        "rate": RATE, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61,
    }).json()
    _detach(eid, tg)
    see_h, sid = _auth(client, "seeker")
    _detach(sid, tg + 1)
    client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    out = client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like",
        "vacancy_id": v["id"]}).json()
    mid = out["match_id"]
    # Обе стороны подтвердили выход: без этого смена не «подтверждённая», и
    # ни кнопка закрытия, ни расчёт её не трогают.
    client.post(f"/matches/{mid}/confirm", headers=see_h)
    client.post(f"/matches/{mid}/confirm", headers=emp_h)
    return emp_h, eid, mid


def _commissions(match_id):
    db = SessionLocal()
    try:
        return db.query(Commission).filter(Commission.match_id == match_id).all()
    finally:
        db.close()


def _balance(owner_id):
    db = SessionLocal()
    try:
        ent = db.query(Entitlement).filter(
            Entitlement.owner_id == owner_id).first()
        return ent.balance_rub if ent else 0
    finally:
        db.close()


def _credit(client, admin_h, owner_id, amount):
    r = client.post(f"/admin/wallet/{owner_id}/credit", headers=admin_h,
                    json={"amount_rub": amount, "note": "тест"})
    assert r.status_code == 200, r.text


def test_two_simultaneous_accruals_charge_once(client, age_shift, monkeypatch):
    """Настоящая гонка: обе стороны успели увидеть «начисления ещё нет».

    Порядок шагов ровно как в жизни:
      1. сторона А смотрит — начисления нет;
      2. сторона Б смотрит — начисления нет, вставляет и фиксирует;
      3. сторона А вставляет — и упирается в уникальность.

    Шаг 1 воспроизводится «ослеплением» проверки: в жизни А читала базу до
    того, как Б записала, и по-другому это на одной машине не подделать.
    Дальше — настоящий код и настоящая уникальность в базе. Проигравший в
    гонке должен молча уйти, не сломав ни свою работу, ни чужую.
    """
    import app.routers.matches as matches_module
    from app.routers.matches import _accrue_commission

    emp_h, eid, mid = _matched(client, tg=960100)
    admin_h, _ = _auth(client, "seeker")   # tg_id=0 — оператор
    _credit(client, admin_h, eid, 1000)
    age_shift(mid, 0)

    # Б успевает первой и фиксирует начисление.
    b = SessionLocal()
    try:
        _accrue_commission(b, b.get(Match, mid))
        b.commit()
    finally:
        b.close()
    assert len(_commissions(mid)) == 1

    # А идёт следом со СТАРЫМ знанием «начисления нет» — то самое окно гонки.
    monkeypatch.setattr(matches_module, "_already_accrued", lambda db, mid: False)
    a = SessionLocal()
    try:
        _accrue_commission(a, a.get(Match, mid))
        a.commit()
    finally:
        a.close()

    rows = _commissions(mid)
    assert len(rows) == 1, "за одну смену — одна комиссия, даже в гонке"
    assert rows[0].amount == FEE
    assert rows[0].status == "paid"
    assert _balance(eid) == 1000 - FEE, "списание ровно одно"

    db = SessionLocal()
    try:
        txns = db.query(WalletTxn).filter(
            WalletTxn.owner_id == eid, WalletTxn.kind == "commission").all()
        assert len(txns) == 1, "в истории кошелька тоже одна запись"
        assert txns[0].amount == -FEE
    finally:
        db.close()


def test_scheduler_and_button_together_charge_once(client, age_shift):
    """Тот же случай, но через настоящие ручки, а не напрямую.

    Заведение жмёт «Человек пришёл» ровно тогда, когда оператор (или
    планировщик) запускает расчёт по сменам. Обе дороги ведут к начислению.
    """
    emp_h, eid, mid = _matched(client, tg=960200)
    admin_h, _ = _auth(client, "seeker")
    _credit(client, admin_h, eid, 1000)
    age_shift(mid, 1)

    assert client.post(f"/matches/{mid}/attendance", headers=emp_h,
                       json={"attended": True}).status_code == 200
    # Расчёт приходит следом и видит уже закрытую смену.
    client.post("/admin/shifts/auto-close", headers=admin_h)
    # И ещё раз — так бывает при повторном запуске задания.
    client.post("/admin/shifts/auto-close", headers=admin_h)

    assert len(_commissions(mid)) == 1
    assert _balance(eid) == 1000 - FEE
    bill = client.get("/billing/commission", headers=emp_h).json()
    assert bill["pendingRub"] == 0
    assert bill["balanceRub"] == 1000 - FEE


def test_without_balance_the_debt_is_counted_once(client, age_shift):
    """Без аванса комиссия висит счётом — и в гонке тоже ровно одна."""
    from app.routers.matches import _accrue_commission

    emp_h, eid, mid = _matched(client, tg=960300)
    age_shift(mid, 0)

    a, b = SessionLocal(), SessionLocal()
    try:
        _accrue_commission(b, b.get(Match, mid))
        b.commit()
        _accrue_commission(a, a.get(Match, mid))
        a.commit()
    finally:
        a.close()
        b.close()

    rows = _commissions(mid)
    assert len(rows) == 1
    assert rows[0].status == "pending"
    bill = client.get("/billing/commission", headers=emp_h).json()
    assert bill["pendingRub"] == FEE
    assert bill["pendingShifts"] == 1
