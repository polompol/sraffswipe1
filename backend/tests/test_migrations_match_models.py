"""Миграции и модели должны описывать одну и ту же базу.

Тесты работают на схеме, собранной из моделей (`create_all`), а боевой сервер —
на схеме, собранной миграциями. Это два разных пути к одной таблице, и они
расходятся молча: добавили поле в модель, забыли миграцию — тесты зелёные,
а на сервере запрос падает «no such column» уже под живыми людьми.

Здесь оба пути проходятся с нуля и сравниваются: таблицы, колонки и то, какие
из них обязательные. Заодно это проверка, что миграции вообще накатываются на
пустую базу по порядку, без ручных шагов.
"""
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine

from app.models import Base

ROOT = Path(__file__).resolve().parents[1]


def _schema(path: Path) -> dict[str, dict[str, tuple[str, bool]]]:
    """Таблицы → колонки → (тип, обязательна ли)."""
    db = sqlite3.connect(path)
    try:
        out: dict[str, dict[str, tuple[str, bool]]] = {}
        rows = db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        for (table,) in rows:
            # Служебные: одна принадлежит SQLite, вторая — самому Alembic.
            if table.startswith("sqlite_") or table == "alembic_version":
                continue
            out[table] = {
                r[1]: (r[2].upper(), bool(r[3]))
                for r in db.execute(f"PRAGMA table_info({table})")
            }
        return out
    finally:
        db.close()


@pytest.fixture(scope="module")
def migrated(tmp_path_factory) -> Path:
    """Пустая база, доведённая миграциями до последней версии."""
    path = tmp_path_factory.mktemp("mig") / "migrated.db"
    res = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=ROOT,
        env={
            "PATH": "/usr/bin:/bin:/usr/local/bin",
            "DATABASE_URL": f"sqlite:///{path}",
            "JWT_SECRET": "тест",
            "ADMIN_TG_IDS": "0",
            "DEV_MODE": "true",
        },
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert res.returncode == 0, f"миграции не накатились:\n{res.stderr[-3000:]}"
    return path


@pytest.fixture(scope="module")
def from_models(tmp_path_factory) -> Path:
    """Та же база, но собранная прямо из моделей."""
    path = tmp_path_factory.mktemp("mod") / "models.db"
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(engine)
    engine.dispose()
    return path


def test_tables_match(migrated, from_models):
    a, b = set(_schema(migrated)), set(_schema(from_models))
    assert not (b - a), (
        f"таблицы есть в моделях, но их не создаёт ни одна миграция: {sorted(b - a)}"
    )
    assert not (a - b), (
        f"миграции создают таблицы, которых нет в моделях: {sorted(a - b)}"
    )


def test_columns_match(migrated, from_models):
    mig, mod = _schema(migrated), _schema(from_models)
    problems: list[str] = []
    for table in sorted(set(mig) & set(mod)):
        missing = sorted(set(mod[table]) - set(mig[table]))
        extra = sorted(set(mig[table]) - set(mod[table]))
        if missing:
            problems.append(
                f"{table}: поле есть в модели, но не в миграциях — {missing}"
            )
        if extra:
            problems.append(f"{table}: поле есть в миграциях, но не в модели — {extra}")
    assert not problems, "схемы разошлись:\n" + "\n".join(problems)


def test_required_columns_match(migrated, from_models):
    """Обязательность поля — тоже часть схемы.

    Разойтись она может незаметно: в модели поле обязательное, в миграции —
    нет. Тогда база примет строку без него, а приложение свалится на чтении.
    """
    mig, mod = _schema(migrated), _schema(from_models)
    problems: list[str] = []
    for table in sorted(set(mig) & set(mod)):
        for col in sorted(set(mig[table]) & set(mod[table])):
            if mig[table][col][1] != mod[table][col][1]:
                problems.append(
                    f"{table}.{col}: в миграциях "
                    f"{'обязательное' if mig[table][col][1] else 'необязательное'}, "
                    f"в модели — "
                    f"{'обязательное' if mod[table][col][1] else 'необязательное'}"
                )
    assert not problems, "обязательность полей разошлась:\n" + "\n".join(problems)
