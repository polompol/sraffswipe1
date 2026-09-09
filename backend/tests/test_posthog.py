"""PostHog integration: privacy boundary + committed source-of-truth events."""
from app import analytics_hooks
from app.db import SessionLocal
from app.models import Employer, Match, User, Vacancy
from app.posthog import safe_anonymous_id, sanitize_properties


def test_posthog_privacy_filter_drops_sensitive_values():
    safe = sanitize_properties({
        "match_id": "match-123",
        "actor_role": "seeker",
        "amount_rub": 500,
        "phone": "+79990000000",
        "contact_phone": "+79990000001",
        "inn": "1234567890",
        "init_data": "signed-telegram-payload",
        "access_token": "secret",
        "message": "private chat text",
        "address": "private street",
        "provider_charge_id": "payment-id",
        "nested": {
            "vacancy_id": "vac-1",
            "email": "private@example.test",
        },
    })

    assert safe["match_id"] == "match-123"
    assert safe["actor_role"] == "seeker"
    assert safe["amount_rub"] == 500
    assert safe["nested"] == {"vacancy_id": "vac-1"}
    for forbidden in (
        "phone",
        "contact_phone",
        "inn",
        "init_data",
        "access_token",
        "message",
        "address",
        "provider_charge_id",
    ):
        assert forbidden not in safe


def test_anonymous_id_accepts_only_random_identifier_shape():
    assert safe_anonymous_id("550e8400-e29b-41d4-a716-446655440000")
    assert safe_anonymous_id("too short") == ""
    assert safe_anonymous_id("<script>alert(1)</script>") == ""


def test_match_events_are_emitted_only_after_commit(client, monkeypatch):
    captured: list[tuple[str, str, dict]] = []

    def fake_capture(name: str, distinct_id: str, props: dict | None = None) -> bool:
        captured.append((name, distinct_id, props or {}))
        return True

    monkeypatch.setattr(analytics_hooks, "capture_event", fake_capture)

    db = SessionLocal()
    try:
        seeker = User(phone="+79990001111", name="Тест")
        employer = Employer(phone="+79990002222", company_name="Тест кафе")
        db.add_all([seeker, employer])
        db.flush()
        vacancy = Vacancy(
            employer_id=employer.id,
            role="barista",
            date="2026-12-01",
            start_time=600,
            end_time=1080,
            rate=400,
            rate_type="perHour",
            city="Москва",
            address="ул. Тестовая, 1",
        )
        db.add(vacancy)
        db.flush()

        match = Match(
            user_id=seeker.id,
            employer_id=employer.id,
            vacancy_id=vacancy.id,
        )
        db.add(match)
        db.flush()
        assert not captured, "analytics must wait for the transaction commit"
        db.commit()

        assert [name for name, _, _ in captured] == ["match_created"]
        assert captured[0][1] == seeker.id

        captured.clear()
        match.confirmed_by_seeker = True
        match.confirmed_by_employer = True
        match.status = "confirmed"
        db.commit()

        names = {name for name, _, _ in captured}
        assert "shift_confirmation_recorded" in names
        assert "shift_confirmed" in names
    finally:
        db.close()
