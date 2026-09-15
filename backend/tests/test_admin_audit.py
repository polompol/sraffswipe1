"""Операторские изменения чужих данных должны оставлять неизменяемый след."""
from app.db import SessionLocal
from app.models import Employer, Report, User, Vacancy
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


def test_all_moderation_state_changes_are_audited(client):
    """Журнал не должен покрывать одну кнопку и пропускать остальные меры."""
    admin_h, _ = _admin_auth(client)
    db = SessionLocal()
    try:
        victim = User(
            tg_id=991101,
            phone="tg:991101",
            name="Нарушитель",
        )
        employer = Employer(
            tg_id=991102,
            phone="tg:991102",
            company_name="Кафе Аудит",
        )
        db.add_all([victim, employer])
        db.flush()
        vacancy = Vacancy(
            employer_id=employer.id,
            role="barista",
            date="2030-01-01",
            start_time=600,
            end_time=1080,
            rate=400,
            city="Москва",
            address="Тестовая, 1",
        )
        db.add(vacancy)
        db.flush()
        warn_report = Report(
            reporter_id=employer.id,
            target_type="user",
            target_id=victim.id,
            reason="abuse",
            text="грубость",
        )
        resolve_report = Report(
            reporter_id=victim.id,
            target_type="vacancy",
            target_id=vacancy.id,
            reason="fake",
            text="проверить",
        )
        db.add_all([warn_report, resolve_report])
        db.commit()
        victim_id = victim.id
        employer_id = employer.id
        vacancy_id = vacancy.id
        warn_report_id = warn_report.id
        resolve_report_id = resolve_report.id
    finally:
        db.close()

    assert client.post(
        f"/admin/reports/{warn_report_id}/warn",
        headers=admin_h,
        json={"note": "оскорбления в переписке"},
    ).status_code == 200
    assert client.post(
        f"/admin/reports/{resolve_report_id}/resolve",
        headers=admin_h,
        json={"reply": "проверено оператором"},
    ).status_code == 200
    assert client.post(
        f"/admin/employers/{employer_id}/verify",
        headers=admin_h,
        json={"verified": True},
    ).status_code == 200
    assert client.post(
        f"/admin/employers/{employer_id}/verify",
        headers=admin_h,
        json={"verified": False},
    ).status_code == 200
    assert client.post(
        f"/admin/users/{victim_id}/block", headers=admin_h
    ).status_code == 200
    assert client.post(
        f"/admin/users/{victim_id}/unblock", headers=admin_h
    ).status_code == 200
    assert client.post(
        f"/admin/vacancies/{vacancy_id}/block", headers=admin_h
    ).status_code == 200
    assert client.post(
        f"/admin/vacancies/{vacancy_id}/unblock", headers=admin_h
    ).status_code == 200

    rows = client.get("/admin/audit", headers=admin_h).json()
    actions = {row["action"] for row in rows}
    assert {
        "report.warn",
        "report.resolve",
        "employer.verify",
        "employer.unverify",
        "user.block",
        "user.unblock",
        "vacancy.block",
        "vacancy.unblock",
    } <= actions
