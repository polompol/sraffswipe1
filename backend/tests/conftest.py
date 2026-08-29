"""Фикстуры тестов: общая база, чистая на каждый тест.

По умолчанию это SQLite во временном файле — быстро и без внешних зависимостей.
Но работает сервис на PostgreSQL, а тот прощает заметно меньше: строгие типы,
поведение уникальности при NULL, блокировки и транзакции. Прогон только на
SQLite оставляет целый класс расхождений незамеченным до самого сервера.

Поэтому базу можно подменить снаружи:

    STAFFSWIPE_TEST_DB="postgresql+psycopg://user:pass@localhost/staffswipe_test" \
        python -m pytest -q

Драйвер тот же, что в проде (psycopg3): иначе проверяется не то соединение,
с которым сервис работает на сервере.

Так же это делается и на сборке: обычный прогон — на SQLite, отдельный —
на настоящем PostgreSQL.
"""
import os
import tempfile

# Конфигурируем окружение ДО импорта приложения.
_external = os.environ.get("STAFFSWIPE_TEST_DB", "").strip()
if _external:
    os.environ["DATABASE_URL"] = _external
else:
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

_IS_SQLITE = os.environ["DATABASE_URL"].startswith("sqlite")


def _prepare_postgres_once() -> None:
    """Схему на PostgreSQL создают миграции, а не модели.

    В бою `init_db()` намеренно ничего не создаёт для PostgreSQL: там схемой
    управляет Alembic. Значит и тестовую базу надо готовить тем же путём —
    иначе прогон проверяет схему, которой на сервере не существует.
    """
    import subprocess
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    res = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=root,
        env={**os.environ, "PATH": os.environ.get("PATH", "/usr/bin:/bin")},
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert res.returncode == 0, (
        "миграции не накатились на тестовую базу:\n" + res.stderr[-3000:]
    )


def _wipe_postgres() -> None:
    """Стереть данные, не трогая схему.

    Пересоздавать схему на каждый тест нельзя: это тридцать с лишним миграций
    подряд. Чистим данные одним TRUNCATE — он же сбрасывает счётчики и обходит
    внешние ключи.
    """
    from sqlalchemy import text

    tables = [t.name for t in Base.metadata.sorted_tables]
    with engine.begin() as conn:
        conn.execute(
            text(f'TRUNCATE {", ".join(tables)} RESTART IDENTITY CASCADE')
        )


if not _IS_SQLITE:
    _prepare_postgres_once()


@pytest.fixture()
def client():
    if _IS_SQLITE:
        Base.metadata.drop_all(bind=engine)
        init_db()
    else:
        _wipe_postgres()
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


@pytest.fixture()
def make_match():
    """Создать настоящую смену со всеми связями — для тестов про деньги.

    Раньше такие тесты подставляли выдуманный `match_id` вроде «debt-1».
    На SQLite это проходило: он по умолчанию не проверяет внешние ключи. На
    PostgreSQL — нет, и правильно: в бою комиссия не может ссылаться на смену,
    которой не существует. Тест, опирающийся на такую запись, проверяет
    положение дел, невозможное у живых людей.
    """
    from itertools import count

    from app.db import SessionLocal
    from app.models import Match, User, Vacancy

    # Телефон у человека уникален, а помощник зовут по нескольку раз за тест.
    numbers = count(1)

    def _make(employer_id: str, user_id: str | None = None, **fields) -> str:
        db = SessionLocal()
        try:
            if user_id is None:
                # Телефон уникален — берём заведомо свободный.
                worker = User(
                    phone=f"+7999{next(numbers):07d}",
                    name="Работник для смены",
                )
                db.add(worker)
                db.flush()
                user_id = worker.id
            vac = Vacancy(
                employer_id=employer_id,
                role="barista",
                date="2026-01-01",
                start_time=600,
                end_time=1080,
                rate=400,
                rate_type="perHour",
                city="Москва",
                address="ул. Тестовая, 1",
            )
            db.add(vac)
            db.flush()
            m = Match(
                user_id=user_id,
                employer_id=employer_id,
                vacancy_id=vac.id,
                **fields,
            )
            db.add(m)
            db.commit()
            return m.id
        finally:
            db.close()

    return _make
