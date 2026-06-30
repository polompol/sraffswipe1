"""Тесты новых фич: прозрачность оплаты, доверие заведения, доход, доступность."""


def _auth(client, role="seeker"):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role})
    return r.json()["access_token"], r.json()["user_id"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


def _make_vacancy(client, emp_token, pay_method="cash"):
    return client.post("/vacancies", headers=_hdr(emp_token), json={
        "role": "barista", "date": "2026-06-20", "start_time": 600,
        "end_time": 1080, "rate": 350, "rate_type": "perHour",
        "pay_method": pay_method, "lat": 55.75, "lng": 37.61, "address": "Тест",
    }).json()


def test_pay_method_roundtrips(client):
    emp_token, _ = _auth(client, "employer")
    vac = _make_vacancy(client, emp_token, pay_method="transfer")
    assert vac["pay_method"] == "transfer"
    # значение видно и в общей ленте соискателя
    seeker_token, _ = _auth(client, "seeker")
    feed = client.get("/vacancies", headers=_hdr(seeker_token)).json()
    assert any(v["pay_method"] == "transfer" for v in feed)


def test_pay_method_defaults_to_cash(client):
    emp_token, _ = _auth(client, "employer")
    vac = client.post("/vacancies", headers=_hdr(emp_token), json={
        "role": "waiter", "date": "2026-06-21", "start_time": 600,
        "end_time": 1080, "rate": 300, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Тест",
    }).json()
    assert vac["pay_method"] == "cash"
    assert vac["tips"] == "none"  # чаевые по умолчанию выключены


def test_tips_roundtrips(client):
    emp_token, _ = _auth(client, "employer")
    vac = client.post("/vacancies", headers=_hdr(emp_token), json={
        "role": "waiter", "date": "2026-06-22", "start_time": 600,
        "end_time": 1080, "rate": 300, "rate_type": "perHour",
        "tips": "shared", "lat": 55.75, "lng": 37.61, "address": "Тест",
    }).json()
    assert vac["tips"] == "shared"
    seeker_token, _ = _auth(client, "seeker")
    feed = client.get("/vacancies", headers=_hdr(seeker_token)).json()
    assert any(v["tips"] == "shared" for v in feed)


def _full_shift_cycle(client):
    """Доводит мэтч до подтверждённой смены, возвращает токены/ids."""
    emp_token, emp_id = _auth(client, "employer")
    vac = _make_vacancy(client, emp_token)
    seeker_token, seeker_id = _auth(client, "seeker")
    client.post("/swipes", headers=_hdr(emp_token), json={
        "target_id": seeker_id, "target_type": "user", "direction": "like",
    })
    sw = client.post("/swipes", headers=_hdr(seeker_token), json={
        "target_id": vac["id"], "target_type": "vacancy", "direction": "like",
    }).json()
    match_id = sw["match_id"]
    client.post(f"/matches/{match_id}/confirm", headers=_hdr(seeker_token))
    client.post(f"/matches/{match_id}/confirm", headers=_hdr(emp_token))
    return emp_token, emp_id, seeker_token, seeker_id, vac, match_id


def test_seeker_earnings_counted_after_shift(client):
    _, _, seeker_token, _, vac, _ = _full_shift_cycle(client)
    me = client.get("/me", headers=_hdr(seeker_token)).json()
    # 350 ₽/час × 8 ч = 2800 ₽ за смену
    assert me["shiftsDone"] == 1
    assert me["earnedRub"] == 2800


def test_employer_trust_aggregates_in_feed(client):
    # Закрытая смена + 5★ отзыв соискателя → в ленте у вакансии этого
    # заведения видны рейтинг и счётчик смен. «Платит вовремя» ещё не выдаётся:
    # порог ≥3 закрытых смен не достигнут (знак не выдаётся «авансом»).
    emp_token, _, seeker_token, _, vac, match_id = _full_shift_cycle(client)
    client.post(f"/matches/{match_id}/review", headers=_hdr(seeker_token),
                json={"stars": 5})

    feed = client.get("/vacancies", headers=_hdr(seeker_token)).json()
    v = next(x for x in feed if x["id"] == vac["id"])
    assert v["employer_shifts_done"] == 1
    assert v["employer_rating"] == 5.0
    assert v["employer_pays_on_time"] is False


def test_availability_toggle(client):
    seeker_token, _ = _auth(client, "seeker")
    assert client.get("/me", headers=_hdr(seeker_token)).json()[
        "availableToday"] is False
    r = client.post("/me/available", headers=_hdr(seeker_token),
                    json={"available": True})
    assert r.status_code == 200
    assert r.json()["availableToday"] is True
    assert client.get("/me", headers=_hdr(seeker_token)).json()[
        "availableToday"] is True


def test_availability_employer_forbidden(client):
    emp_token, _ = _auth(client, "employer")
    r = client.post("/me/available", headers=_hdr(emp_token),
                    json={"available": True})
    assert r.status_code == 403


def test_activity_feed_shape(client):
    seeker_token, _ = _auth(client, "seeker")
    r = client.get("/activity/recent", headers=_hdr(seeker_token))
    assert r.status_code == 200
    body = r.json()
    assert "items" in body and isinstance(body["items"], list)
    # Соискатель существует → «ищут сейчас» не ноль (fallback на число юзеров).
    assert body["searching_now"] >= 1


def test_activity_shows_closed_shift(client):
    _, _, seeker_token, _, _, _ = _full_shift_cycle(client)
    body = client.get("/activity/recent", headers=_hdr(seeker_token)).json()
    assert any(it["kind"] == "closed" for it in body["items"])


def test_favorites_add_list_remove(client):
    emp_token, _ = _auth(client, "employer")
    vac = _make_vacancy(client, emp_token)
    seeker_token, _ = _auth(client, "seeker")

    def ids():
        return client.get("/favorites/ids", headers=_hdr(seeker_token)).json()

    assert ids() == []
    r = client.post(f"/favorites/{vac['id']}", headers=_hdr(seeker_token))
    assert r.status_code == 200
    assert ids() == [vac["id"]]
    lst = client.get("/favorites", headers=_hdr(seeker_token)).json()
    assert len(lst) == 1 and lst[0]["id"] == vac["id"]

    client.delete(f"/favorites/{vac['id']}", headers=_hdr(seeker_token))
    assert ids() == []


def test_favorite_unknown_vacancy_404(client):
    seeker_token, _ = _auth(client, "seeker")
    r = client.post("/favorites/nope", headers=_hdr(seeker_token))
    assert r.status_code == 404


def _verify_status(client, token):
    return client.get("/me", headers=_hdr(token)).json()["verifyStatus"]


def test_worker_verification_flow(client):
    seeker_token, sid = _auth(client, "seeker")
    assert _verify_status(client, seeker_token) == "none"
    r = client.post("/me/verify-doc", headers=_hdr(seeker_token),
                    json={"photo_url": "https://example.com/med.jpg"})
    assert r.status_code == 200 and r.json()["verifyStatus"] == "pending"
    assert _verify_status(client, seeker_token) == "pending"
    # админ подтверждает (tg_id=0 — админ в тестах)
    adm = client.post(f"/admin/users/{sid}/verify", headers=_hdr(seeker_token))
    assert adm.status_code == 200
    assert _verify_status(client, seeker_token) == "verified"


def test_verify_doc_employer_forbidden(client):
    emp_token, _ = _auth(client, "employer")
    r = client.post("/me/verify-doc", headers=_hdr(emp_token),
                    json={"photo_url": "x"})
    assert r.status_code == 403


def test_digest_and_reminders_logic(client):
    from datetime import UTC, datetime

    from app import digest
    from app.db import SessionLocal

    emp_token, _ = _auth(client, "employer")
    today = datetime.now(UTC).date().isoformat()
    # активная смена на сегодня в Москве
    vac = client.post("/vacancies", headers=_hdr(emp_token), json={
        "role": "barista", "date": today, "start_time": 600, "end_time": 1080,
        "rate": 350, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61, "address": "Тверская, 1",
    }).json()

    seeker_token, sid = _auth(client, "seeker")
    client.put("/me", headers=_hdr(seeker_token), json={
        "birth_date": "2000-01-01", "city": "Москва"})

    db = SessionLocal()
    try:
        # дайджест: соискателю в Москве предлагается свежая смена
        d = digest.build_digest(db)
        assert sid in d and len(d[sid]) >= 1
        assert digest.send_digest(db) >= 1  # no-op без токена, но без ошибок

        # доводим до подтверждённой смены и проверяем напоминание на сегодня
        client.post("/swipes", headers=_hdr(emp_token), json={
            "target_id": sid, "target_type": "user", "direction": "like"})
        sw = client.post("/swipes", headers=_hdr(seeker_token), json={
            "target_id": vac["id"], "target_type": "vacancy",
            "direction": "like"}).json()
        mid = sw["match_id"]
        client.post(f"/matches/{mid}/confirm", headers=_hdr(seeker_token))
        client.post(f"/matches/{mid}/confirm", headers=_hdr(emp_token))

        reminders = digest.build_reminders(db)
        assert any(uid == sid for uid, _ in reminders)
        assert digest.send_reminders(db) >= 1
    finally:
        db.close()
