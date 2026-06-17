"""Модели БД — соответствуют разделу 5 спецификации StaffSwipe."""
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class User(Base):
    """Соискатель (коллекция users)."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    phone: Mapped[str] = mapped_column(String, unique=True, index=True)
    tg_id: Mapped[int | None] = mapped_column(
        Integer, unique=True, index=True, nullable=True
    )
    tg_username: Mapped[str | None] = mapped_column(String, nullable=True)
    name: Mapped[str] = mapped_column(String, default="")
    birth_date: Mapped[str] = mapped_column(String, default="")  # ISO yyyy-mm-dd
    city: Mapped[str] = mapped_column(String, default="")
    district: Mapped[str] = mapped_column(String, default="")
    lat: Mapped[float] = mapped_column(Float, default=0.0)
    lng: Mapped[float] = mapped_column(Float, default=0.0)
    roles: Mapped[str] = mapped_column(String, default="")  # csv: waiter,barista
    med_book: Mapped[str] = mapped_column(String, default="no")  # yes|no|expired
    self_employed: Mapped[bool] = mapped_column(Boolean, default=False)
    inn: Mapped[str | None] = mapped_column(String, nullable=True)
    experience_tags: Mapped[str] = mapped_column(String, default="")
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    photo_urls: Mapped[str] = mapped_column(Text, default="")  # csv
    about: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Employer(Base):
    """Работодатель (коллекция employers)."""

    __tablename__ = "employers"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    phone: Mapped[str] = mapped_column(String, unique=True, index=True)
    tg_id: Mapped[int | None] = mapped_column(
        Integer, unique=True, index=True, nullable=True
    )
    tg_username: Mapped[str | None] = mapped_column(String, nullable=True)
    company_name: Mapped[str] = mapped_column(String, default="")
    inn: Mapped[str] = mapped_column(String, default="")
    ogrn: Mapped[str] = mapped_column(String, default="")
    address: Mapped[str] = mapped_column(String, default="")
    lat: Mapped[float] = mapped_column(Float, default=0.0)
    lng: Mapped[float] = mapped_column(Float, default=0.0)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    contact_phone: Mapped[str] = mapped_column(String, default="")
    photo_url: Mapped[str] = mapped_column(String, default="")
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    vacancies: Mapped[list["Vacancy"]] = relationship(back_populates="employer")


class Vacancy(Base):
    """Вакансия/смена (коллекция vacancies)."""

    __tablename__ = "vacancies"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    employer_id: Mapped[str] = mapped_column(ForeignKey("employers.id"))
    role: Mapped[str] = mapped_column(String)
    date: Mapped[str] = mapped_column(String)  # ISO yyyy-mm-dd
    start_time: Mapped[int] = mapped_column(Integer)  # минуты от полуночи
    end_time: Mapped[int] = mapped_column(Integer)
    rate: Mapped[int] = mapped_column(Integer)
    rate_type: Mapped[str] = mapped_column(String, default="perHour")
    description: Mapped[str] = mapped_column(Text, default="")
    require_med_book: Mapped[bool] = mapped_column(Boolean, default=False)
    require_experience: Mapped[bool] = mapped_column(Boolean, default=False)
    lat: Mapped[float] = mapped_column(Float, default=0.0)
    lng: Mapped[float] = mapped_column(Float, default=0.0)
    address: Mapped[str] = mapped_column(String, default="")
    interior_photo_url: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    employer: Mapped[Employer] = relationship(back_populates="vacancies")


class Swipe(Base):
    """Свайп (коллекция swipes). Уникальность пары swiper→target."""

    __tablename__ = "swipes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    swiper_id: Mapped[str] = mapped_column(String, index=True)
    target_id: Mapped[str] = mapped_column(String, index=True)
    target_type: Mapped[str] = mapped_column(String)  # vacancy|user
    direction: Mapped[str] = mapped_column(String)  # like|superlike|dislike
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Match(Base):
    """Мэтч (коллекция matches)."""

    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, index=True)
    employer_id: Mapped[str] = mapped_column(String, index=True)
    vacancy_id: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, default="matched")
    confirmed_by_seeker: Mapped[bool] = mapped_column(Boolean, default=False)
    confirmed_by_employer: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Message(Base):
    """Сообщение чата (коллекция messages)."""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    match_id: Mapped[str] = mapped_column(String, index=True)
    sender_id: Mapped[str] = mapped_column(String)
    text: Mapped[str] = mapped_column(Text)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class PhoneCode(Base):
    """Одноразовый код подтверждения телефона."""

    __tablename__ = "phone_codes"

    phone: Mapped[str] = mapped_column(String, primary_key=True)
    code: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


# ---- Монетизация / entitlements ----


class Subscription(Base):
    """Подписка работодателя (ЮKassa). Активный тариф и срок."""

    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(String, index=True)  # employer.id
    plan: Mapped[str] = mapped_column(String, default="free")  # free|pro|business
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    renews_at: Mapped[str | None] = mapped_column(String, nullable=True)  # ISO
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Entitlement(Base):
    """Баланс прав пользователя: супер-лайки, boost, premium, верификация."""

    __tablename__ = "entitlements"

    owner_id: Mapped[str] = mapped_column(String, primary_key=True)
    superlike_balance: Mapped[int] = mapped_column(Integer, default=1)
    boost_balance: Mapped[int] = mapped_column(Integer, default=0)
    seeker_premium: Mapped[bool] = mapped_column(Boolean, default=False)
    employer_verified: Mapped[bool] = mapped_column(Boolean, default=False)


class Purchase(Base):
    """Журнал покупок (Stars/ЮKassa). Идемпотентность по provider_charge_id."""

    __tablename__ = "purchases"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(String, index=True)
    sku: Mapped[str] = mapped_column(String)
    provider: Mapped[str] = mapped_column(String)  # stars|yookassa
    amount: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String, default="XTR")
    # pending|paid|failed
    status: Mapped[str] = mapped_column(String, default="pending")
    provider_charge_id: Mapped[str | None] = mapped_column(
        String, unique=True, index=True, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Boost(Base):
    """Активный boost вакансии: поднятие в ленте до момента expires_at."""

    __tablename__ = "boosts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    vacancy_id: Mapped[str] = mapped_column(String, index=True)
    expires_at: Mapped[str] = mapped_column(String)  # ISO
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Referral(Base):
    """Реферал: кто кого пригласил. Уникальность по приглашённому."""

    __tablename__ = "referrals"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    referrer_id: Mapped[str] = mapped_column(String, index=True)
    referred_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    rewarded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Event(Base):
    """Аналитическое событие воронки (open/swipe/match/confirm/purchase)."""

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    owner_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String, index=True)
    props: Mapped[str] = mapped_column(Text, default="")  # JSON-строка
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Streak(Base):
    """Серия ежедневных заходов (геймификация вовлечения)."""

    __tablename__ = "streaks"

    owner_id: Mapped[str] = mapped_column(String, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=1)
    last_active: Mapped[str] = mapped_column(String, default="")  # ISO date


class SavedSearch(Base):
    """Сохранённый поиск соискателя + опция уведомлять о новых сменах."""

    __tablename__ = "saved_searches"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(String, index=True)
    title: Mapped[str] = mapped_column(String, default="Мой поиск")
    filters: Mapped[str] = mapped_column(Text, default="{}")  # JSON
    notify: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Review(Base):
    """Отзыв после смены: оценка одной стороны другой (1..5)."""

    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    match_id: Mapped[str] = mapped_column(String, index=True)
    rater_id: Mapped[str] = mapped_column(String, index=True)
    ratee_id: Mapped[str] = mapped_column(String, index=True)
    stars: Mapped[int] = mapped_column(Integer, default=5)
    text: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
