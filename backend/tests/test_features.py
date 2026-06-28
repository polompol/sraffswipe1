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
