"""Операторские изменения чужих данных должны оставлять неизменяемый след."""
from app.db import SessionLocal
from app.models import User
from app.security import create_token


def _admin_auth(client):
    r = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    body = r.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user_id"]


def _ordinary_user() -> tuple[str, dict[str, str]]:
    db = SessionLocal()
    try:
        user = User(
            tg_id=991001,
            phone="tg:991001",
            name="Пользователь для аудита",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        token = create_token(user.id, "seeker", version=user.token_version)
        return user.id, {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


def test_admin_block_is_audited_and_audit_is_admin_only(client):
    admin_h, admin_id = _admin_auth(client)
    victim_id, ordinary_h = _ordinary_user()

    # Сам журнал — тоже чувствительные операторские данные.
    denied = client.get("/admin/audit", headers=ordinary_h)
    assert denied.status_code == 403

    changed = client.post(
        f"/admin/users/{victim_id}/block",
        headers=admin_h,
        json={"reason": "подозрение на мошенничество"},
    )
    assert changed.status_code == 200

    audit = client.get("/admin/audit", headers=admin_h)
    assert audit.status_code == 200
    rows = audit.json()
    row = next(
        item
        for item in rows
        if item["targetId"] == victim_id and item["action"] == "user.block"
    )
    assert row["actorId"] == admin_id
    assert row["targetType"] == "user"
    assert row["reason"] == "подозрение на мошенничество"
    assert row["createdAt"]
