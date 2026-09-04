"""Каналы, которыми сервис можно было испортить снаружи.

Каждый из этих сценариев ничего не ломал заметно: приложение работало,
логи были чистыми, а тихо переставала работать какая-то важная часть.
"""
from datetime import UTC, datetime, timedelta

SOON = (datetime.now(UTC) + timedelta(days=3)).strftime("%Y-%m-%d")


def _auth(client, role="seeker"):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["user_id"]


def _vacancy(client, headers):
    return client.post("/vacancies", headers=headers, json={
        "role": "barista", "date": SOON, "start_time": 600,
        "end_time": 1080, "rate": 350, "city": "Москва",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    }).json()


def test_broken_filter_cannot_be_saved(client):
    """Одна битая запись обрывала рассылку алертов ВСЕМ, кто идёт следом."""
    h, _ = _auth(client)
    bad = client.post("/saved-searches", headers=h, json={
        "title": "Сломать всё", "filters": {"min_rate": "abc"},
    })
    assert bad.status_code == 422
    # И произвольные поля тоже: раньше в фильтр складывали что угодно.
    junk = client.post("/saved-searches", headers=h, json={
        "title": "Мусор", "filters": {"что_угодно": {"вложенное": [1, 2, 3]}},
    })
    assert junk.status_code == 422
    ok = client.post("/saved-searches", headers=h, json={
        "title": "Бариста от 300", "filters": {"role": "barista", "min_rate": 300},
    })
    assert ok.status_code == 201


def test_blocked_vacancy_stops_working_everywhere(client):
    """Заблокированная смена оставалась рабочей в избранном и в свайпах."""
    eh, _ = _auth(client, "employer")
    vac = _vacancy(client, eh)
    sh, _ = _auth(client)

    # Сохранили в избранное, пока смена жива.
    assert client.post(f"/favorites/{vac['id']}", headers=sh).status_code in (200, 201)
    assert len(client.get("/favorites", headers=sh).json()) == 1

    # Оператор блокирует смену.
    ah, _ = _auth(client)  # conftest: tg_id=0 = админ
    assert client.post(
        f"/admin/vacancies/{vac['id']}/block", headers=ah
    ).status_code == 200

    # Из избранного пропала, откликнуться нельзя.
    assert client.get("/favorites", headers=sh).json() == []
    swipe = client.post("/swipes", headers=sh, json={
        "target_id": vac["id"], "target_type": "vacancy", "direction": "like",
    })
    assert swipe.status_code == 404


def test_report_brigading_is_limited(client):
    """Один аккаунт не должен выглядеть как толпа жалобщиков."""
    eh, _ = _auth(client, "employer")
    vac = _vacancy(client, eh)
    sh, _ = _auth(client)

    first = client.post("/reports", headers=sh, json={
        "target_type": "vacancy", "target_id": vac["id"], "reason": "scam",
    })
    assert first.status_code == 201
    for _ in range(5):
        again = client.post("/reports", headers=sh, json={
            "target_type": "vacancy", "target_id": vac["id"], "reason": "scam",
        })
        assert again.json().get("duplicate") is True

    ah, _ = _auth(client)
    on_target = [
        r for r in client.get("/admin/reports", headers=ah).json()
        if r["targetId"] == vac["id"]
    ]
    assert len(on_target) == 1, "шесть жалоб от одного человека — одна строка"


def test_address_hints_are_for_employers_only(client):
    """Платная квота DaData: соискателю подсказки адреса не нужны нигде."""
    sh, _ = _auth(client)
    assert client.get("/dadata/address?q=Никольская", headers=sh).status_code == 403
