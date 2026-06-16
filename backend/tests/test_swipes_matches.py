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
