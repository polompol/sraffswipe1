"""Лимиты частоты не просто объявлены — они действительно стоят на ручках.

Сам механизм лимитов проверяется отдельно (test_ratelimit.py). Здесь другое:
что он подключён именно там, где без него плохо. Забыть один Depends легко, а
заметить это можно только тогда, когда по ручке уже прошлись скриптом.

Проверяются те ручки, где цена пропуска — деньги или чужие данные:
  • код прихода — шесть цифр, и без лимита он подбирается за минуты;
  • свайпы — ими выкачивают ленту людей с персональными данными;
  • сообщения — ими заваливают вторую сторону;
  • публикация смен — ею забивают ленту.
"""
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models import Employer, User
from app.ratelimit import reset as reset_rate_limit


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


def _shift(client, emp_h, days=2, headcount=1):
    day = (datetime.now(UTC) + timedelta(days=days)).date().isoformat()
    return client.post("/vacancies", headers=emp_h, json={
        "role": "barista", "date": day, "start_time": 600, "end_time": 1080,
        "rate": 400, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61, "headcount": headcount,
    }).json()


def _first_429(make_call, limit_guess=200):
    """На какой по счёту попытке ручка сказала «слишком часто»."""
    for n in range(1, limit_guess + 1):
        if make_call(n).status_code == 429:
            return n
    return None


def test_the_checkin_code_cannot_be_brute_forced(client, age_shift):
    """Код прихода — шесть цифр. Без лимита это минуты перебора.

    Он не просто «секрет»: это доказательство, что человек был на месте.
    Подобравший его чужой аккаунт закрывает чужую смену.
    """
    reset_rate_limit()
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
    _detach(eid, 950101)
    see_h, sid = _auth(client, "seeker")
    _detach(sid, 950102)
    client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    mid = client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like",
        "vacancy_id": v["id"]}).json()["match_id"]
    client.post(f"/matches/{mid}/confirm", headers=see_h)
    client.post(f"/matches/{mid}/confirm", headers=emp_h)
    age_shift(mid, 0)

    n = _first_429(lambda i: client.post(
        f"/matches/{mid}/checkin", headers=see_h,
        json={"code": f"{i:06d}"}), limit_guess=40)
    assert n is not None, "подбор кода никто не останавливает"
    assert n <= 10, f"слишком много попыток до отказа: {n}"


def test_the_candidate_feed_cannot_be_scraped(client):
    """Свайпами выкачивают ленту людей — а это персональные данные."""
    reset_rate_limit()
    emp_h, eid = _auth(client, "employer")
    _detach(eid, 950111)
    n = _first_429(lambda i: client.post("/swipes", headers=emp_h, json={
        "target_id": f"no-such-{i}", "target_type": "user",
        "direction": "dislike"}), limit_guess=200)
    assert n is not None, "свайпы ничем не ограничены"
    assert n <= 100, f"слишком много свайпов до отказа: {n}"


def test_the_chat_cannot_be_flooded(client):
    """Сообщениями заваливают вторую сторону — и уведомлениями тоже."""
    reset_rate_limit()
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
    _detach(eid, 950121)
    see_h, sid = _auth(client, "seeker")
    _detach(sid, 950122)
    client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    mid = client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like",
        "vacancy_id": v["id"]}).json()["match_id"]

    n = _first_429(lambda i: client.post(
        f"/matches/{mid}/messages", headers=see_h,
        json={"text": f"сообщение {i}"}), limit_guess=100)
    assert n is not None, "чат ничем не ограничен"
    assert n <= 50, f"слишком много сообщений до отказа: {n}"


def test_the_feed_cannot_be_stuffed_with_shifts(client):
    """Публикацией смен забивают ленту — платить за это не надо."""
    reset_rate_limit()
    emp_h, eid = _auth(client, "employer")
    _detach(eid, 950131)
    n = _first_429(lambda i: client.post("/vacancies", headers=emp_h, json={
        "role": "barista",
        "date": (datetime.now(UTC) + timedelta(days=2)).date().isoformat(),
        "start_time": 600, "end_time": 1080, "rate": 400,
        "rate_type": "perHour", "city": "Москва", "lat": 55.75, "lng": 37.61,
    }), limit_guess=40)
    assert n is not None, "публикация смен ничем не ограничена"
    assert n <= 20, f"слишком много смен до отказа: {n}"


def test_the_limit_is_personal_not_shared(client):
    """Упёршийся в лимит не должен закрывать ручку остальным.

    Иначе один скрипт останавливал бы работу всему сервису — это отказ в
    обслуживании ценой одного аккаунта.
    """
    reset_rate_limit()
    a_h, aid = _auth(client, "employer")
    _detach(aid, 950141)
    b_h, bid = _auth(client, "employer")
    _detach(bid, 950142)

    assert _first_429(lambda i: client.post("/swipes", headers=a_h, json={
        "target_id": f"x-{i}", "target_type": "user",
        "direction": "dislike"}), limit_guess=200) is not None

    # Второму заведению ручка отвечает как ни в чём не бывало.
    r = client.post("/swipes", headers=b_h, json={
        "target_id": "y-1", "target_type": "user", "direction": "dislike"})
    assert r.status_code != 429
