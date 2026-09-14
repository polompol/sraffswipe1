"""Подключение к БД (SQLAlchemy). Работает с SQLite и PostgreSQL/PostGIS."""
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

connect_args = (
    {"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {}
)

# Для PostgreSQL: pre_ping убирает «битые» соединения после простоя (иначе под
# нагрузкой ловим случайные 500), увеличенный пул держит всплески трафика.
engine_kwargs: dict = {"connect_args": connect_args}
if not settings.database_url.startswith("sqlite"):
    engine_kwargs.update(
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_recycle=1800,
    )

engine = create_engine(settings.database_url, **engine_kwargs)

if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _unicode_lower(dbapi_conn, _rec):  # pragma: no cover - зависит от драйвера
        """Научить SQLite приводить к нижнему регистру русские буквы.

        Встроенный `lower()` в SQLite умеет только латиницу: «ИВАН» так и
        остаётся «ИВАН». Поиск в админке ищет по нижнему регистру, поэтому в
        разработке и тестах человек с именем «Иван» не находился по запросу
        «иван» — а в проде (PostgreSQL) находился. Разное поведение в разных
        средах — худший вид ошибки: локально всё хорошо, а разбираться с
        жалобой не по чему.
        """
        dbapi_conn.create_function("lower", 1, lambda s: s.lower() if s else s)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Импорт моделей нужен, чтобы они зарегистрировались в metadata.
    from . import models  # noqa: F401

    # SQLite (dev/тесты) — создаём схему на месте. PostgreSQL (прод) управляется
    # миграциями Alembic (`alembic upgrade head`), поэтому create_all не трогаем.
    if settings.database_url.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)
