"""Подключение к БД (SQLAlchemy). Работает с SQLite и PostgreSQL/PostGIS."""
from collections.abc import Generator

from sqlalchemy import create_engine
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

    Base.metadata.create_all(bind=engine)
