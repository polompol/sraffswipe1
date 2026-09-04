"""Отзыв токена: «выйти на всех устройствах» и перенос аккаунта.

Зачем: срок жизни токена — дни, и до этого отозвать его было НЕЧЕМ. Украли
телефон разблокированным — доступ к аккаунту сохранялся до истечения срока.
Отдельно то же касалось переноса аккаунта на новый Telegram: перенос делают
как раз при потере доступа, а токен прежнего владельца продолжал работать.

Реализовано номером поколения в токене, а не отметкой времени, — почему
именно так, показывает test_revocation_is_by_generation_not_by_time.
"""
def _auth(client, role="seeker"):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role}).json()
    return r["access_token"], r["user_id"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def _detach(owner_id: str, tg_id: int) -> None:
    """Развести участников по tg_id: в тестах insecure-вход даёт всем 0,
    из-за чего администратором оказывается каждый."""
    from app.db import SessionLocal
    from app.models import Employer, User

    db = SessionLocal()
    try:
        obj = db.get(User, owner_id) or db.get(Employer, owner_id)
        obj.tg_id = tg_id
        if (obj.phone or "").startswith("tg:"):
            obj.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def test_logout_all_kills_existing_token(client):
    """Токен, выданный до «выйти везде», перестаёт работать сразу."""
    token, uid = _auth(client)
    assert client.get("/me", headers=_hdr(token)).status_code == 200

    _detach(uid, 700001)                       # человек — не оператор
    admin_token, _ = _auth(client)             # новый вход = tg_id 0 = оператор

    r = client.post(f"/admin/users/{uid}/logout-all", headers=_hdr(admin_token))
    assert r.status_code == 200

    after = client.get("/me", headers=_hdr(token))
    assert after.status_code == 401
    assert "заново" in after.json()["detail"]


def test_fresh_login_works_after_logout_all(client):
    """Человек заходит снова — и всё работает: это не блокировка."""
    token, uid = _auth(client)
    _detach(uid, 700002)
    admin_token, _ = _auth(client)
    client.post(f"/admin/users/{uid}/logout-all", headers=_hdr(admin_token))

    # Возвращаем прежний tg_id, чтобы вход попал в тот же аккаунт.
    from app.db import SessionLocal
    from app.models import Employer, User

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.tg_id == 0).first()
        if admin is None:
            admin = db.query(Employer).filter(Employer.tg_id == 0).first()
        admin.tg_id = 700003
        admin.phone = "tg:700003"
        db.commit()
        u = db.get(User, uid)
        u.tg_id = 0
        u.phone = "tg:0"
        db.commit()
    finally:
        db.close()

    fresh, _ = _auth(client)
    assert client.get("/me", headers=_hdr(fresh)).status_code == 200


def test_relink_kills_old_owner_token(client):
    """Перенос аккаунта обрывает сессии прежнего владельца.

    Перенос делают, когда доступ к старому Telegram потерян, — в том числе
    когда телефон украли. Раньше вор оставался в аккаунте до конца срока.
    """
    token, uid = _auth(client)
    assert client.get("/me", headers=_hdr(token)).status_code == 200

    _detach(uid, 700004)
    admin_token, _ = _auth(client)
    r = client.post("/admin/relink", headers=_hdr(admin_token),
                    json={"owner_id": uid, "new_tg_id": 700005})
    assert r.status_code == 200, r.text

    assert client.get("/me", headers=_hdr(token)).status_code == 401


def test_erase_kills_token_immediately(client):
    """После удаления данных прежний токен не работает."""
    token, uid = _auth(client)
    _detach(uid, 700006)
    admin_token, _ = _auth(client)
    assert client.post(f"/admin/users/{uid}/erase",
                       headers=_hdr(admin_token)).status_code == 200
    # Аккаунт ещё и заблокирован, поэтому годится любой из двух отказов.
    assert client.get("/me", headers=_hdr(token)).status_code in (401, 403)


def test_revocation_is_by_generation_not_by_time(client):
    """Отзыв различает токены по номеру поколения, а не по времени выдачи.

    Со временем это не работало: в токене оно хранится с точностью до секунды,
    и вход в ту же секунду, что и «выйти везде», отличить было невозможно —
    либо новый токен сразу считался отозванным, либо старый выживал.
    """
    from app.db import SessionLocal
    from app.models import User

    token, uid = _auth(client)
    db = SessionLocal()
    try:
        u = db.get(User, uid)
        assert u.token_version == 0
        u.token_version = 1          # аккаунт «разлогинили»
        db.commit()
    finally:
        db.close()

    # Старый токен несёт поколение 0 — не подходит.
    assert client.get("/me", headers=_hdr(token)).status_code == 401
    # А выданный после отзыва несёт поколение 1 и работает, даже если выдан
    # в ту же секунду.
    fresh, _ = _auth(client)
    assert client.get("/me", headers=_hdr(fresh)).status_code == 200


def test_logout_all_requires_admin(client):
    token, uid = _auth(client)
    _detach(uid, 700007)
    other, _ = _auth(client, role="employer")
    _detach(_auth(client, role="employer")[1], 700008)
    r = client.post(f"/admin/users/{uid}/logout-all", headers=_hdr(other))
    assert r.status_code in (401, 403)


def test_logout_all_unknown_account_is_404(client):
    admin_token, _ = _auth(client)
    assert client.post("/admin/users/нет/logout-all",
                       headers=_hdr(admin_token)).status_code == 404
