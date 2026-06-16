"""Фикстуры тестов: общая SQLite-БД, чистая на каждый тест."""
import os
import tempfile

# Конфигурируем окружение ДО импорта приложения.
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"
os.environ["DEV_MODE"] = "true"
os.environ["ALLOW_INSECURE_TELEGRAM_AUTH"] = "true"
os.environ["INTERNAL_API_SECRET"] = "test-internal-secret"
# insecure-логины дают tg_id=0 — делаем его админом для тестов аналитики.
os.environ["ADMIN_TG_IDS"] = "0"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine, init_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    init_db()
    with TestClient(app) as c:
        yield c
