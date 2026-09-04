"""Молчание заведения не отменяет смену.

Главное правило сервиса: договорились — смена считается состоявшейся, пока
кто-то явно не сказал обратного. Но действовало оно только на смены,
подтверждённые ОБЕИМИ сторонами, — и ровно на шаг раньше оставалась та самая
дыра, ради которой правило и писалось.

Заведению достаточно было не нажимать «Подтвердить»: расчёт такую смену не
брал, комиссии не было никогда, а сама смена висела в списках вечно. Сторона,
которая должна деньги, снова выигрывала от бездействия.

Здесь проверяется новое положение дел целиком, включая злоупотребления.
"""
from app.db import SessionLocal
from app.models import Commission, Employer, Match, User


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


def _matched(client, tg_emp, tg_see):
    """Взаимный лайк по конкретной смене — но никто ещё не подтверждал."""
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
    _detach(eid, tg_emp)
    _detach(sid, tg_see)
    return emp_h, see_h, eid, mid


def _settle(mid, days=1):
    """Домотать смену до конца и прогнать расчёт."""
    from app.digest import settle_shifts

    from .shifttime import age_shift

    age_shift(mid, days)
    db = SessionLocal()
    try:
        return settle_shifts(db)
    finally:
        db.close()


def _commission(mid):
    db = SessionLocal()
    try:
        c = db.query(Commission).filter(Commission.match_id == mid).first()
        return c.amount if c else 0
    finally:
        db.close()


def _status(mid):
    db = SessionLocal()
    try:
        return db.get(Match, mid).status
    finally:
        db.close()


def test_venue_silence_does_not_cancel_a_confirmed_worker(client):
    """Работник подтвердил, заведение молчит — смена состоялась, комиссия есть.

    Это и есть закрытая дыра: раньше заведение просто не нажимало кнопку и не
    платило никогда.
    """
    _emp_h, see_h, _eid, mid = _matched(client, 881001, 881002)
    client.post(f"/matches/{mid}/confirm", headers=see_h)
    assert _status(mid) == "matched", "заведение не подтверждало"

    assert _settle(mid) == 1, "смена должна закрыться расчётом"
    assert _status(mid) == "completed"
    assert _commission(mid) == 320, "10% от 3 200 ₽"


def test_venue_can_still_say_the_shift_did_not_happen(client):
    """Выход у заведения есть, и он один — сказать явно.

    Без этого правило было бы не «молчание = согласие», а «попал — плати».
    """
    emp_h, see_h, _eid, mid = _matched(client, 881011, 881012)
    client.post(f"/matches/{mid}/confirm", headers=see_h)

    from .shifttime import age_shift

    age_shift(mid, 1)
    r = client.post(f"/matches/{mid}/not-held", headers=emp_h,
                    json={"reason": "человек не пришёл"})
    assert r.status_code == 200, r.text

    assert _settle(mid) == 0, "расчёт такую смену не трогает"
    assert _commission(mid) == 0, "комиссии нет"


def test_a_shift_nobody_confirmed_closes_without_money(client):
    """Никто не подтвердил — закрываем без денег и без неявки.

    Договорённости не было, и висеть в списках вечно ей незачем.
    """
    _emp_h, _see_h, _eid, mid = _matched(client, 881021, 881022)
    assert _settle(mid) == 0, "закрытых смен ноль: комиссии тут нет"
    assert _status(mid) == "expired"
    assert _commission(mid) == 0
    db = SessionLocal()
    try:
        assert db.get(Match, mid).no_show is False, "неявки быть не должно"
    finally:
        db.close()


def test_the_venue_is_warned_before_it_is_charged(client):
    """Заведение узнаёт о правиле дважды: когда работник подтвердил и утром.

    Списание не должно быть сюрпризом — иначе это ловушка, а не правило.
    """
    from app.digest import build_aftershift_asks

    _emp_h, see_h, _eid, mid = _matched(client, 881031, 881032)
    client.post(f"/matches/{mid}/confirm", headers=see_h)

    from .shifttime import age_shift

    age_shift(mid, 1)
    db = SessionLocal()
    try:
        asks = dict(build_aftershift_asks(db))
    finally:
        db.close()
    assert mid in asks, "утренний вопрос должен прийти и по такой смене"
    text = asks[mid]
    assert "не подтверждали" in text, "прямо сказано, что смена не подтверждена"
    assert "комисси" in text.lower(), "и чем это кончится"


def test_a_worker_cannot_bill_a_venue_that_never_chose_him(client):
    """Накрутить счёт нельзя: подтверждать можно только свою смену.

    Обратная сторона правила — чтобы работник не мог штамповать комиссии
    заведениям. Он и не может: мэтч создаётся только взаимным лайком, то есть
    заведение само выбрало этого человека на эту смену.
    """
    _emp_h, _see_h, _eid, mid = _matched(client, 881041, 881042)
    stranger_h, sid = _auth(client, "seeker")
    _detach(sid, 881043)
    r = client.post(f"/matches/{mid}/confirm", headers=stranger_h)
    assert r.status_code == 403, "чужую смену не подтвердить"


def test_a_no_show_worker_pays_with_his_record(client):
    """Работник подтвердил и не вышел — заведение не платит, а неявка у него.

    Это и удерживает от накрутки: цена лежит на том, кто накручивает.
    """
    emp_h, see_h, _eid, mid = _matched(client, 881051, 881052)
    client.post(f"/matches/{mid}/confirm", headers=see_h)

    from .shifttime import age_shift

    age_shift(mid, 1)
    client.post(f"/matches/{mid}/not-held", headers=emp_h,
                json={"reason": "не вышел"})
    db = SessionLocal()
    try:
        m = db.get(Match, mid)
        assert m.no_show is True, "неявка засчитывается работнику"
        assert m.status == "expired"
    finally:
        db.close()
    assert _commission(mid) == 0
