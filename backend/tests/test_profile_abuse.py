"""Анкета и смена — не витрина для объявлений.

Должность, отметки об опыте и адрес фотографии показываются чужим людям, а
модератора у них нет. Проверяем, что туда нельзя записать произвольный текст:
раньше двенадцать «должностей» по сорок символов доходили до каждого заведения
в ленте.
"""
from datetime import UTC, datetime, timedelta


def _auth(client, role="seeker"):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role})
    return r.json()["access_token"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


def test_role_must_be_from_list(client):
    token = _auth(client)
    bad = client.put(
        "/me",
        json={"roles": ["Пиши в телеграм @nanana, платим больше"]},
        headers=_hdr(token),
    )
    assert bad.status_code == 422
    ok = client.put("/me", json={"roles": ["waiter", "barista"]}, headers=_hdr(token))
    assert ok.status_code == 200


def test_experience_tags_must_be_from_list(client):
    token = _auth(client)
    bad = client.put(
        "/me", json={"experience_tags": ["скидка 50% по промокоду"]},
        headers=_hdr(token),
    )
    assert bad.status_code == 422
    ok = client.put(
        "/me", json={"experience_tags": ["medBook", "english"]}, headers=_hdr(token)
    )
    assert ok.status_code == 200


def test_photo_url_only_http(client):
    token = _auth(client)
    for bad_url in ("javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4="):
        r = client.put("/me", json={"photo_url": bad_url}, headers=_hdr(token))
        assert r.status_code == 422, bad_url
    ok = client.put(
        "/me", json={"photo_url": "https://cdn.example.com/a.jpg"}, headers=_hdr(token)
    )
    assert ok.status_code == 200
    # Пусто — это «фото нет», такое разрешено.
    empty = client.put("/me", json={"photo_url": ""}, headers=_hdr(token))
    assert empty.status_code == 200


def test_vacancy_role_must_be_from_list(client):
    token = _auth(client, "employer")
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).strftime("%Y-%m-%d")
    body = {
        "role": "Срочно! Пиши @nanana", "date": tomorrow,
        "start_time": 600, "end_time": 1080, "rate": 300,
    }
    assert client.post("/vacancies", json=body, headers=_hdr(token)).status_code == 422
    body["role"] = "barista"
    assert client.post("/vacancies", json=body, headers=_hdr(token)).status_code == 201


def test_profile_text_is_auto_flagged(client):
    """«Внеси залог» в поле «о себе» должно попасть к оператору — как и в смене."""
    from app.models import Report

    token = _auth(client)
    r = client.put(
        "/me",
        json={"about": "Выхожу быстро, но сначала внеси залог за форму"},
        headers=_hdr(token),
    )
    assert r.status_code == 200

    from app.db import SessionLocal

    db = SessionLocal()
    try:
        flagged = (
            db.query(Report)
            .filter(Report.reporter_id == "system", Report.target_type == "user")
            .first()
        )
        assert flagged is not None
    finally:
        db.close()
