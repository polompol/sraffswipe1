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
from app.ratelimit import reset as reset_rate_limit  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    init_db()
    reset_rate_limit()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def age_shift():
    """Перемотать смену мэтча в прошлое.

    Закрыть смену (и отметить неявку, и уточнить часы) теперь можно только
    ПОСЛЕ её окончания: без этого правила пара аккаунтов набивала себе
    закрытые смены и рейтинг за минуты, а работник мог получить ложную неявку
    ещё до того, как выйдет на работу. Тестам, которые проверяют закрытие,
    нужно сначала довести смену до конца.
    """
    from .shifttime import age_shift

    return age_shift
