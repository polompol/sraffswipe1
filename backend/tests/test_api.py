"""Сквозные тесты основных сценариев StaffSwipe API."""


def _auth(client, phone: str, role: str) -> tuple[str, str]:
    """Возвращает (token, user_id) после прохождения авторизации."""
    r = client.post(
        "/auth/request-code", json={"phone": phone, "role": role}
    )
    assert r.status_code == 200
    code = r.json()["dev_code"]
    assert code is not None
    r = client.post(
        "/auth/verify", json={"phone": phone, "code": code, "role": role}
    )
    assert r.status_code == 200
    body = r.json()
    return body["access_token"], body["user_id"]


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_wrong_code_rejected(client):
    client.post("/auth/request-code", json={"phone": "+70000000001"})
    r = client.post(
        "/auth/verify", json={"phone": "+70000000001", "code": "0000"}
    )
    assert r.status_code == 400


def test_employer_creates_vacancy_and_seeker_sees_it(client):
    emp_token, _ = _auth(client, "+79990000001", "employer")
    payload = {
        "role": "barista",
        "date": "2026-06-20",
        "start_time": 480,
        "end_time": 960,
        "rate": 350,
        "rate_type": "perHour",
        "lat": 55.7340,
        "lng": 37.5870,
        "address": "ул. Льва Толстого, 16",
    }
    r = client.post("/vacancies", json=payload, headers=_hdr(emp_token))
    assert r.status_code == 201

    # Лента с геофильтром
    r = client.get("/vacancies", params={"lat": 55.7558, "lng": 37.6173})
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["distance_km"] is not None


def test_full_match_flow(client):
    # Работодатель создаёт вакансию
    emp_token, emp_id = _auth(client, "+79990000010", "employer")
    vac = client.post(
        "/vacancies",
        json={
            "role": "waiter",
            "date": "2026-06-21",
            "start_time": 600,
            "end_time": 1200,
            "rate": 300,
            "lat": 55.0,
            "lng": 37.0,
        },
        headers=_hdr(emp_token),
    ).json()

    # Соискатель и работодатель лайкают друг друга → мэтч
    seeker_token, seeker_id = _auth(client, "+79990000011", "seeker")
    client.post(
        "/swipes",
        json={"target_id": seeker_id, "target_type": "user", "direction": "like"},
        headers=_hdr(emp_token),
    )
    r = client.post(
        "/swipes",
        json={
            "target_id": vac["id"],
            "target_type": "vacancy",
            "direction": "like",
        },
        headers=_hdr(seeker_token),
    )
    body = r.json()
    assert body["matched"] is True
    match_id = body["match_id"]

    # Появился мэтч у соискателя
    matches = client.get("/matches", headers=_hdr(seeker_token)).json()
    assert any(m["id"] == match_id for m in matches)

    # Системное сообщение в чате
    msgs = client.get(
        f"/matches/{match_id}/messages", headers=_hdr(seeker_token)
    ).json()
    assert any(m["is_system"] for m in msgs)

    # Обе стороны подтверждают смену
    client.post(f"/matches/{match_id}/confirm", headers=_hdr(seeker_token))
    r = client.post(f"/matches/{match_id}/confirm", headers=_hdr(emp_token))
    assert r.json()["status"] == "confirmed"

    # PDF-акт генерируется
    r = client.get(f"/matches/{match_id}/act.pdf")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"
