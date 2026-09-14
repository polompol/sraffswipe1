"""Regression tests for fail-safe production configuration."""


def test_config_class_defaults_dev_mode_to_false(monkeypatch):
    from app.config import Settings

    monkeypatch.delenv("DEV_MODE", raising=False)
    cfg = Settings(_env_file=None)
    assert cfg.dev_mode is False


def test_shared_test_environment_explicitly_enables_dev_mode():
    from app.config import settings

    # conftest.py opts into development mode explicitly for the test suite.
    assert settings.dev_mode is True


def test_production_accepts_complete_secure_configuration(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("DEV_MODE", "false")
    monkeypatch.setenv("JWT_SECRET", "x" * 32)
    monkeypatch.setenv("INTERNAL_API_SECRET", "internal-test-secret")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "bot-token")
    monkeypatch.setenv("ALLOW_INSECURE_TELEGRAM_AUTH", "false")
    monkeypatch.setenv("ADMIN_TG_IDS", "970001")
    cfg = Settings()
    cfg.assert_production_safe()
