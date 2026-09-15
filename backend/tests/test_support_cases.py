"""Отслеживаемые обращения в поддержку: владелец видит только свои кейсы."""


def _auth(client, role="seeker"):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role})
    assert r.status_code == 200
    body = r.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user_id"]


def test_user_creates_and_lists_own_support_case(client):
    headers, owner_id = _auth(client, "seeker")

    created = client.post(
        "/support/cases",
        headers=headers,
        json={"topic": "payment", "text": "Не вижу ответ по оплате смены"},
    )

    assert created.status_code == 201
    body = created.json()
    assert body["id"]
    assert body["number"].startswith("SS-")
    assert len(body["number"]) == 11
    assert body["topic"] == "payment"
    assert body["text"] == "Не вижу ответ по оплате смены"
    assert body["status"] == "open"
    assert body["adminReply"] == ""
    assert body["createdAt"]
    assert body["updatedAt"]

    rows = client.get("/support/cases", headers=headers)
    assert rows.status_code == 200
    assert [row["id"] for row in rows.json()] == [body["id"]]
    assert rows.json()[0]["number"] == body["number"]

    # sanity: owner id is a real authenticated account, not a public case id
    assert owner_id != body["id"]


def test_support_cases_are_scoped_by_current_role(client):
    seeker_h, seeker_id = _auth(client, "seeker")
    first = client.post(
        "/support/cases",
        headers=seeker_h,
        json={"topic": "shift", "text": "Вопрос по моей смене и коду прихода"},
    )
    assert first.status_code == 201

    # В тестовом Telegram-auth init_data один и тот же Telegram человек может
    # иметь две роли. Обращение работника не должно внезапно появиться в
    # кабинете заведения того же Telegram-аккаунта.
    employer_h, employer_id = _auth(client, "employer")
    assert employer_id != seeker_id
    employer_rows = client.get("/support/cases", headers=employer_h)
    assert employer_rows.status_code == 200
    assert employer_rows.json() == []

    second = client.post(
        "/support/cases",
        headers=employer_h,
        json={"topic": "account", "text": "Не получается изменить данные заведения"},
    )
    assert second.status_code == 201

    seeker_rows = client.get("/support/cases", headers=seeker_h).json()
    employer_rows = client.get("/support/cases", headers=employer_h).json()
    assert [x["id"] for x in seeker_rows] == [first.json()["id"]]
    assert [x["id"] for x in employer_rows] == [second.json()["id"]]


def test_support_case_validation(client):
    headers, _ = _auth(client, "seeker")

    bad_topic = client.post(
        "/support/cases",
        headers=headers,
        json={"topic": "anything", "text": "Достаточно длинное описание"},
    )
    assert bad_topic.status_code == 422

    too_short = client.post(
        "/support/cases",
        headers=headers,
        json={"topic": "other", "text": "ой"},
    )
    assert too_short.status_code == 422


def test_support_case_rate_limit(client):
    # Отдельный тест даёт чистый rate-limit bucket. Невалидные попытки из
    # validation-теста тоже считаются лимитером — это намеренная защита от
    # спама и её нельзя ослаблять ради теста.
    headers, _ = _auth(client, "seeker")

    for i in range(5):
        ok = client.post(
            "/support/cases",
            headers=headers,
            json={"topic": "other", "text": f"Проблема номер {i}, нужна помощь"},
        )
        assert ok.status_code == 201

    limited = client.post(
        "/support/cases",
        headers=headers,
        json={"topic": "other", "text": "Шестое обращение за одну минуту"},
    )
    assert limited.status_code == 429
