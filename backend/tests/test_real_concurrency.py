"""Гонки на настоящих потоках, а не по очереди.

Все прежние проверки гонок воспроизводили опасное чередование ДЕТЕРМИНИРОВАННО:
одна сессия делала шаг, другая — следующий. Это правильный способ поймать
логику (и он поймал двойную комиссию), но у него есть слепое пятно: он
проверяет то чередование, которое я придумал. Здесь два настоящих потока
стартуют по общему сигналу и бьются за один и тот же ресурс.

На SQLite (обычный прогон) писатель один, поэтому потоки выстраиваются в
очередь — проверка всё равно осмысленна, она ловит нарушение инварианта. На
PostgreSQL (второй прогон в сборке, как на сервере) это настоящая
параллельность, и работает уже блокировка строки — та самая FOR UPDATE, про
которую до сих пор был только комментарий в коде.
"""
import threading
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models import Commission, Employer, Entitlement, Match, User
from app.routers.swipes import SlotsFull, _ensure_match
from app.shift_rules import accrue_commission

RATE = 400
FEE = RATE * 8 // 10


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


def _both_at_once(work, args_a, args_b):
    """Запустить две задачи так, чтобы они начали в один момент.

    Барьер, а не «просто два потока»: без него первый успевает закончить
    раньше, чем второй начнёт, и никакой гонки не выходит — тест зеленеет,
    ничего не проверив.
    """
    gate = threading.Barrier(2)
    out: dict[str, object] = {}

    def run(name, args):
        gate.wait()
        try:
            out[name] = work(*args)
        except Exception as exc:  # noqa: BLE001 — исход гонки, а не сбой теста
            out[name] = exc

    ta = threading.Thread(target=run, args=("a", args_a))
    tb = threading.Thread(target=run, args=("b", args_b))
    ta.start()
    tb.start()
    ta.join(timeout=30)
    tb.join(timeout=30)
    assert not ta.is_alive() and not tb.is_alive(), (
        "потоки не завершились — похоже на взаимную блокировку"
    )
    return out


def test_two_workers_race_for_the_last_place(client):
    """Двое откликаются на последнее место одновременно — место одно.

    Раньше свободные места при создании мэтча не проверялись вовсе, и
    заведение получало двух человек на одно место: оба уверены, что смена их,
    один приезжает зря, а комиссия начисляется за каждого.
    """
    emp_h, eid = _auth(client, "employer")
    day = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    v = client.post("/vacancies", headers=emp_h, json={
        "role": "barista", "date": day, "start_time": 600, "end_time": 1080,
        "rate": RATE, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61, "headcount": 1,
    }).json()
    _detach(eid, 970100)
    _, s1 = _auth(client, "seeker")
    _detach(s1, 970101)
    _, s2 = _auth(client, "seeker")
    _detach(s2, 970102)

    def claim(user_id):
        db = SessionLocal()
        try:
            m, created = _ensure_match(db, user_id, eid, v["id"])
            db.commit()
            return created
        finally:
            db.close()

    out = _both_at_once(claim, (s1,), (s2,))

    won = [k for k, r in out.items() if r is True]
    refused = [k for k, r in out.items() if isinstance(r, SlotsFull)]
    assert len(won) == 1, f"место одно, а забрали оба: {out}"
    assert len(refused) == 1, f"проигравший должен получить внятный отказ: {out}"

    db = SessionLocal()
    try:
        rows = db.query(Match).filter(Match.vacancy_id == v["id"]).all()
        assert len(rows) == 1, f"в базе {len(rows)} мэтча на одно место"
    finally:
        db.close()


def test_two_commissions_race_for_one_balance(client):
    """Две смены закрываются одновременно, а денег на балансе — на одну.

    Здесь важен не сам факт списания, а то, что баланс не уйдёт в минус.
    Списание сделано атомарным UPDATE с условием «хватает денег» — но
    проверялось это только по одной смене за раз, то есть ровно там, где
    гонки и нет. Проигравшая смена должна остаться долгом (pending) и попасть
    в недельный счёт, а не списаться в минус.
    """
    emp_h, eid = _auth(client, "employer")
    day = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    _detach(eid, 970200)

    mids = []
    for i in range(2):
        v = client.post("/vacancies", headers=emp_h, json={
            "role": "barista", "date": day, "start_time": 600, "end_time": 1080,
            "rate": RATE, "rate_type": "perHour", "city": "Москва",
            "lat": 55.75, "lng": 37.61,
        }).json()
        _, sid = _auth(client, "seeker")
        _detach(sid, 970210 + i)
        db = SessionLocal()
        try:
            m, _ = _ensure_match(db, sid, eid, v["id"])
            db.commit()
            mids.append(m.id)
        finally:
            db.close()

    # Денег ровно на одну комиссию.
    db = SessionLocal()
    try:
        ent = db.query(Entitlement).filter(Entitlement.owner_id == eid).first()
        if ent is None:
            ent = Entitlement(owner_id=eid, balance_rub=0)
            db.add(ent)
        ent.balance_rub = FEE
        db.commit()
    finally:
        db.close()

    def charge(match_id):
        db = SessionLocal()
        try:
            accrue_commission(db, db.get(Match, match_id))
            db.commit()
        finally:
            db.close()

    _both_at_once(charge, (mids[0],), (mids[1],))

    db = SessionLocal()
    try:
        ent = db.query(Entitlement).filter(Entitlement.owner_id == eid).first()
        rows = db.query(Commission).filter(Commission.match_id.in_(mids)).all()
        paid = [c for c in rows if c.status == "paid"]
        pending = [c for c in rows if c.status != "paid"]
        assert ent.balance_rub >= 0, f"баланс ушёл в минус: {ent.balance_rub}"
        assert len(rows) == 2, "по каждой смене должно быть ровно одно начисление"
        assert len(paid) == 1, f"оплачено {len(paid)}, а денег хватало на одну"
        assert len(pending) == 1, "вторая обязана остаться долгом, а не пропасть"
        assert ent.balance_rub == 0, f"списали не всё, что могли: {ent.balance_rub}"
    finally:
        db.close()
