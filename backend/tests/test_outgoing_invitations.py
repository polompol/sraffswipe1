"""Journal uses owned positive interest and actual match states, never read receipts."""

from datetime import UTC, datetime, timedelta

import pytest

from app.db import SessionLocal
from app.models import Match, Swipe, User, Vacancy

from .test_vacancy_drafts import _data, _login


def _worker(client, ident):
    h = _login(client, ident, "seeker")
    return h, client.get("/me", headers=h).json()["id"]


def _invite(client, emp, uid):
    res = client.post(
        "/swipes",
        headers=emp,
        json={
            "target_id": uid,
            "target_type": "user",
            "direction": "like",
        },
    )
    assert res.status_code == 200, res.text
    return res.json()


def _list(client, emp, **params):
    res = client.get("/employer/invitations", headers=emp, params=params)
    assert res.status_code == 200, res.text
    return res.json()


def test_invitation_becomes_a_real_match_and_opens_only_own_journal(client):
    emp = _login(client)
    other = _login(client, 940002)
    worker, uid = _worker(client, 940003)
    vacancy = client.post("/vacancies", headers=emp, json=_data()).json()
    _invite(client, emp, uid)
    rows = _list(client, emp)
    assert rows["total"] == 1
    assert rows["items"][0]["status"] == "waiting"
    assert rows["items"][0]["latest_match"] is None
    assert "phone" not in rows["items"][0]
    assert "tg_id" not in rows["items"][0]
    assert _list(client, other)["items"] == []
    assert client.get("/employer/invitations", headers=worker).status_code == 403
    assert client.get("/employer/invitations").status_code == 401

    response = client.post(
        "/swipes",
        headers=worker,
        json={
            "target_id": vacancy["id"],
            "target_type": "vacancy",
            "direction": "like",
        },
    ).json()
    row = _list(client, emp, view="with_matches")["items"][0]
    assert row["status"] == "matched"
    assert row["latest_match"]["id"] == response["match_id"]
    assert row["latest_match"]["shift_date"] == vacancy["date"]
    assert row["matches_count"] == 1
    assert _list(client, emp, view="waiting")["items"] == []
    _invite(client, emp, uid)
    assert _list(client, emp)["total"] == 1


def test_dismissed_candidate_is_not_listed_until_invited(client):
    emp = _login(client)
    _, uid = _worker(client, 940004)
    client.post(
        "/swipes",
        headers=emp,
        json={
            "target_id": uid,
            "target_type": "user",
            "direction": "dislike",
        },
    )
    with SessionLocal() as db:
        s = db.query(Swipe).filter(Swipe.target_id == uid).one()
        s.created_at = datetime.now(UTC) - timedelta(days=2)
        db.commit()
    assert _list(client, emp)["items"] == []
    _invite(client, emp, uid)
    row = _list(client, emp)["items"][0]
    assert row["status"] == "no_open_shifts"
    assert datetime.fromisoformat(
        row["invited_at"].replace("Z", "+00:00")
    ) > datetime.now(UTC) - timedelta(minutes=1)


def test_pagination_is_stable_and_does_not_duplicate_candidates(client):
    emp = _login(client)
    owner = client.get("/me", headers=emp).json()["id"]
    with SessionLocal() as db:
        for n in range(5):
            user = User(phone=f"+79400000{n:03}", name=f"Кандидат {n}")
            db.add(user)
            db.flush()
            db.add(
                Swipe(
                    swiper_id=owner,
                    target_id=user.id,
                    target_type="user",
                    direction="like",
                )
            )
        db.commit()
    one = _list(client, emp, limit=2)
    two = _list(client, emp, limit=2, offset=one["next_offset"])
    three = _list(client, emp, limit=2, offset=two["next_offset"])
    assert one["total"] == 5
    assert three["next_offset"] is None
    assert len({r["user_id"] for page in [one, two, three] for r in page["items"]}) == 5
    assert client.get("/employer/invitations?limit=500", headers=emp).status_code == 422
    assert (
        client.get("/employer/invitations?view=unknown", headers=emp).status_code == 422
    )


def test_live_match_has_priority_over_newer_history_and_other_employers(client):
    emp = _login(client)
    other = _login(client, 940011)
    _, uid = _worker(client, 940012)
    vid = client.post("/vacancies", headers=emp, json=_data()).json()["id"]
    other_vid = client.post("/vacancies", headers=other, json=_data()).json()["id"]
    _invite(client, emp, uid)
    with SessionLocal() as db:
        v = db.get(Vacancy, vid)
        active = Match(
            user_id=uid,
            employer_id=v.employer_id,
            vacancy_id=vid,
            status="confirmed",
            created_at=datetime.now(UTC) - timedelta(days=2),
        )
        db.add(active)
        second = Vacancy(employer_id=v.employer_id, **_data())
        db.add(second)
        db.flush()
        db.add(
            Match(
                user_id=uid,
                employer_id=v.employer_id,
                vacancy_id=second.id,
                status="completed",
            )
        )
        v_other = db.get(Vacancy, other_vid)
        db.add(
            Match(
                user_id=uid,
                employer_id=v_other.employer_id,
                vacancy_id=other_vid,
                status="matched",
            )
        )
        db.commit()
        active_id = active.id
    row = _list(client, emp)["items"][0]
    assert row["latest_match"]["id"] == active_id
    assert row["status"] == "confirmed"
    assert row["matches_count"] == 2
    with SessionLocal() as db:
        db.get(Match, active_id).no_show = True
        db.commit()
    assert _list(client, emp)["items"][0]["status"] == "no_show"


def test_blocked_candidate_does_not_look_like_a_pending_reply(client):
    emp = _login(client)
    _, uid = _worker(client, 940020)
    _invite(client, emp, uid)
    with SessionLocal() as db:
        db.get(User, uid).blocked = True
        db.commit()
    assert _list(client, emp)["items"][0]["status"] == "unavailable"


def test_invite_again_can_reverse_a_decline_and_match_an_existing_application(client):
    emp = _login(client)
    worker, uid = _worker(client, 940030)
    vacancy = client.post("/vacancies", headers=emp, json=_data()).json()
    client.post(
        "/swipes",
        headers=emp,
        json={
            "target_id": uid,
            "target_type": "user",
            "direction": "dislike",
        },
    )
    client.post(
        "/swipes",
        headers=worker,
        json={
            "target_id": vacancy["id"],
            "target_type": "vacancy",
            "direction": "like",
        },
    )
    response = client.post(f"/employer/invite/{uid}", headers=emp)
    assert response.status_code == 200
    assert response.json()["notified"] is True
    row = _list(client, emp)["items"][0]
    assert row["status"] == "matched"
    assert row["latest_match"] is not None
    assert (
        client.post(f"/employer/invite/{uid}", headers=emp).json()["notified"] is False
    )
    with SessionLocal() as db:
        db.get(User, uid).blocked = True
        db.commit()
    assert client.post(f"/employer/invite/{uid}", headers=emp).status_code == 404


def test_invite_again_rejects_full_shifts_without_saving_interest(client):
    emp = _login(client)
    _, uid = _worker(client, 940041)
    _, hired = _worker(client, 940042)
    vacancy = client.post("/vacancies", headers=emp, json=_data()).json()
    with SessionLocal() as db:
        v = db.get(Vacancy, vacancy["id"])
        db.add(Match(user_id=hired, employer_id=v.employer_id, vacancy_id=v.id))
        db.commit()
    response = client.post(f"/employer/invite/{uid}", headers=emp)
    assert response.status_code == 409
    assert _list(client, emp)["items"] == []


@pytest.mark.parametrize("previous_decline", [False, True])
def test_failed_match_does_not_commit_a_new_or_reversed_invitation(
    client, monkeypatch, previous_decline
):
    from app.routers import swipes

    emp = _login(client)
    worker, uid = _worker(client, 940043)
    vacancy = client.post("/vacancies", headers=emp, json=_data()).json()
    if previous_decline:
        assert client.post("/swipes", headers=emp, json={
            "target_id": uid, "target_type": "user", "direction": "dislike",
        }).status_code == 200
    assert client.post("/swipes", headers=worker, json={
        "target_id": vacancy["id"], "target_type": "vacancy", "direction": "like",
    }).status_code == 200

    def lost_last_slot(*_args):
        raise swipes.SlotsFull

    monkeypatch.setattr(swipes, "_ensure_match", lost_last_slot)
    response = client.post(f"/employer/invite/{uid}", headers=emp)
    assert response.status_code == 409
    assert _list(client, emp)["items"] == []
    with SessionLocal() as db:
        interest = db.query(Swipe).filter(
            Swipe.target_id == uid, Swipe.target_type == "user",
        ).first()
        if previous_decline:
            assert interest.direction == "dislike"
        else:
            assert interest is None
