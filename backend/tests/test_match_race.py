"""Встречные свайпы в одну секунду не должны давать два мэтча.

Соискатель жмёт «Отклик» ровно тогда, когда заведение жмёт «Позвать». Обе
стороны сначала смотрят, есть ли уже мэтч, обе видят «нет» — и обе создают.
Без защиты получается два мэтча на одну смену: у обоих сторон в списке по две
одинаковые строки, место на смене занято дважды, а комиссия начисляется за
каждый закрытый.

Защита в коде есть — уникальность пары «смена + человек» и перехват ошибки, —
но проверялась она только чтением. Здесь гонка воспроизводится по-настоящему.
"""
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models import Employer, Match, User


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


def _shift(client, emp_h, headcount=1):
    day = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    return client.post("/vacancies", headers=emp_h, json={
        "role": "barista", "date": day, "start_time": 600, "end_time": 1080,
        "rate": 400, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61, "headcount": headcount,
    }).json()


def _matches(vacancy_id):
    db = SessionLocal()
    try:
        return db.query(Match).filter(Match.vacancy_id == vacancy_id).all()
    finally:
        db.close()


def _slots_left(client, headers, vacancy_id):
    rows = client.get("/vacancies?mine=1", headers=headers).json()
    return next(v["slots_left"] for v in rows if v["id"] == vacancy_id)


def test_counter_swipes_at_once_make_one_match(client):
    """Обе стороны успели увидеть «мэтча ещё нет».

    Первая создаёт и фиксирует. Вторая идёт следом со СТАРЫМ знанием — то
    самое окно гонки — и упирается в уникальность. Она обязана не упасть, а
    подобрать уже созданный мэтч: для человека это одно и то же событие.
    """
    import app.routers.swipes as swipes_module
    from app.routers.swipes import _ensure_match

    emp_h, eid = _auth(client, "employer")
    # Мест два: иначе второй заход упрётся в «мест нет» РАНЬШЕ, чем в
    # уникальность, и проверялась бы совсем другая защита.
    v = _shift(client, emp_h, headcount=2)
    _detach(eid, 980001)
    see_h, sid = _auth(client, "seeker")
    _detach(sid, 980002)

    # Первая сторона создала мэтч.
    a = SessionLocal()
    try:
        first, created = _ensure_match(a, sid, eid, v["id"])
        assert created is True
        first_id = first.id
    finally:
        a.close()

    # Вторая идёт с устаревшим «мэтча нет».
    monkey = swipes_module._find_match
    swipes_module._find_match = lambda db, user_id, vacancy_id: None
    try:
        b = SessionLocal()
        try:
            second, created2 = _ensure_match(b, sid, eid, v["id"])
        finally:
            b.close()
    finally:
        swipes_module._find_match = monkey

    assert created2 is False, "второй раз мэтч не создаётся"
    assert second.id == first_id, "обе стороны получают ОДИН и тот же мэтч"
    assert len(_matches(v["id"])) == 1


def test_the_seat_is_not_taken_twice_in_a_race(client):
    """Проигравший в гонке не должен занять второе место на смене.

    Место занимается ДО вставки мэтча. Если бы откат не возвращал его назад,
    смена на одного человека уходила бы из ленты, не набрав никого.
    """
    import app.routers.swipes as swipes_module
    from app.routers.swipes import _ensure_match

    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h, headcount=2)
    _detach(eid, 980010)
    see_h, sid = _auth(client, "seeker")
    _detach(sid, 980011)

    a = SessionLocal()
    try:
        _ensure_match(a, sid, eid, v["id"])
    finally:
        a.close()
    assert _slots_left(client, emp_h, v["id"]) == 1

    monkey = swipes_module._find_match
    swipes_module._find_match = lambda db, user_id, vacancy_id: None
    try:
        b = SessionLocal()
        try:
            _ensure_match(b, sid, eid, v["id"])
        finally:
            b.close()
    finally:
        swipes_module._find_match = monkey

    assert _slots_left(client, emp_h, v["id"]) == 1, (
        "проигравший в гонке место не занимает"
    )
    assert len(_matches(v["id"])) == 1


def test_double_swipe_through_the_real_endpoint_makes_one_match(client):
    """То же самое через настоящую ручку: два одинаковых свайпа подряд.

    Так бывает при двойном нажатии и при повторе запроса на плохой связи.
    """
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
    _detach(eid, 980020)
    see_h, sid = _auth(client, "seeker")
    _detach(sid, 980021)

    client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    first = client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like",
        "vacancy_id": v["id"]}).json()
    second = client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like",
        "vacancy_id": v["id"]}).json()

    assert first["matched"] is True
    assert len(_matches(v["id"])) == 1
    # Второе нажатие не создаёт ни второго мэтча, ни второго места.
    if second.get("matched"):
        assert second["match_id"] == first["match_id"]
    assert _slots_left(client, emp_h, v["id"]) == 0
    assert len(client.get("/matches", headers=see_h).json()) == 1
    assert len(client.get("/matches", headers=emp_h).json()) == 1


def test_two_people_cannot_take_one_seat(client):
    """Два человека на смену для одного: второй получает отказ, а не мэтч.

    Это не гонка сессий, а обычная спешка: оба откликнулись, заведение
    лайкнуло обоих подряд, пока смена ещё висела в ленте.
    """
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h, headcount=1)
    _detach(eid, 980030)

    ids = []
    for i in range(2):
        h, uid = _auth(client, "seeker")
        _detach(uid, 980031 + i)
        client.post("/swipes", headers=h, json={
            "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
        ids.append(uid)

    ok = client.post("/swipes", headers=emp_h, json={
        "target_id": ids[0], "target_type": "user", "direction": "like",
        "vacancy_id": v["id"]})
    assert ok.json()["matched"] is True

    full = client.post("/swipes", headers=emp_h, json={
        "target_id": ids[1], "target_type": "user", "direction": "like",
        "vacancy_id": v["id"]})
    assert full.status_code == 409, "мест нет — отказ, а не второй мэтч"
    assert len(_matches(v["id"])) == 1
