"""Отказ кассы должен оставаться ошибкой, а не ссылкой на мнимую оплату."""
import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import Purchase, WalletTxn
from app.routers import billing


@pytest.mark.parametrize("dev_mode", [False, True])
def test_provider_failure_never_returns_demo_payment(client, monkeypatch, dev_mode):
    auth = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    headers = {"Authorization": f"Bearer {auth.json()['access_token']}"}
    monkeypatch.setattr(settings, "dev_mode", dev_mode)
    monkeypatch.setattr(settings, "yookassa_shop_id", "test-shop")
    monkeypatch.setattr(settings, "yookassa_secret_key", "test-provider-key")
    monkeypatch.setattr(billing, "_create_yookassa_payment", lambda *a, **kw: None)

    result = client.post("/billing/wallet/topup", headers=headers,
                         json={"amount_rub": 1000})
    assert result.status_code == 503
    assert "Попробуйте" in result.json()["detail"]
    assert "url" not in result.json()
    with SessionLocal() as db:
        assert db.query(Purchase).count() == 0
        assert db.query(WalletTxn).count() == 0


def test_provider_confirmation_is_returned_when_created(client, monkeypatch):
    auth = client.post("/auth/telegram", json={"init_data": "", "role": "employer"})
    headers = {"Authorization": f"Bearer {auth.json()['access_token']}"}
    monkeypatch.setattr(settings, "yookassa_shop_id", "test-shop")
    monkeypatch.setattr(settings, "yookassa_secret_key", "test-provider-key")
    url = "https://yookassa.ru/checkout/test-payment"
    monkeypatch.setattr(billing, "_create_yookassa_payment", lambda *a, **kw: url)
    result = client.post("/billing/wallet/topup", headers=headers,
                         json={"amount_rub": 1000})
    assert result.status_code == 200
    assert result.json()["url"] == url
