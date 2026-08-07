"""Миграции: применяются с нуля и дают схему, совпадающую с моделями.

Зачем: прод стартует командой `alembic upgrade head`, а остальные тесты
поднимают базу через `create_all` — то есть миграции не проверялись вообще.
Расхождение «поле есть в модели, но миграции его не добавляют» всплыло бы
только на сервере при запуске.
"""
import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect

from app.models import Base

BACKEND = Path(__file__).resolve().parent.parent


def _upgrade_head(db_path: Path) -> subprocess.CompletedProcess:
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_path}"}
    return subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND, env=env, capture_output=True, text=True, timeout=180,
    )


def test_migrations_apply_from_scratch(tmp_path):
    """Вся цепочка накатывается на пустую базу без ошибок."""
    db = tmp_path / "mig.db"
    res = _upgrade_head(db)
    assert res.returncode == 0, res.stderr
    assert db.exists()


def test_migrated_schema_matches_models(tmp_path):
    """Схема после миграций совпадает с моделями — ни лишнего, ни забытого."""
    db = tmp_path / "mig.db"
    assert _upgrade_head(db).returncode == 0

    insp = inspect(create_engine(f"sqlite:///{db}"))
    db_tables = set(insp.get_table_names())
    problems: list[str] = []

    for table, model in Base.metadata.tables.items():
        if table not in db_tables:
            problems.append(f"таблицы нет в миграциях: {table}")
            continue
        db_cols = {c["name"] for c in insp.get_columns(table)}
        model_cols = {c.name for c in model.columns}
        problems += [
            f"{table}.{c} есть в модели, но нет в миграциях"
            for c in sorted(model_cols - db_cols)
        ]
        problems += [
            f"{table}.{c} есть в миграциях, но нет в модели"
            for c in sorted(db_cols - model_cols)
        ]

    # alembic_version — служебная таблица самого Alembic, её в моделях нет.
    for extra in sorted(db_tables - set(Base.metadata.tables) - {"alembic_version"}):
        problems.append(f"таблица {extra} есть в миграциях, но нет в моделях")

    assert not problems, "Схема разъехалась с моделями:\n" + "\n".join(problems)


def test_single_migration_head():
    """Одна голова: две ветки миграций — это сломанное обновление на сервере."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(BACKEND / "alembic.ini"))
    heads = ScriptDirectory.from_config(cfg).get_heads()
    assert len(heads) == 1, f"ожидалась одна голова, найдены: {heads}"
