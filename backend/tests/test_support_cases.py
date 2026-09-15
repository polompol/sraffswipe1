"""Отслеживаемые обращения в поддержку: владелец видит только свои кейсы."""
from app.db import SessionLocal
from app.models import User
from app.security import create_token


def _auth(client, role="seeker"):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role})
    assert r.status_code == 200
    body = r.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user_id"]


def _ordinary_user() -> tuple[str, dict[str, str]]:
    db = SessionLocal()
    try:
        user = User(
            tg_id=992001,
            phone="tg:992001",
            name="Пользователь поддержки",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        token = create_token(user.id, "seeker", version=user.token_version)
        return user.id, {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


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


def test_admin_support_queue_is_private_and_reply_is_audited(client):
    owner_id, owner_h = _ordinary_user()
    created = client.post(
        "/support/cases",
        headers=owner_h,
        json={"topic": "payment", "text": "Не понимаю статус комиссии по смене"},
    )
    assert created.status_code == 201
    case_id = created.json()["id"]

    admin_h, admin_id = _auth(client, "seeker")

    denied = client.get("/admin/support", headers=owner_h)
    assert denied.status_code == 403
    denied_reply = client.post(
        f"/admin/support/{case_id}/reply",
        headers=owner_h,
        json={"reply": "Попытка чужого ответа"},
    )
    assert denied_reply.status_code == 403

    queue = client.get("/admin/support?status=open", headers=admin_h)
    assert queue.status_code == 200
    row = next(x for x in queue.json() if x["id"] == case_id)
    assert row["number"] == created.json()["number"]
    assert row["ownerId"] == owner_id
    assert row["ownerRole"] == "seeker"
    assert row["topic"] == "payment"
    assert row["status"] == "open"

    replied = client.post(
        f"/admin/support/{case_id}/reply",
        headers=admin_h,
        json={"reply": "  Комиссия начисляется только после закрытой смены.  "},
    )
    assert replied.status_code == 200
    assert replied.json()["status"] == "answered"
    assert replied.json()["adminReply"] == "Комиссия начисляется только после закрытой смены."

    mine = client.get("/support/cases", headers=owner_h).json()
    user_row = next(x for x in mine if x["id"] == case_id)
    assert user_row["status"] == "answered"
    assert user_row["adminReply"] == "Комиссия начисляется только после закрытой смены."

    audit = client.get("/admin/audit", headers=admin_h)
    assert audit.status_code == 200
    audit_row = next(
        x for x in audit.json()
        if x["action"] == "support.reply" and x["targetId"] == case_id
    )
    assert audit_row["actorId"] == admin_id
    assert audit_row["targetType"] == "support_case"
    assert audit_row["reason"] == "Комиссия начисляется только после закрытой смены."


def test_admin_closes_support_case_and_open_queue_excludes_it(client):
    _, owner_h = _ordinary_user()
    created = client.post(
        "/support/cases",
        headers=owner_h,
        json={"topic": "account", "text": "Нужно понять, как исправить данные профиля"},
    )
    assert created.status_code == 201
    case_id = created.json()["id"]
    admin_h, _ = _auth(client, "seeker")

    denied = client.post(
        f"/admin/support/{case_id}/close",
        headers=owner_h,
        json={"reply": "Не должен закрыться"},
    )
    assert denied.status_code == 403

    closed = client.post(
        f"/admin/support/{case_id}/close",
        headers=admin_h,
        json={"reply": "  Вопрос решён, данные можно изменить в настройках.  "},
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"
    assert closed.json()["adminReply"] == "Вопрос решён, данные можно изменить в настройках."

    open_rows = client.get("/admin/support?status=open", headers=admin_h)
    assert open_rows.status_code == 200
    assert case_id not in {x["id"] for x in open_rows.json()}

    all_rows = client.get("/admin/support?status=all", headers=admin_h)
    assert all_rows.status_code == 200
    assert case_id in {x["id"] for x in all_rows.json()}

    mine = client.get("/support/cases", headers=owner_h).json()
    row = next(x for x in mine if x["id"] == case_id)
    assert row["status"] == "closed"
    assert row["adminReply"] == "Вопрос решён, данные можно изменить в настройках."

    audit = client.get("/admin/audit", headers=admin_h).json()
    audit_row = next(
        x for x in audit
        if x["action"] == "support.close" and x["targetId"] == case_id
    )
    assert audit_row["targetType"] == "support_case"
    assert audit_row["reason"] == "Вопрос решён, данные можно изменить в настройках."
