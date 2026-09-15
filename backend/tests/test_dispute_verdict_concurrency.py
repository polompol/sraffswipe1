"""Операторский вердикт по спору должен быть атомарно одноразовым."""

import pytest
from fastapi import HTTPException

from app.admin_audit import AdminActionLog
from app.db import SessionLocal
from app.models import Commission, Employer, Match, User
from app.routers.matches import ResolveMatchIn, resolve_match


def _auth(client, role: str):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _detach(owner_id: str, tg_id: int) -> None:
    """Освободить тестовый admin tg_id=0 для отдельного оператора."""
    db = SessionLocal()
    try:
        owner = db.get(User, owner_id) or db.get(Employer, owner_id)
        owner.tg_id = tg_id
        if (owner.phone or "").startswith("tg:"):
            owner.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def test_two_stale_admin_sessions_cannot_apply_opposite_verdicts(client, make_match):
    """Две сессии видят открытый спор; победить должна только одна.

    Это детерминированная модель настоящей гонки: обе Session заранее кладут
    Match(disputed=True) в identity map. После commit первой вторая всё ещё
    держит старый объект. Простая Python-проверка ``if not m.disputed`` такой
    повтор не ловит — нужен атомарный compare-and-set в самой БД.
    """
    _, employer_id = _auth(client, "employer")
    _detach(employer_id, 971300)
    match_id = make_match(employer_id, status="confirmed", disputed=True)

    _, admin_id = _auth(client, "employer")  # tg_id=0 из test settings
    principal = {"id": admin_id, "role": "employer"}

    db_first = SessionLocal()
    db_second = SessionLocal()
    try:
        # Держим обе ссылки живыми. SQLAlchemy identity map использует weakref:
        # без локальной ссылки объект мог исчезнуть и второй Session.get()
        # перечитывал уже свежее disputed=False, маскируя реальную гонку.
        first_seen = db_first.get(Match, match_id)
        stale_second = db_second.get(Match, match_id)
        assert first_seen.disputed is True
        assert stale_second.disputed is True

        first = resolve_match(
            match_id,
            ResolveMatchIn(outcome="completed", reason="первый вердикт"),
            db_first,
            principal,
        )
        assert first.status == "completed"
        assert stale_second.disputed is True, "вторая сессия действительно устарела"

        with pytest.raises(HTTPException) as exc:
            resolve_match(
                match_id,
                ResolveMatchIn(outcome="no_show", reason="устаревшая сессия"),
                db_second,
                principal,
            )
        assert exc.value.status_code == 409
    finally:
        db_first.close()
        db_second.close()

    db = SessionLocal()
    try:
        match = db.get(Match, match_id)
        assert match.status == "completed"
        assert match.no_show is False
        assert db.query(Commission).filter(Commission.match_id == match_id).count() == 1
        assert (
            db.query(AdminActionLog)
            .filter(AdminActionLog.target_type == "match", AdminActionLog.target_id == match_id)
            .count()
            == 1
        )
    finally:
        db.close()
