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
