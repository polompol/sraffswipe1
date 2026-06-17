"""Тесты Telegram-авторизации, прав и монетизации."""
import hashlib
import hmac
import time
from urllib.parse import urlencode

from app.telegram import validate_init_data

INTERNAL = {"X-Internal-Token": "test-internal-secret"}


def _signed_init_data(bot_token: str, user_json: str) -> str:
    # Свежий auth_date — иначе проверка возраста initData отвергнет подпись.
    pairs = {"auth_date": str(int(time.time())), "query_id": "AAA", "user": user_json}
    data_check = "\n".join(sorted(f"{k}={v}" for k, v in pairs.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    h = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    return urlencode({**pairs, "hash": h})


def test_validate_init_data_signature():
    token = "123:ABC"
    user = '{"id":42,"first_name":"Тест","username":"t"}'
    good = _signed_init_data(token, user)
    assert validate_init_data(good, token) is True
    assert validate_init_data(good + "x", token) is False
    assert validate_init_data(good, "wrong:token") is False
    assert validate_init_data("", token) is False

    # Просроченная (но корректно подписанная) initData отвергается — анти-replay.
    stale_pairs = {"auth_date": "1700000000", "query_id": "AAA", "user": user}
    dcs = "\n".join(sorted(f"{k}={v}" for k, v in stale_pairs.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    h = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
    stale = urlencode({**stale_pairs, "hash": h})
    assert validate_init_data(stale, token) is False


def test_telegram_login_creates_user_and_entitlements(client):
    # insecure-режим включён по умолчанию → пустой initData принимается в dev.
    r = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    assert r.status_code == 200
    token = r.json()["access_token"]

    ent = client.get(
        "/billing/entitlements", headers={"Authorization": f"Bearer {token}"}
    )
    assert ent.status_code == 200
    body = ent.json()
    assert body["plan"] == "free"
    assert body["superlikeBalance"] >= 1


def test_stars_invoice_and_fulfill(client):
    r = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    token = r.json()["access_token"]
    owner = r.json()["user_id"]
    headers = {"Authorization": f"Bearer {token}"}

    inv = client.post(
        "/billing/stars/invoice", json={"sku": "super_5"}, headers=headers
    )
    assert inv.status_code == 200
    assert "link" in inv.json()

    before = client.get("/billing/entitlements", headers=headers).json()[
        "superlikeBalance"
    ]
    # Имитация колбэка бота об успешной оплате Stars (с внутренним секретом).
    f = client.post("/billing/fulfill", headers=INTERNAL, json={
        "owner_id": owner, "sku": "super_5", "provider": "stars", "charge_id": "ch_1",
    })
    assert f.status_code == 200
    after = client.get("/billing/entitlements", headers=headers).json()[
        "superlikeBalance"
    ]
    assert after == before + 5

    # Идемпотентность: повторный колбэк с тем же charge_id не начисляет снова.
    client.post("/billing/fulfill", headers=INTERNAL, json={
        "owner_id": owner, "sku": "super_5", "provider": "stars", "charge_id": "ch_1",
    })
    again = client.get("/billing/entitlements", headers=headers).json()[
        "superlikeBalance"
    ]
    assert again == after


def test_yookassa_subscription_activates_plan(client):
    r = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    token = r.json()["access_token"]
    owner = r.json()["user_id"]
    headers = {"Authorization": f"Bearer {token}"}

    pay = client.post(
        "/billing/yookassa/payment", json={"sku": "sub_pro_month"}, headers=headers
    )
    assert pay.status_code == 200
    assert "url" in pay.json()

    client.post("/billing/fulfill", headers=INTERNAL, json={
        "owner_id": owner, "sku": "sub_pro_month", "provider": "yookassa",
        "charge_id": "yk_1",
    })
    ent = client.get("/billing/entitlements", headers=headers).json()
    assert ent["plan"] == "pro"
    assert ent["boostBalance"] >= 10


def test_fulfill_requires_internal_secret(client):
    r = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    owner = r.json()["user_id"]
    # Без секрета — 401 (нельзя начислить себе права).
    bad = client.post("/billing/fulfill", json={
        "owner_id": owner, "sku": "super_5", "provider": "stars", "charge_id": "x",
    })
    assert bad.status_code == 401
    wrong = client.post("/billing/fulfill", headers={"X-Internal-Token": "nope"},
                        json={"owner_id": owner, "sku": "super_5",
                              "provider": "stars", "charge_id": "x"})
    assert wrong.status_code == 401


def _new_vacancy(client, headers, role="barista"):
    payload = {
        "role": role, "date": "2026-06-20", "start_time": 600, "end_time": 1080,
        "rate": 350, "rate_type": "perHour", "lat": 55.75, "lng": 37.61,
        "address": "Тест",
    }
    return client.post("/vacancies", json=payload, headers=headers)


def test_free_plan_vacancy_limit(client):
    r = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert _new_vacancy(client, headers).status_code == 201
    # Вторая вакансия на Free — запрещена (402).
    assert _new_vacancy(client, headers).status_code == 402


def test_boost_moves_vacancy_to_top(client):
    r = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    token = r.json()["access_token"]
    owner = r.json()["user_id"]
    headers = {"Authorization": f"Bearer {token}"}
    # Pro-подписка снимает лимит и даёт boost-баланс.
    client.post("/billing/fulfill", headers=INTERNAL, json={
        "owner_id": owner, "sku": "sub_pro_month", "provider": "yookassa",
        "charge_id": "yk_b",
    })
    _new_vacancy(client, headers, role="waiter")
    second = _new_vacancy(client, headers, role="bartender").json()

    boost = client.post(f"/vacancies/{second['id']}/boost", headers=headers)
    assert boost.status_code == 200

    feed = client.get("/vacancies").json()
    assert feed[0]["id"] == second["id"]
    assert feed[0]["boosted"] is True


def test_superlike_consumes_balance(client):
    # Pro-работодатель публикует две вакансии — две разные цели супер-лайка.
    e = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    eh = {"Authorization": f"Bearer {e.json()['access_token']}"}
    client.post("/billing/fulfill", headers=INTERNAL, json={
        "owner_id": e.json()["user_id"], "sku": "sub_pro_month",
        "provider": "yookassa", "charge_id": "yk_sl",
    })
    vac1 = _new_vacancy(client, eh, role="waiter").json()
    vac2 = _new_vacancy(client, eh, role="bartender").json()

    r = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    def sup(vid):
        return {"target_id": vid, "target_type": "vacancy", "direction": "superlike"}

    # Стартовый баланс = 1: первый супер-лайк проходит, второй (др. цель) — 402.
    assert client.post(
        "/swipes", json=sup(vac1["id"]), headers=headers
    ).status_code == 200
    assert client.post(
        "/swipes", json=sup(vac2["id"]), headers=headers
    ).status_code == 402


def test_act_pdf_requires_ownership(client):
    # Чужой/без токена → 401/403/404 (не 200).
    r = client.get("/matches/nonexistent/act.pdf")
    assert r.status_code == 401
    r2 = client.get("/matches/nonexistent/act.pdf?token=garbage")
    assert r2.status_code == 401
