"""Тесты аналитики, вебхука ЮKassa и DaData-degradation."""

INTERNAL = {"X-Internal-Token": "test-internal-secret"}


def _auth(client, role="seeker"):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role})
    return r.json()["access_token"], r.json()["user_id"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def test_events_and_funnel(client):
    token, _ = _auth(client)
    # Событие без авторизации тоже принимается.
    assert client.post("/events", json={"name": "open"}).status_code == 200
    assert client.post(
        "/events", json={"name": "swipe", "props": {"dir": "like"}},
        headers=_hdr(token),
    ).status_code == 200

    f = client.get("/analytics/funnel", headers=_hdr(token)).json()["counts"]
    assert f["open"] == 1
    assert f["swipe"] == 1
    assert f["purchase"] == 0


def test_funnel_forbidden_for_non_admin(client):
    # Пользователь по телефону (tg_id=None) не админ → 403.
    code = client.post("/auth/request-code", json={"phone": "+79990001234"}).json()[
        "dev_code"
    ]
    token = client.post(
        "/auth/verify", json={"phone": "+79990001234", "code": code, "role": "seeker"}
    ).json()["access_token"]
    r = client.get("/analytics/funnel", headers=_hdr(token))
    assert r.status_code == 403


def test_yookassa_webhook_grants_plan(client):
    token, owner = _auth(client, "employer")
    payload = {
        "event": "payment.succeeded",
        "object": {
            "id": "yk-evt-1",
            "metadata": {"owner_id": owner, "sku": "sub_pro_month"},
        },
    }
    # Без секрета — 401.
    assert client.post("/billing/yookassa/webhook", json=payload).status_code == 401
    # С секретом — начисление тарифа.
    ok = client.post(
        "/billing/yookassa/webhook?secret=test-internal-secret", json=payload
    )
    assert ok.status_code == 200
    ent = client.get("/billing/entitlements", headers=_hdr(token)).json()
    assert ent["plan"] == "pro"

    # Идемпотентность по charge_id.
    client.post(
        "/billing/yookassa/webhook?secret=test-internal-secret", json=payload
    )
    boost = client.get("/billing/entitlements", headers=_hdr(token)).json()[
        "boostBalance"
    ]
    assert boost == ent["boostBalance"]  # не удвоилось


def test_employer_verify_without_dadata(client):
    token, _ = _auth(client, "employer")
    r = client.post("/employer/verify", headers=_hdr(token), json={"inn": "7707083893"})
    assert r.status_code == 200
    body = r.json()
    # Без DADATA_TOKEN — не найдено, бейдж не выдан.
    assert body["found"] is False
    assert body["verified"] is False
    assert body["hint"]

    # Соискатель не может верифицировать компанию.
    s_token, _ = _auth(client, "seeker")
    forbidden = client.post(
        "/employer/verify", headers=_hdr(s_token), json={"inn": "7707083893"}
    )
    assert forbidden.status_code == 403


def test_dadata_without_token_is_empty(client):
    token, _ = _auth(client)
    # Без DADATA_TOKEN — graceful: пустой список / found=false.
    addr = client.get("/dadata/address?q=Москва", headers=_hdr(token))
    assert addr.status_code == 200
    assert addr.json() == []
    party = client.get("/dadata/party?inn=7707083893", headers=_hdr(token))
    assert party.status_code == 200
    assert party.json()["found"] is False
