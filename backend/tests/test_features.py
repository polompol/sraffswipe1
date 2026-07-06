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
    assert vac["tips"] == "none"  # чаевые по умолчанию выключены


def test_tips_roundtrips(client):
    emp_token, _ = _auth(client, "employer")
    vac = client.post("/vacancies", headers=_hdr(emp_token), json={
        "role": "waiter", "date": "2026-06-22", "start_time": 600,
        "end_time": 1080, "rate": 300, "rate_type": "perHour",
        "tips": "shared", "lat": 55.75, "lng": 37.61, "address": "Тест",
    }).json()
    assert vac["tips"] == "shared"
    # вторая смена — без чаевых
    client.post("/vacancies", headers=_hdr(emp_token), json={
        "role": "cook", "date": "2026-06-22", "start_time": 600,
        "end_time": 1080, "rate": 300, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Тест2",
    })
    seeker_token, _ = _auth(client, "seeker")
    feed = client.get("/vacancies", headers=_hdr(seeker_token)).json()
    assert any(v["tips"] == "shared" for v in feed)

    # фильтр «с чаевыми» оставляет только смены с чаевыми
    only = client.get(
        "/vacancies?tips_only=true", headers=_hdr(seeker_token)
    ).json()
    assert only and all(v["tips"] != "none" for v in only)


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
    emp_token, emp_id, seeker_token, _, vac, match_id = _full_shift_cycle(client)
    client.post(f"/matches/{match_id}/review", headers=_hdr(seeker_token),
                json={"stars": 5})

    # Первую смену соискатель уже свайпнул (её теперь нет в ленте — так и надо).
    # Даём заведению Pro (безлимит вакансий) и заводим вторую смену — на ней и
    # виден агрегат доверия заведения, которую соискатель ещё не листал.
    client.post("/billing/fulfill",
                headers={"X-Internal-Token": "test-internal-secret"},
                json={"owner_id": emp_id, "sku": "sub_pro_month",
                      "provider": "yookassa", "charge_id": "t1"})
    vac2 = _make_vacancy(client, emp_token)
    feed = client.get("/vacancies", headers=_hdr(seeker_token)).json()
    assert vac["id"] not in {x["id"] for x in feed}
    v = next(x for x in feed if x["id"] == vac2["id"])
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


def test_profile_completion_grows_as_fields_fill(client):
    # Свежий соискатель: заполнен только город (роль по умолчанию проставляется
    # при регистрации), потому анкета неполная.
    seeker_token, _ = _auth(client, "seeker")
    start = client.get("/me", headers=_hdr(seeker_token)).json()[
        "profileCompletion"]
    assert 0 <= start < 100
    # Дозаполняем ключевые поля — процент растёт до 100.
    client.put("/me", headers=_hdr(seeker_token), json={
        "birth_date": "2000-01-01", "city": "Москва",
        "roles": ["barista"], "photo_url": "https://x/p.jpg",
        "about": "Опыт 2 года",
    })
    full = client.get("/me", headers=_hdr(seeker_token)).json()[
        "profileCompletion"]
    assert full == 100
    assert full > start


def test_feed_excludes_already_swiped_vacancy(client):
    emp_token, _ = _auth(client, "employer")
    vac = _make_vacancy(client, emp_token)
    seeker_token, _ = _auth(client, "seeker")

    def feed_ids():
        return {v["id"] for v in
                client.get("/vacancies", headers=_hdr(seeker_token)).json()}

    assert vac["id"] in feed_ids()  # до свайпа — в ленте
    client.post("/swipes", headers=_hdr(seeker_token), json={
        "target_type": "vacancy", "target_id": vac["id"], "direction": "dislike",
    })
    assert vac["id"] not in feed_ids()  # после свайпа — исчезла (колода не зациклена)


def test_candidates_exclude_already_swiped(client):
    seeker_token, seeker_id = _auth(client, "seeker")
    emp_token, _ = _auth(client, "employer")
    ids = {c["id"] for c in client.get("/candidates", headers=_hdr(emp_token)).json()}
    assert seeker_id in ids  # кандидат виден работодателю
    client.post("/swipes", headers=_hdr(emp_token), json={
        "target_type": "user", "target_id": seeker_id, "direction": "dislike",
    })
    ids2 = {c["id"] for c in client.get("/candidates", headers=_hdr(emp_token)).json()}
    assert seeker_id not in ids2  # после свайпа кандидат уходит из колоды


def test_invites_shows_employers_who_liked_me(client):
    emp_token, _ = _auth(client, "employer")
    vac = _make_vacancy(client, emp_token)
    seeker_token, sid = _auth(client, "seeker")
    # Заведение лайкнуло соискателя → смена появляется в «Кто меня зовёт».
    client.post("/swipes", headers=_hdr(emp_token), json={
        "target_type": "user", "target_id": sid, "direction": "like",
    })
    inv = client.get("/vacancies/invites", headers=_hdr(seeker_token)).json()
    assert any(v["id"] == vac["id"] for v in inv)
    # Отклик соискателя на эту смену → мгновенный мэтч (лайк взаимный).
    sw = client.post("/swipes", headers=_hdr(seeker_token), json={
        "target_type": "vacancy", "target_id": vac["id"], "direction": "like",
    }).json()
    assert sw["matched"] is True
    # После свайпа смена уходит из приглашений.
    inv2 = client.get("/vacancies/invites", headers=_hdr(seeker_token)).json()
    assert all(v["id"] != vac["id"] for v in inv2)


def test_mutual_checkin_closes_only_when_both_confirm(client):
    emp_token, _, seeker_token, _, _, match_id = _full_shift_cycle(client)
    code = next(m for m in client.get("/matches", headers=_hdr(emp_token)).json()
                if m["id"] == match_id)["checkin_code"]
    assert code and len(code) == 6
    # Работник отметился (код) — но смена ещё НЕ закрыта, ждём заведение.
    r = client.post(f"/matches/{match_id}/checkin", headers=_hdr(seeker_token),
                    json={"code": code})
    assert r.status_code == 200
    assert r.json()["seeker_checked_in"] is True
    assert r.json()["status"] == "confirmed" and r.json()["checked_in"] is False
    # Заведение подтвердило «человек пришёл» → теперь обе стороны → completed.
    a = client.post(f"/matches/{match_id}/attendance", headers=_hdr(emp_token),
                    json={"attended": True})
    assert a.status_code == 200
    done = next(m for m in client.get("/matches", headers=_hdr(seeker_token)).json()
                if m["id"] == match_id)
    assert done["status"] == "completed" and done["checked_in"] is True


def test_checkin_geo_and_code_helpers(client):
    _, _, seeker_token, _, _, match_id = _full_shift_cycle(client)
    # Гео вдалеке — отказ; на месте — отметка проходит.
    assert client.post(f"/matches/{match_id}/checkin", headers=_hdr(seeker_token),
                       json={"lat": 55.0, "lng": 38.5}).status_code == 400
    r = client.post(f"/matches/{match_id}/checkin", headers=_hdr(seeker_token),
                    json={"lat": 55.75, "lng": 37.61})
    assert r.status_code == 200 and r.json()["seeker_checked_in"] is True


def test_commission_accrued_on_close(client):
    # Смена: бариста 350 ₽/час × 8ч = 2800 ₽ → комиссия 10% = 280 ₽.
    emp_token, _, seeker_token, _, _, match_id = _full_shift_cycle(client)
    code = next(m for m in client.get("/matches", headers=_hdr(emp_token)).json()
                if m["id"] == match_id)["checkin_code"]
    client.post(f"/matches/{match_id}/checkin", headers=_hdr(seeker_token),
                json={"code": code})
    client.post(f"/matches/{match_id}/attendance", headers=_hdr(emp_token),
                json={"attended": True})
    rows = client.get("/admin/commissions", headers=_hdr(emp_token)).json()
    assert rows and rows[0]["shifts"] == 1 and rows[0]["amountRub"] == 280
    # Отметили оплаченной → к счёту больше не висит.
    eid = rows[0]["employerId"]
    client.post(f"/admin/commissions/{eid}/settle", headers=_hdr(emp_token))
    assert client.get("/admin/commissions", headers=_hdr(emp_token)).json() == []


def test_traffic_source_attribution(client):
    # Регистрация по ссылке t.me/<bot>?startapp=src_<канал> фиксирует источник.
    r = client.post("/auth/telegram", json={
        "init_data": "", "role": "seeker", "start_param": "src_vk",
    })
    seeker_token = r.json()["access_token"]
    client.post("/auth/telegram", json={
        "init_data": "", "role": "employer", "start_param": "src_avito",
    })
    rows = client.get("/admin/sources", headers=_hdr(seeker_token)).json()
    by_src = {x["source"]: x for x in rows}
    assert by_src["vk"]["seekers"] == 1 and by_src["vk"]["employers"] == 0
    assert by_src["avito"]["employers"] == 1
    # Повторный вход того же пользователя не плодит событий (атрибуция 1 раз).
    client.post("/auth/telegram", json={
        "init_data": "", "role": "seeker", "start_param": "src_vk",
    })
    rows2 = client.get("/admin/sources", headers=_hdr(seeker_token)).json()
    assert {x["source"]: x for x in rows2}["vk"]["seekers"] == 1


def _close_shift(client, emp_token, seeker_token, match_id):
    """Взаимное подтверждение: работник по коду + заведение «пришёл»."""
    code = next(m for m in client.get("/matches", headers=_hdr(emp_token)).json()
                if m["id"] == match_id)["checkin_code"]
    client.post(f"/matches/{match_id}/checkin", headers=_hdr(seeker_token),
                json={"code": code})
    client.post(f"/matches/{match_id}/attendance", headers=_hdr(emp_token),
                json={"attended": True})


def test_employer_sees_own_commission_bill(client):
    emp_token, _, seeker_token, _, _, match_id = _full_shift_cycle(client)
    _close_shift(client, emp_token, seeker_token, match_id)
    bill = client.get("/billing/commission", headers=_hdr(emp_token)).json()
    # 2800 ₽ смена × 10% = 280 ₽; счёт свежий — просрочки нет.
    assert bill["pendingShifts"] == 1 and bill["pendingRub"] == 280
    assert bill["overdue"] is False and bill["pct"] == 10
    # Соискателю счёт заведения не отдаём.
    r = client.get("/billing/commission", headers=_hdr(seeker_token))
    assert r.status_code == 403


def test_wallet_autopays_commission(client):
    # Аванс на балансе → комиссия за закрытую смену списывается сама.
    emp_token, emp_id, seeker_token, _, _, match_id = _full_shift_cycle(client)
    r = client.post(f"/admin/wallet/{emp_id}/credit", headers=_hdr(emp_token),
                    json={"amount_rub": 1000, "note": "СБП тест"})
    assert r.status_code == 200 and r.json()["balanceRub"] == 1000
    _close_shift(client, emp_token, seeker_token, match_id)
    bill = client.get("/billing/commission", headers=_hdr(emp_token)).json()
    # Комиссия 280 ₽ списана с баланса: долга нет, баланс 720.
    assert bill["pendingRub"] == 0 and bill["balanceRub"] == 720
    # В счёт оператору ничего не попало.
    assert client.get("/admin/commissions", headers=_hdr(emp_token)).json() == []


def test_wallet_insufficient_falls_back_to_invoice(client):
    # Денег на балансе мало → баланс не трогаем, комиссия уходит в счёт.
    emp_token, emp_id, seeker_token, _, _, match_id = _full_shift_cycle(client)
    client.post(f"/admin/wallet/{emp_id}/credit", headers=_hdr(emp_token),
                json={"amount_rub": 100})
    _close_shift(client, emp_token, seeker_token, match_id)
    bill = client.get("/billing/commission", headers=_hdr(emp_token)).json()
    assert bill["pendingRub"] == 280 and bill["balanceRub"] == 100


def test_wallet_topup_webhook_idempotent(client):
    emp_token, emp_id = _auth(client, "employer")
    payload = {
        "event": "payment.succeeded",
        "object": {
            "id": "yk-topup-1",
            "amount": {"value": "500.00", "currency": "RUB"},
            "metadata": {
                "owner_id": emp_id, "sku": "wallet_topup", "amount_rub": "500",
            },
        },
    }
    for _ in range(2):  # повторная доставка вебхука не удваивает деньги
        r = client.post(
            "/billing/yookassa/webhook?secret=test-internal-secret", json=payload,
        )
        assert r.status_code == 200
    bill = client.get("/billing/commission", headers=_hdr(emp_token)).json()
    assert bill["balanceRub"] == 500
    # Подмена суммы (metadata 500, платёж 100) — отклоняется.
    bad = {**payload, "object": {**payload["object"], "id": "yk-topup-2",
           "amount": {"value": "100.00", "currency": "RUB"}}}
    assert client.post(
        "/billing/yookassa/webhook?secret=test-internal-secret", json=bad,
    ).status_code == 400


def test_overdue_commission_blocks_new_vacancies(client):
    from datetime import UTC, datetime, timedelta

    from app.db import SessionLocal
    from app.models import Commission

    emp_token, emp_id, seeker_token, _, _, match_id = _full_shift_cycle(client)
    _close_shift(client, emp_token, seeker_token, match_id)
    # Состариваем счёт за пределы срока оплаты (commission_due_days=7).
    db = SessionLocal()
    db.query(Commission).filter(Commission.employer_id == emp_id).update(
        {Commission.created_at: datetime.now(UTC) - timedelta(days=10)},
        synchronize_session=False,
    )
    db.commit()
    db.close()
    assert client.get("/billing/commission",
                      headers=_hdr(emp_token)).json()["overdue"] is True
    # Просроченный долг → публикация новой вакансии блокируется (402).
    r = client.post("/vacancies", headers=_hdr(emp_token), json={
        "role": "cook", "date": "2026-06-25", "start_time": 600,
        "end_time": 1080, "rate": 300, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Тест",
    })
    assert r.status_code == 402
    # Оператор отметил оплату → публикация снова доступна.
    client.post(f"/admin/commissions/{emp_id}/settle", headers=_hdr(emp_token))
    r2 = client.post("/vacancies", headers=_hdr(emp_token), json={
        "role": "cook", "date": "2026-06-25", "start_time": 600,
        "end_time": 1080, "rate": 300, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Тест",
    })
    assert r2.status_code == 201


def test_checkin_bruteforce_rate_limited(client):
    # 4-значный код нельзя перебрать: после 5 попыток в минуту — 429.
    _, _, seeker_token, _, _, match_id = _full_shift_cycle(client)
    for _ in range(5):
        r = client.post(f"/matches/{match_id}/checkin", headers=_hdr(seeker_token),
                        json={"code": "9999"})
        assert r.status_code == 400  # неверный код
    r6 = client.post(f"/matches/{match_id}/checkin", headers=_hdr(seeker_token),
                     json={"code": "9999"})
    assert r6.status_code == 429  # перебор заблокирован


def test_conflict_creates_dispute(client):
    emp_token, _, seeker_token, _, _, match_id = _full_shift_cycle(client)
    code = next(m for m in client.get("/matches", headers=_hdr(emp_token)).json()
                if m["id"] == match_id)["checkin_code"]
    client.post(f"/matches/{match_id}/checkin", headers=_hdr(seeker_token),
                json={"code": code})
    # Работник отметился, а заведение говорит «не вышел» → спор, не закрываем.
    a = client.post(f"/matches/{match_id}/attendance", headers=_hdr(emp_token),
                    json={"attended": False})
    assert a.json()["disputed"] is True
    m = next(x for x in client.get("/matches", headers=_hdr(seeker_token)).json()
             if x["id"] == match_id)
    assert m["disputed"] is True and m["status"] != "completed"


def test_dispute_endpoint_escalates(client):
    _, _, seeker_token, _, _, match_id = _full_shift_cycle(client)
    r = client.post(f"/matches/{match_id}/dispute", headers=_hdr(seeker_token),
                    json={"note": "пришёл, заведение не открылось"})
    assert r.status_code == 200 and r.json()["disputed"] is True


def test_operator_resolves_dispute_no_show(client):
    # Спор → оператор фиксирует неявку. Смена НЕ засчитана, комиссии нет.
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    _, _, seeker_token, _, _, match_id = _full_shift_cycle(client)
    client.post(f"/matches/{match_id}/dispute", headers=_hdr(seeker_token),
                json={"note": "спор"})
    # Не-админ (вход по телефону, tg_id=None) не может разрешать спор.
    code = client.post("/auth/request-code",
                       json={"phone": "+79990001122"}).json()["dev_code"]
    outsider = client.post("/auth/verify", json={
        "phone": "+79990001122", "code": code, "role": "seeker"}).json()["access_token"]
    assert client.post(f"/matches/{match_id}/resolve", headers=_hdr(outsider),
                       json={"outcome": "no_show"}).status_code == 403
    r = client.post(f"/matches/{match_id}/resolve", headers=ah,
                    json={"outcome": "no_show"})
    assert r.status_code == 200 and r.json()["disputed"] is False
    assert client.get("/admin/commissions", headers=ah).json() == []


def test_operator_resolves_dispute_completed_accrues(client):
    admin = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    ah = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    _, _, seeker_token, _, _, match_id = _full_shift_cycle(client)
    client.post(f"/matches/{match_id}/dispute", headers=_hdr(seeker_token),
                json={"note": "спор"})
    r = client.post(f"/matches/{match_id}/resolve", headers=ah,
                    json={"outcome": "completed"})
    assert r.status_code == 200 and r.json()["status"] == "completed"
    rows = client.get("/admin/commissions", headers=ah).json()
    assert rows and rows[0]["amountRub"] == 280


def test_candidate_filters_role_district_available(client):
    seeker_token, sid = _auth(client, "seeker")
    client.put("/me", headers=_hdr(seeker_token), json={
        "roles": ["bartender"], "city": "Москва", "district": "Тверской",
    })
    client.post("/me/available", headers=_hdr(seeker_token), json={"available": True})
    emp_token, _ = _auth(client, "employer")

    def ids(**params):
        rows = client.get(
            "/candidates", headers=_hdr(emp_token), params=params
        ).json()
        return {c["id"] for c in rows}

    # По роли: совпадающая — есть, другая — нет.
    assert sid in ids(role="bartender")
    assert sid not in ids(role="cook")
    # По району.
    assert sid in ids(district="Тверской")
    assert sid not in ids(district="Басманный")
    # «Готов сегодня» — включён.
    assert sid in ids(available_today=True)
    # «Надёжные» (без неявок): 0 смен → без неявок → показываем.
    assert sid in ids(reliable_only=True)


def test_feed_radius_filters_by_distance(client):
    emp_token, _ = _auth(client, "employer")
    near = client.post("/vacancies", headers=_hdr(emp_token), json={
        "role": "barista", "date": "2026-06-20", "start_time": 600,
        "end_time": 1080, "rate": 350, "lat": 55.75, "lng": 37.61,
        "address": "Рядом",
    }).json()
    far = client.post("/vacancies", headers=_hdr(emp_token), json={
        "role": "barista", "date": "2026-06-20", "start_time": 600,
        "end_time": 1080, "rate": 350, "lat": 56.30, "lng": 38.60,
        "address": "Далеко",
    }).json()
    seeker_token, _ = _auth(client, "seeker")
    base = {"lat": 55.75, "lng": 37.61}
    # Малый радиус — только ближняя смена.
    tight = client.get("/vacancies", headers=_hdr(seeker_token),
                       params={**base, "radius_km": 5}).json()
    ids = {v["id"] for v in tight}
    assert near["id"] in ids and far["id"] not in ids
    # Большой радиус — обе.
    wide = client.get("/vacancies", headers=_hdr(seeker_token),
                      params={**base, "radius_km": 300}).json()
    wide_ids = {v["id"] for v in wide}
    assert near["id"] in wide_ids and far["id"] in wide_ids
    # У ближней смены посчитано расстояние (не null).
    near_row = next(v for v in wide if v["id"] == near["id"])
    assert near_row["distance_km"] is not None


def test_invites_forbidden_for_employer(client):
    emp_token, _ = _auth(client, "employer")
    assert client.get(
        "/vacancies/invites", headers=_hdr(emp_token)
    ).status_code == 403


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


def test_favorites_add_list_remove(client):
    emp_token, _ = _auth(client, "employer")
    vac = _make_vacancy(client, emp_token)
    seeker_token, _ = _auth(client, "seeker")

    def ids():
        return client.get("/favorites/ids", headers=_hdr(seeker_token)).json()

    assert ids() == []
    r = client.post(f"/favorites/{vac['id']}", headers=_hdr(seeker_token))
    assert r.status_code == 200
    assert ids() == [vac["id"]]
    lst = client.get("/favorites", headers=_hdr(seeker_token)).json()
    assert len(lst) == 1 and lst[0]["id"] == vac["id"]

    client.delete(f"/favorites/{vac['id']}", headers=_hdr(seeker_token))
    assert ids() == []


def test_favorite_unknown_vacancy_404(client):
    seeker_token, _ = _auth(client, "seeker")
    r = client.post("/favorites/nope", headers=_hdr(seeker_token))
    assert r.status_code == 404


def test_attendance_and_reliability(client):
    emp_token, _, seeker_token, sid, _, match_id = _full_shift_cycle(client)

    # не работодатель смены не может отметить (соискатель → 403)
    assert client.post(f"/matches/{match_id}/attendance", headers=_hdr(seeker_token),
                       json={"attended": True}).status_code == 403

    # работодатель смены отмечает «не вышел»
    r = client.post(f"/matches/{match_id}/attendance", headers=_hdr(emp_token),
                    json={"attended": False})
    assert r.status_code == 200 and r.json()["noShow"] is True

    # Кандидата работодатель уже свайпнул — он ушёл из колоды (правильно), но
    # его надёжность видна в «Мои работники».
    workers = client.get("/employer/workers", headers=_hdr(emp_token)).json()
    me = next((c for c in workers if c["id"] == sid), None)
    assert me is not None
    assert me["shifts_total"] == 1
    assert me["shifts_attended"] == 0

    # отметили «вышел» — счётчик обновился
    client.post(f"/matches/{match_id}/attendance", headers=_hdr(emp_token),
                json={"attended": True})
    workers = client.get("/employer/workers", headers=_hdr(emp_token)).json()
    me = next(c for c in workers if c["id"] == sid)
    assert me["shifts_attended"] == 1


def test_my_workers_and_invite_again(client):
    emp_token, _, _, sid, _, _ = _full_shift_cycle(client)
    workers = client.get("/employer/workers", headers=_hdr(emp_token)).json()
    assert any(w["id"] == sid for w in workers)
    # позвать снова
    r = client.post(f"/employer/invite/{sid}", headers=_hdr(emp_token))
    assert r.status_code == 200 and r.json()["ok"] is True
    # соискатель не имеет доступа к списку работников
    seeker_token, _ = _auth(client, "seeker")
    r2 = client.get("/employer/workers", headers=_hdr(seeker_token))
    assert r2.status_code == 403


def test_urgent_ping(client):
    emp_token, _ = _auth(client, "employer")
    vac = client.post("/vacancies", headers=_hdr(emp_token), json={
        "role": "waiter", "date": "2026-06-25", "start_time": 600,
        "end_time": 1080, "rate": 300, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61, "address": "Тверская, 1",
    }).json()
    # доступный соискатель в Москве
    st, _ = _auth(client, "seeker")
    client.put("/me", headers=_hdr(st), json={
        "birth_date": "2000-01-01", "city": "Москва"})
    client.post("/me/available", headers=_hdr(st), json={"available": True})

    r = client.post(f"/vacancies/{vac['id']}/urgent", headers=_hdr(emp_token))
    assert r.status_code == 200
    assert r.json()["pinged"] >= 1


def test_digest_and_reminders_logic(client):
    from datetime import UTC, datetime

    from app import digest
    from app.db import SessionLocal

    emp_token, _ = _auth(client, "employer")
    today = datetime.now(UTC).date().isoformat()
    # активная смена на сегодня в Москве
    vac = client.post("/vacancies", headers=_hdr(emp_token), json={
        "role": "barista", "date": today, "start_time": 600, "end_time": 1080,
        "rate": 350, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61, "address": "Тверская, 1",
    }).json()

    seeker_token, sid = _auth(client, "seeker")
    client.put("/me", headers=_hdr(seeker_token), json={
        "birth_date": "2000-01-01", "city": "Москва"})

    db = SessionLocal()
    try:
        # дайджест: соискателю в Москве предлагается свежая смена
        d = digest.build_digest(db)
        assert sid in d and len(d[sid]) >= 1
        assert digest.send_digest(db) >= 1  # no-op без токена, но без ошибок

        # доводим до подтверждённой смены и проверяем напоминание на сегодня
        client.post("/swipes", headers=_hdr(emp_token), json={
            "target_id": sid, "target_type": "user", "direction": "like"})
        sw = client.post("/swipes", headers=_hdr(seeker_token), json={
            "target_id": vac["id"], "target_type": "vacancy",
            "direction": "like"}).json()
        mid = sw["match_id"]
        client.post(f"/matches/{mid}/confirm", headers=_hdr(seeker_token))
        client.post(f"/matches/{mid}/confirm", headers=_hdr(emp_token))

        reminders = digest.build_reminders(db)
        assert any(uid == sid for uid, _ in reminders)
        assert digest.send_reminders(db) >= 1
    finally:
        db.close()
