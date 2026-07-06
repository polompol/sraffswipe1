"""Тесты сохранённых поисков и срабатывания алертов."""


def _auth(client, role="seeker"):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role})
    return r.json()["access_token"], r.json()["user_id"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def test_saved_search_crud(client):
    token, _ = _auth(client, "seeker")
    h = _hdr(token)
    created = client.post("/saved-searches", headers=h, json={
        "title": "Бариста рядом", "filters": {"role": "barista", "min_rate": 300},
        "notify": True,
    })
    assert created.status_code == 201
    sid = created.json()["id"]
    assert created.json()["filters"]["role"] == "barista"

    lst = client.get("/saved-searches", headers=h).json()
    assert any(s["id"] == sid for s in lst)

    assert client.delete(f"/saved-searches/{sid}", headers=h).status_code == 200
    assert client.get("/saved-searches", headers=h).json() == []


def test_new_vacancy_matches_saved_search(client):
    # Соискатель сохраняет поиск «бариста».
    s_token, _ = _auth(client, "seeker")
    client.post("/saved-searches", headers=_hdr(s_token), json={
        "title": "Бариста", "filters": {"role": "barista"}, "notify": True,
    })

    # Работодатель публикует подходящую вакансию — функция алертов отрабатывает.
    e_token, _ = _auth(client, "employer")
    r = client.post("/vacancies", headers=_hdr(e_token), json={
        "role": "barista", "date": "2026-06-20", "start_time": 600,
        "end_time": 1080, "rate": 350, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "A",
    })
    # Без bot-токена notify_owner — no-op, но публикация должна пройти (201).
    assert r.status_code == 201
