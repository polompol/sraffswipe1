"""Production admin access belongs to exactly one Telegram account."""

import pytest

from app.config import Settings, settings

from .test_vacancy_drafts import _login


@pytest.mark.parametrize("ids", ["", "0", "-1", "123,456", "@owner", "123x"])
def test_production_rejects_missing_or_ambiguous_owner(ids):
    cfg = Settings(
        _env_file=None, dev_mode=False, allow_insecure_telegram_auth=False,
        jwt_secret="x" * 32, internal_api_secret="internal-test",
        telegram_bot_token="test-token", admin_tg_ids=ids,
    )
    with pytest.raises(RuntimeError, match="ADMIN_TG_IDS"):
        cfg.assert_production_safe()


def test_only_configured_owner_can_access_admin_in_both_roles(client, monkeypatch):
    owner_worker = _login(client, 970001, "seeker")
    owner_venue = _login(client, 970001, "employer")
    other = _login(client, 970002, "employer")
    monkeypatch.setattr(settings, "dev_mode", False)
    monkeypatch.setattr(settings, "admin_tg_ids", "970001")
    for headers in (owner_worker, owner_venue):
        assert client.get("/admin/overview", headers=headers).status_code == 200
    assert client.get("/admin/overview", headers=other).status_code == 403
    assert client.get("/admin/overview").status_code == 401
    # Изменение настроек не превращает старый JWT в ключ к группе админов.
    monkeypatch.setattr(settings, "admin_tg_ids", "970001,970002")
    for headers in (owner_worker, owner_venue, other):
        assert client.get("/admin/overview", headers=headers).status_code == 403
