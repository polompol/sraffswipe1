"""Тесты Telegram-авторизации, прав и монетизации."""
import hashlib
import hmac
import time
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from app.telegram import validate_init_data


def _d(days: int) -> str:
    """Дата смены относительно сегодня: захардкоженные даты со временем
    протухают и вылетают из ленты (прошедшие смены не показываются)."""
    return (datetime.now(UTC) + timedelta(days=days)).strftime("%Y-%m-%d")

SOON = _d(3)
SOON_1 = _d(4)
SOON_2 = _d(5)
SOON_5 = _d(8)




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
    # Внутренних «валют» (супер-лайки, бусты) больше нет — только план и флаги.
    assert "superlikeBalance" not in body and "boostBalance" not in body


def test_yookassa_webhook_verifies_amount(client):
    """Единственный платёж — пополнение баланса. Сумма сверяется с metadata,
    иначе утечка секрета вебхука позволяла бы рисовать баланс из воздуха."""
    r = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    owner = r.json()["user_id"]
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    secret = "test-internal-secret"  # = internal_api_secret в conftest

    def hook(charge_id, value, declared=1000):
        return client.post(
            f"/billing/yookassa/webhook?secret={secret}",
            json={
                "event": "payment.succeeded",
                "object": {
                    "id": charge_id,
                    "amount": {"value": value, "currency": "RUB"},
                    "metadata": {
                        "owner_id": owner, "sku": "wallet_topup",
                        "amount_rub": str(declared),
                    },
                },
            },
        )

    def balance():
        return client.get("/billing/commission", headers=headers).json()["balanceRub"]

    # Заплатили 1 ₽, а в metadata просят зачислить 1000 — отклоняем.
    assert hook("yk_bad", "1.00").status_code == 400
    assert balance() == 0

    # Совпало — зачисляем.
    assert hook("yk_ok", "1000.00").status_code == 200
    assert balance() == 1000

    # Повтор того же платежа не удваивает баланс.
    assert hook("yk_ok", "1000.00").json().get("duplicate") is True
    assert balance() == 1000

    # Сумма вне лимита — отклоняем (защита от неограниченной эмиссии).
    assert hook("yk_huge", "999999.00", declared=999999).status_code == 400

    # Неверный секрет — 401.
    no = client.post(
        "/billing/yookassa/webhook?secret=wrong",
        json={"event": "payment.succeeded", "object": {}},
    )
    assert no.status_code == 401


def _new_vacancy(client, headers, role="barista"):
    payload = {
        "role": role, "date": SOON, "start_time": 600, "end_time": 1080,
        "rate": 350, "rate_type": "perHour", "lat": 55.75, "lng": 37.61,
        "address": "Тест",
    }
    return client.post("/vacancies", json=payload, headers=headers)


def test_vacancy_publishing_is_unlimited(client):
    r = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    # Модель — комиссия, а не подписка: публиковать смены можно без лимита
    # (чем больше смен, тем больше потенциальной комиссии). 6+ вакансий проходят.
    for _ in range(6):
        assert _new_vacancy(client, headers).status_code == 201


def test_feed_order_is_not_for_sale(client):
    """Место в ленте не продаётся: порядок задаёт только сортировка.

    Раньше вакансию можно было поднять в топ за буст. Теперь такой ручки нет
    вовсе — проверяем, что она не отвечает.
    """
    r = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    _new_vacancy(client, headers, role="waiter")
    second = _new_vacancy(client, headers, role="bartender").json()

    assert client.post(
        f"/vacancies/{second['id']}/boost", headers=headers
    ).status_code == 404
    assert "boosted" not in client.get("/vacancies").json()[0]


def test_superlike_is_rejected(client):
    """Супер-лайка «Срочно» больше нет: сервер принимает только like/dislike."""
    e = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    eh = {"Authorization": f"Bearer {e.json()['access_token']}"}
    vac = _new_vacancy(client, eh, role="waiter").json()

    r = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.post("/swipes", headers=headers, json={
        "target_id": vac["id"], "target_type": "vacancy",
        "direction": "superlike",
    }).status_code == 422


def test_act_pdf_requires_ownership(client):
    # Чужой/без токена → 401/403/404 (не 200).
    r = client.get("/matches/nonexistent/act.pdf")
    assert r.status_code == 401
    r2 = client.get("/matches/nonexistent/act.pdf?token=garbage")
    assert r2.status_code == 401


def test_yookassa_receipt_payload_gated_by_config():
    """Чек 54-ФЗ добавляется в платёж только при включённом флаге и наличии email."""
    from app.config import settings
    from app.routers.billing import _yk_payload

    # По умолчанию (флаг выключен) — чека нет.
    base = _yk_payload("owner1", "wallet_topup", 1990, "a@b.ru", "Пополнение")
    assert "receipt" not in base
    assert base["amount"] == {"value": "1990.00", "currency": "RUB"}
    assert base["metadata"] == {"owner_id": "owner1", "sku": "wallet_topup"}

    # Включаем фискализацию.
    settings.yookassa_send_receipt = True
    try:
        with_email = _yk_payload("owner1", "wallet_topup", 1990, "a@b.ru", "Пополнение")
        assert with_email["receipt"]["customer"]["email"] == "a@b.ru"
        assert with_email["receipt"]["items"][0]["amount"]["value"] == "1990.00"
        # Без email чек не формируем (нет контакта для чека).
        no_email = _yk_payload("owner1", "wallet_topup", 1990, None, "Пополнение")
        assert "receipt" not in no_email
    finally:
        settings.yookassa_send_receipt = False
