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
            "amount": {"value": "1990.00", "currency": "RUB"},
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


def test_photo_upload_without_s3(client):
    token, _ = _auth(client)
    r = client.post(
        "/uploads/photo-url",
        headers=_hdr(token),
        json={"content_type": "image/jpeg"},
    )
    # Без ключей S3 — 503 (фронт мягко деградирует).
    assert r.status_code == 503


def test_dadata_without_token_is_empty(client):
    token, _ = _auth(client)
    # Без DADATA_TOKEN — graceful: пустой список / found=false.
    addr = client.get("/dadata/address?q=Москва", headers=_hdr(token))
    assert addr.status_code == 200
    assert addr.json() == []
    party = client.get("/dadata/party?inn=7707083893", headers=_hdr(token))
    assert party.status_code == 200
    assert party.json()["found"] is False


def test_production_safe_guard_rejects_default_secrets():
    """В прод-режиме дефолтные секреты должны ронять старт приложения."""
    from app.config import Settings

    unsafe = Settings(
        dev_mode=False,
        jwt_secret="dev-secret-change-me",
        internal_api_secret="",
    )
    try:
        unsafe.assert_production_safe()
        raised = False
    except RuntimeError:
        raised = True
    assert raised

    # Слишком короткий секрет тоже отклоняется (нужно ≥32 символов).
    short = Settings(
        dev_mode=False, jwt_secret="short", internal_api_secret="x",
    )
    try:
        short.assert_production_safe()
        short_raised = False
    except RuntimeError:
        short_raised = True
    assert short_raised

    safe = Settings(
        dev_mode=False,
        jwt_secret="a-real-secret-at-least-32-characters-long",
        internal_api_secret="another-secret",
        allow_insecure_telegram_auth=False,
    )
    safe.assert_production_safe()  # не бросает


def test_report_create_and_validation(client):
    """Жалоба создаётся; некорректная причина → 422; без токена → 401."""
    r = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    ok = client.post("/reports", headers=h, json={
        "target_type": "vacancy", "target_id": "vac1",
        "reason": "fake", "text": "Похоже на обман",
    })
    assert ok.status_code == 201 and ok.json()["ok"] is True
    bad = client.post("/reports", headers=h, json={
        "target_type": "vacancy", "target_id": "vac1", "reason": "nonsense",
    })
    assert bad.status_code == 422
    assert client.post("/reports", json={
        "target_type": "vacancy", "target_id": "x", "reason": "spam",
    }).status_code == 401


def test_admin_panel_gating_and_reports(client):
    # conftest задаёт ADMIN_TG_IDS=0, а insecure-логин даёт tg_id=0 → админ.
    r = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    admin_h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    # Создаём жалобу.
    client.post("/reports", headers=admin_h, json={
        "target_type": "vacancy", "target_id": "vac1", "reason": "fake",
    })
    # Обзор и список жалоб доступны админу.
    ov = client.get("/admin/overview", headers=admin_h)
    assert ov.status_code == 200 and ov.json()["openReports"] >= 1
    reps = client.get("/admin/reports", headers=admin_h).json()
    assert reps and reps[0]["status"] == "open"
    # Закрываем жалобу.
    rid = reps[0]["id"]
    res = client.post(f"/admin/reports/{rid}/resolve", headers=admin_h)
    assert res.status_code == 200
    assert client.get("/admin/reports?status=open", headers=admin_h).json() == []
    assert client.get("/admin/subscriptions", headers=admin_h).status_code == 200


def test_admin_endpoints_forbidden_for_non_admin(client):
    # Пользователь по телефону получает tg_id=None → не входит в ADMIN_TG_IDS.
    code = client.post("/auth/request-code", json={"phone": "+79990007777"}).json()[
        "dev_code"
    ]
    token = client.post(
        "/auth/verify", json={"phone": "+79990007777", "code": code, "role": "seeker"}
    ).json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    for path in ("/admin/overview", "/admin/reports", "/admin/subscriptions"):
        assert client.get(path, headers=h).status_code == 403, path
    assert client.post("/admin/reports/any/resolve", headers=h).status_code == 403
    # Совсем без токена — тоже закрыто.
    assert client.get("/admin/overview").status_code == 401


def test_admin_block_user_and_vacancy(client):
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    # Работодатель + вакансия.
    emp = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    eid = emp.json()["user_id"]
    eh = {"Authorization": f"Bearer {emp.json()['access_token']}"}
    vac = client.post("/vacancies", headers=eh, json={
        "role": "barista", "date": "2026-06-20", "start_time": 600,
        "end_time": 1080, "rate": 350, "city": "Москва",
    }).json()
    # Снять вакансию → исчезает из ленты.
    bv = client.post(f"/admin/vacancies/{vac['id']}/block", headers=ah)
    assert bv.status_code == 200
    feed_ids = {v["id"] for v in client.get("/vacancies").json()}
    assert vac["id"] not in feed_ids
    # Заблокировать работодателя → больше не может войти.
    assert client.post(f"/admin/users/{eid}/block", headers=ah).status_code == 200
    blocked_login = client.post(
        "/auth/telegram", json={"init_data": "", "role": "employer"}
    )
    assert blocked_login.status_code == 403


def test_blocked_user_denied_with_existing_token(client):
    # Бан должен действовать сразу по уже выданному токену, а не только при
    # следующем логине (иначе бан «мягкий» на 30 дней).
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    emp = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    eid = emp.json()["user_id"]
    eh = {"Authorization": f"Bearer {emp.json()['access_token']}"}
    # До бана работодатель действует.
    assert client.get("/me", headers=eh).status_code == 200
    client.post(f"/admin/users/{eid}/block", headers=ah)
    # После бана тот же токен получает 403 на любом защищённом эндпоинте.
    assert client.get("/me", headers=eh).status_code == 403
    assert client.post("/vacancies", headers=eh, json={
        "role": "barista", "date": "2026-06-20", "start_time": 600,
        "end_time": 1080, "rate": 350, "city": "Москва",
    }).status_code == 403


def test_admin_resolve_with_reply(client):
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    client.post("/reports", headers=ah, json={
        "target_type": "vacancy", "target_id": "vacX", "reason": "fake",
    })
    rid = client.get("/admin/reports", headers=ah).json()[0]["id"]
    # Закрытие с ответом заявителю — без бота notify no-op, но эндпоинт 200.
    res = client.post(
        f"/admin/reports/{rid}/resolve", headers=ah,
        json={"reply": "Проверили, спасибо"},
    )
    assert res.status_code == 200
    assert client.get("/admin/reports?status=open", headers=ah).json() == []


def test_admin_warn_increments_and_closes(client):
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    emp = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    eid = emp.json()["user_id"]
    eh = {"Authorization": f"Bearer {emp.json()['access_token']}"}
    vac = client.post("/vacancies", headers=eh, json={
        "role": "barista", "date": "2026-06-20", "start_time": 600,
        "end_time": 1080, "rate": 350, "city": "Москва",
    }).json()
    client.post("/reports", headers=ah, json={
        "target_type": "vacancy", "target_id": vac["id"], "reason": "spam",
    })
    rid = next(
        r["id"] for r in client.get("/admin/reports", headers=ah).json()
        if r["targetId"] == vac["id"]
    )
    # Предупреждение владельцу вакансии: +1 и жалоба закрыта.
    w = client.post(f"/admin/reports/{rid}/warn", headers=ah, json={"note": "спам"})
    assert w.status_code == 200 and w.json()["warnings"] == 1
    # Повторное предупреждение по другой жалобе на того же → 2.
    client.post("/reports", headers=ah, json={
        "target_type": "vacancy", "target_id": vac["id"], "reason": "spam",
    })
    rid2 = next(
        r["id"] for r in client.get("/admin/reports?status=open", headers=ah).json()
        if r["targetId"] == vac["id"]
    )
    w2 = client.post(f"/admin/reports/{rid2}/warn", headers=ah)
    assert w2.json()["warnings"] == 2
    assert eid  # владелец существует


def test_admin_warn_on_match_rejected(client):
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    client.post("/reports", headers=ah, json={
        "target_type": "match", "target_id": "m1", "reason": "abuse",
    })
    rid = client.get("/admin/reports", headers=ah).json()[0]["id"]
    # По переписке мэтча предупреждение выносить некому → 400.
    assert client.post(f"/admin/reports/{rid}/warn", headers=ah).status_code == 400


def test_admin_search_and_grant(client):
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    emp = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    eid = emp.json()["user_id"]
    # Поиск находит заведение среди пользователей.
    users = client.get("/admin/users", headers=ah).json()
    assert any(u["id"] == eid and u["role"] == "employer" for u in users)
    # Бесплатная выдача буста — баланс растёт.
    g = client.post("/admin/grant", headers=ah,
                    json={"owner_id": eid, "sku": "boost_24h"})
    assert g.status_code == 200
    by_id = {u["id"]: u for u in client.get("/admin/users", headers=ah).json()}
    assert by_id[eid]["boostBalance"] == 1
    # Выдача подписки → план обновился.
    client.post("/admin/grant", headers=ah,
                json={"owner_id": eid, "sku": "sub_pro_month"})
    by_id = {u["id"]: u for u in client.get("/admin/users", headers=ah).json()}
    assert by_id[eid]["plan"] == "pro"
    # Неизвестный SKU → 400.
    assert client.post(
        "/admin/grant", headers=ah, json={"owner_id": eid, "sku": "nope"}
    ).status_code == 400


def test_admin_users_forbidden_for_non_admin(client):
    code = client.post("/auth/request-code", json={"phone": "+79990008888"}).json()[
        "dev_code"
    ]
    token = client.post(
        "/auth/verify", json={"phone": "+79990008888", "code": code, "role": "seeker"}
    ).json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    assert client.get("/admin/users", headers=h).status_code == 403
    assert client.post(
        "/admin/grant", headers=h, json={"owner_id": "x", "sku": "boost_24h"}
    ).status_code == 403


def test_autoflag_scam_vacancy(client):
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    emp = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    eh = {"Authorization": f"Bearer {emp.json()['access_token']}"}
    client.post("/vacancies", headers=eh, json={
        "role": "barista", "date": "2026-06-20", "start_time": 600,
        "end_time": 1080, "rate": 350, "city": "Москва",
        "description": "Срочно! Внеси предоплату за форму и выходи на смену.",
    })
    reps = client.get("/admin/reports", headers=ah).json()
    assert any(r["reason"] == "scam" and "Авто-флаг" in r["text"] for r in reps)


def test_admin_unblock(client):
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    # Блокируем работодателя (отдельная сущность от админа-соискателя, чтобы
    # админ не «забанил сам себя» — теперь бан действует на каждом запросе).
    e = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    sid = e.json()["user_id"]
    client.post(f"/admin/users/{sid}/block", headers=ah)
    blocked = client.get("/admin/blocked", headers=ah).json()
    assert any(b["id"] == sid for b in blocked)
    assert client.post(f"/admin/users/{sid}/unblock", headers=ah).status_code == 200
    blocked2 = client.get("/admin/blocked", headers=ah).json()
    assert all(b["id"] != sid for b in blocked2)


def test_admin_cancel_subscription_and_purchases(client):
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    emp = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    eh = {"Authorization": f"Bearer {emp.json()['access_token']}"}
    owner = emp.json()["user_id"]
    # Оплата Pro через вебхук → подписка активна.
    client.post("/billing/yookassa/webhook?secret=test-internal-secret", json={
        "event": "payment.succeeded",
        "object": {
            "id": "ref-1",
            "amount": {"value": "1990.00", "currency": "RUB"},
            "metadata": {"owner_id": owner, "sku": "sub_pro_month"},
        },
    })
    assert client.get("/billing/entitlements", headers=eh).json()["plan"] == "pro"
    # Платёж виден в журнале админа.
    purch = client.get("/admin/purchases", headers=ah).json()
    assert any(p["ownerId"] == owner and p["status"] == "paid" for p in purch)
    # Возврат: отменяем подписку → доступ падает на free.
    cancel = client.post(f"/admin/subscriptions/{owner}/cancel", headers=ah)
    assert cancel.status_code == 200
    assert client.get("/billing/entitlements", headers=eh).json()["plan"] == "free"


def test_admin_revenue(client):
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    emp = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    owner = emp.json()["user_id"]
    client.post("/billing/yookassa/webhook?secret=test-internal-secret", json={
        "event": "payment.succeeded",
        "object": {
            "id": "rev-1",
            "amount": {"value": "1990.00", "currency": "RUB"},
            "metadata": {"owner_id": owner, "sku": "sub_pro_month"},
        },
    })
    rev = client.get("/admin/revenue", headers=ah).json()
    assert rev["activePro"] == 1
    assert rev["estMonthlyRub"] == 1990
    assert rev["totalPaidRub"] == 1990


def test_cancel_subscription_revokes_verification_badge(client):
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    emp = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    owner = emp.json()["user_id"]
    eh = {"Authorization": f"Bearer {emp.json()['access_token']}"}
    # Покупка верификации → бейдж выдан.
    client.post("/billing/fulfill", headers=INTERNAL, json={
        "owner_id": owner, "sku": "verify_year", "provider": "yookassa",
        "charge_id": "vrf-1",
    })
    assert client.get("/billing/entitlements", headers=eh).json()["employerVerified"]
    # Отмена (после возврата) снимает и бейдж.
    client.post("/billing/fulfill", headers=INTERNAL, json={
        "owner_id": owner, "sku": "sub_pro_month", "provider": "yookassa",
        "charge_id": "vrf-2",
    })
    client.post(f"/admin/subscriptions/{owner}/cancel", headers=ah)
    ent = client.get("/billing/entitlements", headers=eh).json()
    assert ent["employerVerified"] is False
