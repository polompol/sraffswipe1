"""Модели БД — соответствуют разделу 5 спецификации StaffSwipe."""
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
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
    tg_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True, nullable=True)
    tg_username: Mapped[str | None] = mapped_column(String, nullable=True)
    name: Mapped[str] = mapped_column(String, default="")
    birth_date: Mapped[str] = mapped_column(String, default="")
    city: Mapped[str] = mapped_column(String, default="")
    district: Mapped[str] = mapped_column(String, default="")
    roles: Mapped[str] = mapped_column(String, default="")
    med_book: Mapped[str] = mapped_column(String, default="no")
    self_employed: Mapped[bool] = mapped_column(Boolean, default=False)
    inn: Mapped[str | None] = mapped_column(String, nullable=True)
    experience_tags: Mapped[str] = mapped_column(String, default="")
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    photo_urls: Mapped[str] = mapped_column(Text, default="")
    about: Mapped[str] = mapped_column(Text, default="")
    available_date: Mapped[str] = mapped_column(String, default="", index=True)
    blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    warnings: Mapped[int] = mapped_column(Integer, default=0)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Employer(Base):
    """Работодатель (коллекция employers)."""
    __tablename__ = "employers"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    phone: Mapped[str] = mapped_column(String, unique=True, index=True)
    tg_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True, nullable=True)
    tg_username: Mapped[str | None] = mapped_column(String, nullable=True)
    company_name: Mapped[str] = mapped_column(String, default="")
    inn: Mapped[str] = mapped_column(String, default="")
    ogrn: Mapped[str] = mapped_column(String, default="")
    address: Mapped[str] = mapped_column(String, default="")
    city: Mapped[str] = mapped_column(String, default="", index=True)
    lat: Mapped[float] = mapped_column(Float, default=0.0)
    lng: Mapped[float] = mapped_column(Float, default=0.0)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    contact_phone: Mapped[str] = mapped_column(String, default="")
    photo_url: Mapped[str] = mapped_column(String, default="")
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    warnings: Mapped[int] = mapped_column(Integer, default=0)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    vacancies: Mapped[list["Vacancy"]] = relationship(back_populates="employer")


class Vacancy(Base):
    """Вакансия/смена (коллекция vacancies)."""
    __tablename__ = "vacancies"
    __table_args__ = (Index("ix_vacancy_status_date", "status", "date"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    employer_id: Mapped[str] = mapped_column(ForeignKey("employers.id"), index=True)
    role: Mapped[str] = mapped_column(String)
    date: Mapped[str] = mapped_column(String)
    start_time: Mapped[int] = mapped_column(Integer)
    end_time: Mapped[int] = mapped_column(Integer)
    rate: Mapped[int] = mapped_column(Integer)
    rate_type: Mapped[str] = mapped_column(String, default="perHour")
    pay_method: Mapped[str] = mapped_column(String, default="cash")
    tips: Mapped[str] = mapped_column(String, default="none")
    description: Mapped[str] = mapped_column(Text, default="")
    headcount: Mapped[int] = mapped_column(Integer, default=1)
    require_med_book: Mapped[bool] = mapped_column(Boolean, default=False)
    require_experience: Mapped[bool] = mapped_column(Boolean, default=False)
    lat: Mapped[float] = mapped_column(Float, default=0.0)
    lng: Mapped[float] = mapped_column(Float, default=0.0)
    address: Mapped[str] = mapped_column(String, default="")
    city: Mapped[str] = mapped_column(String, default="", index=True)
    interior_photo_url: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    employer: Mapped[Employer] = relationship(back_populates="vacancies")


class Swipe(Base):
    __tablename__ = "swipes"
    __table_args__ = (UniqueConstraint("swiper_id", "target_id", "target_type", name="uq_swipe_target"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    swiper_id: Mapped[str] = mapped_column(String, index=True)
    target_id: Mapped[str] = mapped_column(String, index=True)
    target_type: Mapped[str] = mapped_column(String)
    direction: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Match(Base):
    __tablename__ = "matches"
    __table_args__ = (UniqueConstraint("vacancy_id", "user_id", name="uq_match_vac_user"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    employer_id: Mapped[str] = mapped_column(ForeignKey("employers.id"), index=True)
    vacancy_id: Mapped[str] = mapped_column(ForeignKey("vacancies.id"), index=True)
    status: Mapped[str] = mapped_column(String, default="matched")
    confirmed_by_seeker: Mapped[bool] = mapped_column(Boolean, default=False)
    confirmed_by_employer: Mapped[bool] = mapped_column(Boolean, default=False)
    no_show: Mapped[bool] = mapped_column(Boolean, default=False)
    checkin_code: Mapped[str] = mapped_column(String, default="")
    seeker_checked_in: Mapped[bool] = mapped_column(Boolean, default=False)
    checkin_by_code: Mapped[bool] = mapped_column(Boolean, default=False)
    settle_notified_on: Mapped[str] = mapped_column(String, default="")
    not_held_by: Mapped[str] = mapped_column(String, default="")
    employer_checked_in: Mapped[bool] = mapped_column(Boolean, default=False)
    disputed: Mapped[bool] = mapped_column(Boolean, default=False)
    actual_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reschedule_date: Mapped[str] = mapped_column(String, default="")
    reschedule_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reschedule_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cancelled_by: Mapped[str] = mapped_column(String, default="")
    cancel_reason: Mapped[str] = mapped_column(String, default="")
    cancelled_late: Mapped[bool] = mapped_column(Boolean, default=False)
    reminded_on: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), index=True)
    sender_id: Mapped[str] = mapped_column(String)
    text: Mapped[str] = mapped_column(Text)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class PhoneCode(Base):
    __tablename__ = "phone_codes"
    phone: Mapped[str] = mapped_column(String, primary_key=True)
    code: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Entitlement(Base):
    __tablename__ = "entitlements"
    owner_id: Mapped[str] = mapped_column(String, primary_key=True)
    employer_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    balance_rub: Mapped[int] = mapped_column(Integer, default=0)


class WalletTxn(Base):
    __tablename__ = "wallet_txns"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(String, index=True)
    amount: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String)
    note: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Purchase(Base):
    __tablename__ = "purchases"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(String, index=True)
    sku: Mapped[str] = mapped_column(String)
    provider: Mapped[str] = mapped_column(String)
    amount: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String, default="RUB")
    status: Mapped[str] = mapped_column(String, default="pending")
    provider_charge_id: Mapped[str | None] = mapped_column(String, unique=True, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Referral(Base):
    __tablename__ = "referrals"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    referrer_id: Mapped[str] = mapped_column(String, index=True)
    referred_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    rewarded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Event(Base):
    __tablename__ = "events"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    owner_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String, index=True)
    props: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class JobRun(Base):
    __tablename__ = "job_runs"
    __table_args__ = (UniqueConstraint("job", "day", name="uq_job_run_day"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    job: Mapped[str] = mapped_column(String, index=True)
    day: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class SavedSearch(Base):
    __tablename__ = "saved_searches"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(String, index=True)
    title: Mapped[str] = mapped_column(String, default="Мой поиск")
    filters: Mapped[str] = mapped_column(Text, default="{}")
    notify: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("match_id", "rater_id", name="uq_review_match_rater"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), index=True)
    rater_id: Mapped[str] = mapped_column(String, index=True)
    ratee_id: Mapped[str] = mapped_column(String, index=True)
    stars: Mapped[int] = mapped_column(Integer, default=5)
    text: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("owner_id", "vacancy_id", name="uq_favorite"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(String, index=True)
    vacancy_id: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    reporter_id: Mapped[str] = mapped_column(String, index=True)
    target_type: Mapped[str] = mapped_column(String)
    target_id: Mapped[str] = mapped_column(String, index=True)
    reason: Mapped[str] = mapped_column(String)
    text: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Commission(Base):
    __tablename__ = "commissions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    employer_id: Mapped[str] = mapped_column(ForeignKey("employers.id"), index=True)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), unique=True)
    shift_pay: Mapped[int] = mapped_column(Integer, default=0)
    amount: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="pending")
    note: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
