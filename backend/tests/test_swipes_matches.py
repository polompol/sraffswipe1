"""Тесты ленты кандидатов, расхода супер-лайков и доступа к подтверждению."""

from datetime import UTC, datetime, timedelta


def _d(days: int) -> str:
    """Дата смены относительно сегодня: захардкоженные даты со временем
    протухают и вылетают из ленты (прошедшие смены не показываются)."""
    return (datetime.now(UTC) + timedelta(days=days)).strftime("%Y-%m-%d")

SOON = _d(3)
SOON_1 = _d(4)
SOON_2 = _d(5)
SOON_5 = _d(8)



def _auth(client, role="seeker"):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role})
    return r.json()["access_token"], r.json()["user_id"]


def _auth_phone(client, phone, role="seeker"):
    code = client.post("/auth/request-code", json={"phone": phone}).json()["dev_code"]
    r = client.post("/auth/verify", json={"phone": phone, "code": code, "role": role})
    return r.json()["access_token"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def _swipe_count(swiper_id):
    from app.db import SessionLocal
    from app.models import Swipe

    db = SessionLocal()
    try:
        return db.query(Swipe).filter(Swipe.swiper_id == swiper_id).count()
    finally:
        db.close()


def _vacancy(client, headers):
    return client.post("/vacancies", headers=headers, json={
        "role": "barista", "date": SOON, "start_time": 600,
        "end_time": 1080, "rate": 350, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Тест",
    }).json()


def test_vacancy_filters(client):
    e_token, owner = _auth(client, "employer")
    eh = _hdr(e_token)
    # Pro снимает лимит Free на число вакансий.
    client.post("/billing/fulfill",
                headers={"X-Internal-Token": "test-internal-secret"},
                json={"owner_id": owner, "sku": "sub_pro_month",
                      "provider": "yookassa", "charge_id": "f1"})
    cheap = client.post("/vacancies", headers=eh, json={
        "role": "dishwasher", "date": SOON, "start_time": 600,
        "end_time": 1080, "rate": 250, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "A"}).json()
    pricey = client.post("/vacancies", headers=eh, json={
        "role": "barista", "date": SOON_5, "start_time": 600,
        "end_time": 1080, "rate": 500, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "B"}).json()

    by_role = client.get("/vacancies?role=barista").json()
    assert {v["id"] for v in by_role} == {pricey["id"]}

    by_rate = client.get("/vacancies?min_rate=400").json()
    assert cheap["id"] not in {v["id"] for v in by_rate}

    by_date = client.get(f"/vacancies?date_from={_d(6)}").json()
    assert {v["id"] for v in by_date} == {pricey["id"]}

    # Сортировка по ставке (по убыванию) — дорогая выше.
    by_rate_sort = client.get("/vacancies?sort=rate").json()
    assert by_rate_sort[0]["id"] == pricey["id"]

    # Тип ставки и сортировка комбинируются.
    per_hour = client.get("/vacancies?rate_type=perHour&sort=rate").json()
    assert {v["id"] for v in per_hour} == {cheap["id"], pricey["id"]}


def test_candidates_lists_users(client):
    _s_token, s_id = _auth(client, "seeker")  # создаёт пользователя
    e_token, _ = _auth(client, "employer")
    r = client.get("/candidates", headers=_hdr(e_token))
    assert r.status_code == 200
    assert s_id in [c["id"] for c in r.json()]


def test_swipe_to_missing_target_is_404(client):
    """Свайп по несуществующей смене не записывается: 404 и пустая история."""
    token, sid = _auth(client, "seeker")
    r = client.post("/swipes", headers=_hdr(token), json={
        "target_id": "no-such", "target_type": "vacancy", "direction": "like",
    })
    assert r.status_code == 404
    assert _swipe_count(sid) == 0


def test_confirm_requires_participant(client):
    e_token, _ = _auth(client, "employer")
    vac = _vacancy(client, _hdr(e_token))
    s_token, s_id = _auth(client, "seeker")
    client.post("/swipes", headers=_hdr(e_token), json={
        "target_id": s_id, "target_type": "user", "direction": "like",
    })
    sw = client.post("/swipes", headers=_hdr(s_token), json={
        "target_id": vac["id"], "target_type": "vacancy", "direction": "like",
    }).json()
    match_id = sw["match_id"]

    # Посторонний соискатель (отдельный по телефону) не участник → 403.
    outsider = _auth_phone(client, "+79990000777", "seeker")
    forbidden = client.post(f"/matches/{match_id}/confirm", headers=_hdr(outsider))
    assert forbidden.status_code == 403

    # Участник подтверждает успешно.
    ok = client.post(f"/matches/{match_id}/confirm", headers=_hdr(s_token))
    assert ok.status_code == 200


def _make_match(client):
    e_token, _ = _auth(client, "employer")
    vac = _vacancy(client, _hdr(e_token))
    s_token, s_id = _auth(client, "seeker")
    client.post("/swipes", headers=_hdr(e_token), json={
        "target_id": s_id, "target_type": "user", "direction": "like",
    })
    sw = client.post("/swipes", headers=_hdr(s_token), json={
        "target_id": vac["id"], "target_type": "vacancy", "direction": "like",
    }).json()
    return sw["match_id"], s_token, e_token


def test_chat_history_and_send_require_participant(client):
    match_id, s_token, _ = _make_match(client)
    outsider = _auth_phone(client, "+79990000888", "seeker")
    # Чужой не читает историю и не пишет в чужой чат.
    assert client.get(
        f"/matches/{match_id}/messages", headers=_hdr(outsider)
    ).status_code == 403
    assert client.post(
        f"/matches/{match_id}/messages", headers=_hdr(outsider), json={"text": "hi"}
    ).status_code == 403
    # Участник — читает и пишет.
    assert client.get(
        f"/matches/{match_id}/messages", headers=_hdr(s_token)
    ).status_code == 200
    assert client.post(
        f"/matches/{match_id}/messages", headers=_hdr(s_token), json={"text": "hi"}
    ).status_code == 200


def test_act_blocked_until_confirmed(client):
    match_id, s_token, e_token = _make_match(client)
    # До подтверждения смены акт недоступен.
    assert client.get(
        f"/matches/{match_id}/act.pdf?token={s_token}"
    ).status_code == 409
    client.post(f"/matches/{match_id}/confirm", headers=_hdr(s_token))
    client.post(f"/matches/{match_id}/confirm", headers=_hdr(e_token))
    # После подтверждения — PDF отдаётся.
    assert client.get(
        f"/matches/{match_id}/act.pdf?token={s_token}"
    ).status_code == 200


def test_repeat_swipe_is_idempotent(client):
    """Двойной клик по той же смене не плодит вторую запись."""
    e_token, _ = _auth(client, "employer")
    vac = _vacancy(client, _hdr(e_token))
    token, sid = _auth(client, "seeker")
    body = {"target_id": vac["id"], "target_type": "vacancy", "direction": "like"}
    client.post("/swipes", headers=_hdr(token), json=body)
    assert _swipe_count(sid) == 1
    client.post("/swipes", headers=_hdr(token), json=body)
    assert _swipe_count(sid) == 1


def test_candidates_forbidden_for_seeker(client):
    s_token, _ = _auth(client, "seeker")
    assert client.get("/candidates", headers=_hdr(s_token)).status_code == 403


def test_input_validation_rejects_garbage(client):
    token, _ = _auth(client, "seeker")
    # Неизвестное направление свайпа → 422 (Literal).
    assert client.post("/swipes", headers=_hdr(token), json={
        "target_id": "x", "target_type": "vacancy", "direction": "love",
    }).status_code == 422
    # Неизвестный тип цели → 422.
    assert client.post("/swipes", headers=_hdr(token), json={
        "target_id": "x", "target_type": "planet", "direction": "like",
    }).status_code == 422


def test_feed_filters_by_city(client):
    e_token, owner = _auth(client, "employer")
    eh = _hdr(e_token)
    # Pro снимает лимит на число вакансий.
    client.post("/billing/fulfill",
                headers={"X-Internal-Token": "test-internal-secret"},
                json={"owner_id": owner, "sku": "sub_pro_month",
                      "provider": "yookassa", "charge_id": "city1"})
    msk = client.post("/vacancies", headers=eh, json={
        "role": "barista", "date": SOON, "start_time": 600,
        "end_time": 1080, "rate": 350, "city": "Москва", "address": "A"}).json()
    kzn = client.post("/vacancies", headers=eh, json={
        "role": "waiter", "date": SOON, "start_time": 600,
        "end_time": 1080, "rate": 350, "city": "Казань", "address": "B"}).json()

    # Регистронезависимый фильтр по городу (кириллица).
    msk_feed = client.get("/vacancies?city=москва").json()
    ids = {v["id"] for v in msk_feed}
    assert msk["id"] in ids and kzn["id"] not in ids
    # Без фильтра — обе.
    all_ids = {v["id"] for v in client.get("/vacancies").json()}
    assert {msk["id"], kzn["id"]} <= all_ids


def test_city_only_vacancy_visible_with_geo_search(client):
    # Вакансия без координат (только город) не должна выпадать из гео-поиска.
    e_token, owner = _auth(client, "employer")
    client.post("/billing/fulfill",
                headers={"X-Internal-Token": "test-internal-secret"},
                json={"owner_id": owner, "sku": "sub_pro_month",
                      "provider": "yookassa", "charge_id": "geo1"})
    v = client.post("/vacancies", headers=_hdr(e_token), json={
        "role": "florist", "date": SOON, "start_time": 600,
        "end_time": 1080, "rate": 400, "city": "Казань", "address": "Без точки",
    }).json()  # lat/lng = 0,0 по умолчанию
    feed = client.get("/vacancies?lat=55.75&lng=37.61&radius_km=10&city=Казань").json()
    assert v["id"] in {x["id"] for x in feed}


def test_candidates_pii_minimized(client):
    s_token, _ = _auth(client, "seeker")
    client.put("/me", headers=_hdr(s_token), json={
        "name": "Тест", "birth_date": "1998-09-03", "city": "Москва",
    })
    e_token, _ = _auth(client, "employer")
    cands = client.get("/candidates", headers=_hdr(e_token)).json()
    assert cands, "ожидаем хотя бы одного кандидата"
    for c in cands:
        # Точные координаты дома и дата рождения не раскрываются: в ленту
        # уходит только возраст числом.
        assert c["lat"] == 0 and c["lng"] == 0
        assert c["inn"] is None
        assert "birth_date" not in c
        assert c["age"] is None or 18 <= c["age"] <= 100
