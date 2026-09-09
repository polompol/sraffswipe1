"""Regression tests for fail-safe production configuration."""


def test_dev_mode_is_explicit_in_test_environment():
    from app.config import settings

    # The shared test fixture deliberately opts into development mode. The
    # important regression is that config.py itself no longer defaults to it.
    assert settings.dev_mode is True


def test_production_rejects_missing_secrets(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("DEV_MODE", "false")
    monkeypatch.setenv("JWT_SECRET", "x" * 32)
    monkeypatch.setenv("INTERNAL_API_SECRET", "internal-test-secret")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "bot-token")
    monkeypatch.setenv("ALLOW_INSECURE_TELEGRAM_AUTH", "false")
    cfg = Settings()
    cfg.assert_production_safe()
