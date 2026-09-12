"""Private drafts, conflicts, and publication retries against the real API."""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from threading import Barrier
from urllib.parse import urlencode
from uuid import uuid4

import pytest

from app.db import SessionLocal
from app.models import VacancyDraft
from app.timeutil import local_today


def _login(client, ident=930001, role="employer"):
    res = client.post(
        "/auth/telegram",
        json={
            "role": role,
            "init_data": urlencode(
                {"user": json.dumps({"id": ident, "first_name": "Тест"})}
            ),
        },
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _data(**over):
    data = {
        "role": "barista",
        "city": "Москва",
        "rate": 400,
        "date": (date.fromisoformat(local_today()) + timedelta(days=2)).isoformat(),
        "start_time": 600,
        "end_time": 1080,
    }
    return data | over


def _save(client, headers, data=None, ident=None, version=0):
    ident = ident or str(uuid4())
    res = client.put(
        f"/vacancy-drafts/{ident}",
        headers=headers,
        json={"version": version, "data": data or {}},
    )
    assert res.status_code == 200, res.text
    return res.json()


def _publish(client, headers, draft):
    return client.post(
        f"/vacancy-drafts/{draft['id']}/publish",
        headers=headers,
        json={"version": draft["version"]},
    )


def test_incomplete_draft_survives_new_session_but_is_not_public(client):
    h = _login(client)
    d = _save(client, h, {"role": "cook", "description": "Уточнить меню", "rate": None})
    again = _login(client)
    assert client.get(f"/vacancy-drafts/{d['id']}", headers=again).json() == d
    assert client.get("/vacancy-drafts", headers=again).json() == [d]
    assert client.get("/vacancies").json() == []
    assert client.get("/vacancies?mine=1", headers=h).json() == []
    assert _publish(client, h, d).status_code == 422
    assert len(client.get("/vacancy-drafts", headers=h).json()) == 1


def test_draft_versions_prevent_overwrites_and_allow_safe_retry(client):
    h = _login(client)
    d = _save(client, h, _data(description="Первая версия", step=1))
    retry = _save(client, h, _data(description="Первая версия", step=1), d["id"])
    assert retry == d
    updated = _save(client, h, _data(description="Новая версия", step=2), d["id"], 1)
    assert updated["version"] == 2
    stale = client.put(
        f"/vacancy-drafts/{d['id']}",
        headers=h,
        json={
            "version": 1,
            "data": _data(description="Старое устройство"),
        },
    )
    assert stale.status_code == 409
    assert _publish(client, h, d).status_code == 409
    assert (
        client.delete(f"/vacancy-drafts/{d['id']}?version=1", headers=h).status_code
        == 409
    )
    assert client.get(f"/vacancy-drafts/{d['id']}", headers=h).json() == updated


def test_drafts_are_isolated_between_employers_and_roles(client):
    h = _login(client)
    d = _save(client, h, _data())
    other = _login(client, 930002)
    worker = _login(client, 930003, "seeker")
    assert client.get("/vacancy-drafts", headers=other).json() == []
    assert client.get("/vacancy-drafts").status_code == 401
    for headers, status in [(other, 404), (worker, 403)]:
        url = f"/vacancy-drafts/{d['id']}"
        assert client.get(url, headers=headers).status_code == status
        assert (
            client.put(
                url, headers=headers, json={"version": 1, "data": _data()}
            ).status_code
            == status
        )
        assert client.delete(url + "?version=1", headers=headers).status_code == status
        assert _publish(client, headers, d).status_code == status
    assert client.get("/vacancy-drafts", headers=worker).status_code == 403


@pytest.mark.parametrize(
    "bad",
    [
        {"role": "unknown"},
        {"description": "x" * 2001},
        {"date": "2026-02-30"},
        {"headcount": 21},
        {"rate": -1},
        {"step": 3},
        {"employer_id": "someone"},
    ],
)
def test_malformed_draft_is_rejected(client, bad):
    h = _login(client)
    res = client.put(f"/vacancy-drafts/{uuid4()}", headers=h, json={"data": bad})
    assert res.status_code == 422
    assert client.get("/vacancy-drafts", headers=h).json() == []


def test_draft_rejects_foreign_photo_before_persistence(client, monkeypatch):
    from app.config import settings

    h = _login(client)
    monkeypatch.setattr(settings, "dev_mode", False)
    res = client.put(
        f"/vacancy-drafts/{uuid4()}",
        headers=h,
        json={
            "data": _data(interior_photo_url="https://example.com/foreign-photo.jpg"),
        },
    )
    assert res.status_code == 400
    assert client.get("/vacancy-drafts", headers=h).json() == []


@pytest.mark.parametrize(
    "change",
    [
        {"date": "2020-01-01"},
        {"rate": 0},
        {"end_time": 600},
        {"city": " "},
    ],
)
def test_partial_draft_can_be_saved_but_publish_revalidates(client, change):
    h = _login(client)
    d = _save(client, h, _data(**change))
    assert _publish(client, h, d).status_code == 422
    assert client.get(f"/vacancy-drafts/{d['id']}", headers=h).json()["version"] == 1
    assert client.get("/vacancies?mine=1", headers=h).json() == []


def test_publish_retry_returns_the_same_vacancy(client):
    h = _login(client)
    d = _save(client, h, _data())
    first = _publish(client, h, d)
    second = _publish(client, h, d)
    assert first.status_code == second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert len(client.get("/vacancies?mine=1", headers=h).json()) == 1
    assert client.get("/vacancy-drafts", headers=h).json() == []
    assert (
        client.put(
            f"/vacancy-drafts/{d['id']}",
            headers=h,
            json={"version": 1, "data": _data()},
        ).status_code
        == 409
    )
    assert (
        client.delete(f"/vacancy-drafts/{d['id']}?version=1", headers=h).status_code
        == 409
    )


def test_two_publication_requests_do_not_create_two_vacancies(client):
    h = _login(client)
    d = _save(client, h, _data())
    gate = Barrier(2)

    def publish_once():
        gate.wait(timeout=10)
        return _publish(client, h, d)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: publish_once(), range(2)))
    assert [r.status_code for r in responses] == [200, 200]
    assert responses[0].json()["id"] == responses[1].json()["id"]
    assert len(client.get("/vacancies?mine=1", headers=h).json()) == 1


def test_publication_receipt_is_available_after_publication_quota_is_used(client):
    h = _login(client)
    for _ in range(9):
        assert client.post("/vacancies", headers=h, json=_data()).status_code == 201
    d = _save(client, h, _data())
    first = _publish(client, h, d)
    assert first.status_code == 200
    retry = _publish(client, h, d)
    assert retry.status_code == 200
    assert retry.json()["id"] == first.json()["id"]
    other = _save(client, h, _data())
    assert _publish(client, h, other).status_code == 429
    assert len(client.get("/vacancies?mine=1", headers=h).json()) == 10


def test_invalid_draft_does_not_spend_publication_quota(client):
    h = _login(client)
    d = _save(client, h, {"role": "cook"})
    for _ in range(11):
        assert _publish(client, h, d).status_code == 422
    ready = _save(client, h, _data())
    assert _publish(client, h, ready).status_code == 200


def test_commission_block_does_not_consume_or_publish_draft(client, monkeypatch):
    from app.routers import vacancies

    h = _login(client)
    d = _save(client, h, _data())
    monkeypatch.setattr(vacancies, "commission_overdue", lambda *_: True)
    assert _publish(client, h, d).status_code == 402
    assert client.get(f"/vacancy-drafts/{d['id']}", headers=h).json()["version"] == 1
    assert client.get("/vacancies?mine=1", headers=h).json() == []


def test_delete_clears_content_and_late_save_cannot_recreate_it(client):
    h = _login(client)
    d = _save(client, h, _data(description="Приватные заметки"))
    kept = _save(client, h, {"role": "cook"})
    assert (
        client.delete(f"/vacancy-drafts/{d['id']}?version=1", headers=h).status_code
        == 204
    )
    assert client.get("/vacancy-drafts", headers=h).json() == [kept]
    assert (
        client.put(
            f"/vacancy-drafts/{d['id']}",
            headers=h,
            json={"version": 0, "data": _data()},
        ).status_code
        == 404
    )
    with SessionLocal() as db:
        assert db.get(VacancyDraft, d["id"]).payload == {}
