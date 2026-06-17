"""Тесты ленты кандидатов, расхода супер-лайков и доступа к подтверждению."""


def _auth(client, role="seeker"):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role})
    return r.json()["access_token"], r.json()["user_id"]


def _auth_phone(client, phone, role="seeker"):
    code = client.post("/auth/request-code", json={"phone": phone}).json()["dev_code"]
    r = client.post("/auth/verify", json={"phone": phone, "code": code, "role": role})
    return r.json()["access_token"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def _superlike_balance(client, token):
    return client.get("/billing/entitlements", headers=_hdr(token)).json()[
        "superlikeBalance"
    ]


def _vacancy(client, headers):
    return client.post("/vacancies", headers=headers, json={
        "role": "barista", "date": "2026-06-20", "start_time": 600,
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
        "role": "dishwasher", "date": "2026-06-20", "start_time": 600,
        "end_time": 1080, "rate": 250, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "A"}).json()
    pricey = client.post("/vacancies", headers=eh, json={
        "role": "barista", "date": "2026-06-25", "start_time": 600,
        "end_time": 1080, "rate": 500, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "B"}).json()

    by_role = client.get("/vacancies?role=barista").json()
    assert {v["id"] for v in by_role} == {pricey["id"]}

    by_rate = client.get("/vacancies?min_rate=400").json()
    assert cheap["id"] not in {v["id"] for v in by_rate}

    by_date = client.get("/vacancies?date_from=2026-06-23").json()
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


def test_superlike_not_consumed_on_missing_target(client):
    token, _ = _auth(client, "seeker")
    before = _superlike_balance(client, token)
    # Несуществующая вакансия → 404, баланс НЕ списан.
    r = client.post("/swipes", headers=_hdr(token), json={
        "target_id": "no-such", "target_type": "vacancy", "direction": "superlike",
    })
    assert r.status_code == 404
    assert _superlike_balance(client, token) == before


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


def test_superlike_not_double_charged_on_repeat(client):
    e_token, _ = _auth(client, "employer")
    vac = _vacancy(client, _hdr(e_token))
    token, _ = _auth(client, "seeker")
    before = _superlike_balance(client, token)
    body = {"target_id": vac["id"], "target_type": "vacancy", "direction": "superlike"}
    client.post("/swipes", headers=_hdr(token), json=body)
    after_first = _superlike_balance(client, token)
    assert after_first == before - 1
    # Повторный свайп по той же цели не списывает баланс ещё раз.
    client.post("/swipes", headers=_hdr(token), json=body)
    assert _superlike_balance(client, token) == after_first


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
        "role": "barista", "date": "2026-06-20", "start_time": 600,
        "end_time": 1080, "rate": 350, "city": "Москва", "address": "A"}).json()
    kzn = client.post("/vacancies", headers=eh, json={
        "role": "waiter", "date": "2026-06-20", "start_time": 600,
        "end_time": 1080, "rate": 350, "city": "Казань", "address": "B"}).json()

    # Регистронезависимый фильтр по городу (кириллица).
    msk_feed = client.get("/vacancies?city=москва").json()
    ids = {v["id"] for v in msk_feed}
    assert msk["id"] in ids and kzn["id"] not in ids
    # Без фильтра — обе.
    all_ids = {v["id"] for v in client.get("/vacancies").json()}
    assert {msk["id"], kzn["id"]} <= all_ids
