"""Тесты рефералов, отзывов и /me."""


def _auth(client, role="seeker", start_param=""):
    r = client.post(
        "/auth/telegram",
        json={"init_data": "", "role": role, "start_param": start_param},
    )
    return r.json()["access_token"], r.json()["user_id"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


def test_me_endpoint(client):
    token, uid = _auth(client, "seeker")
    r = client.get("/me", headers=_hdr(token))
    assert r.status_code == 200
    assert r.json()["id"] == uid
    assert r.json()["role"] == "seeker"


def test_update_me_persists_and_enforces_age(client):
    token, _ = _auth(client, "seeker")
    # Несовершеннолетний → 422 (серверная проверка 18+).
    minor = client.put("/me", headers=_hdr(token),
                       json={"name": "Юный", "birth_date": "2015-01-01"})
    assert minor.status_code == 422

    # Корректное обновление сохраняется.
    ok = client.put("/me", headers=_hdr(token), json={
        "name": "Алексей", "birth_date": "2000-04-12", "city": "Москва",
        "roles": ["barista", "waiter"], "med_book": "yes", "self_employed": True,
    })
    assert ok.status_code == 200
    assert ok.json()["name"] == "Алексей"
    assert client.get("/me", headers=_hdr(token)).json()["name"] == "Алексей"


def test_referral_link_and_bonus(client):
    # insecure-логины дают tg_id=0; разные роли → разные owner_id.
    # Реферер-ЗАВЕДЕНИЕ получает Boost вакансии (не супер-лайки).
    ref_token, ref_id = _auth(client, "employer")

    link = client.get("/referral/me", headers=_hdr(ref_token)).json()
    assert link["code"] == f"ref_{ref_id}"
    assert f"ref_{ref_id}" in link["link"]

    before = client.get("/billing/entitlements", headers=_hdr(ref_token)).json()
    # Новый соискатель приходит по реф-ссылке работодателя.
    _auth(client, "seeker", start_param=f"ref_{ref_id}")
    after = client.get("/billing/entitlements", headers=_hdr(ref_token)).json()
    assert after["boostBalance"] == before["boostBalance"] + 1
    assert after["superlikeBalance"] == before["superlikeBalance"]
    assert client.get("/referral/me", headers=_hdr(ref_token)).json()["invited"] == 1


def test_referral_worker_gets_superlikes(client):
    # Реферер-РАБОТНИК получает супер-лайки «Срочно» (его валюта).
    ref_token, ref_id = _auth(client, "seeker")
    before = client.get("/billing/entitlements", headers=_hdr(ref_token)).json()
    # Приглашённый — заведение (разные роли → разные аккаунты в dev-режиме).
    _auth(client, "employer", start_param=f"ref_{ref_id}")
    after = client.get("/billing/entitlements", headers=_hdr(ref_token)).json()
    assert after["superlikeBalance"] == before["superlikeBalance"] + 3
    assert after["boostBalance"] == before["boostBalance"]


def test_review_updates_rating(client):
    # Полный цикл до подтверждённой смены, затем отзыв соискателя о работодателе.
    emp_token, emp_id = _auth(client, "employer")
    vac = client.post("/vacancies", headers=_hdr(emp_token), json={
        "role": "barista", "date": "2026-06-20", "start_time": 600,
        "end_time": 1080, "rate": 350, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Тест",
    }).json()

    seeker_token, seeker_id = _auth(client, "seeker")
    # взаимные лайки → мэтч
    client.post("/swipes", headers=_hdr(emp_token), json={
        "target_id": seeker_id, "target_type": "user", "direction": "like",
    })
    sw = client.post("/swipes", headers=_hdr(seeker_token), json={
        "target_id": vac["id"], "target_type": "vacancy", "direction": "like",
    }).json()
    match_id = sw["match_id"]
    # подтверждение обеими сторонами
    client.post(f"/matches/{match_id}/confirm", headers=_hdr(seeker_token))
    client.post(f"/matches/{match_id}/confirm", headers=_hdr(emp_token))

    r = client.post(f"/matches/{match_id}/review", headers=_hdr(seeker_token),
                    json={"stars": 5, "text": "Отлично!"})
    assert r.status_code == 200
    assert r.json()["rateeRating"] == 5.0

    # повторный отзыв того же автора — 409
    again = client.post(f"/matches/{match_id}/review", headers=_hdr(seeker_token),
                        json={"stars": 4})
    assert again.status_code == 409
