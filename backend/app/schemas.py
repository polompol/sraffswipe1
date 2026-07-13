"""Pydantic-схемы запросов/ответов."""
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Role = Literal["seeker", "employer"]
Phone = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^\+?\d{10,15}$")
]
Code = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^\d{4,8}$")
]
# Короткие строковые поля с разумным потолком длины (анти-абуз).
Short = Annotated[str, StringConstraints(max_length=120)]
Longish = Annotated[str, StringConstraints(max_length=2000)]


# ---- auth ----
class RequestCodeIn(BaseModel):
    phone: Phone
    role: Role = "seeker"


class RequestCodeOut(BaseModel):
    sent: bool
    dev_code: str | None = None  # заполняется только в dev_mode


class VerifyIn(BaseModel):
    phone: Phone
    code: Code
    role: Role = "seeker"


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str


# ---- vacancies ----
class VacancyIn(BaseModel):
    role: Short
    date: Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
    start_time: int = Field(ge=0, le=1440)
    end_time: int = Field(ge=0, le=1440)
    rate: int = Field(ge=0, le=1_000_000)
    rate_type: Literal["perHour", "perShift"] = "perHour"
    pay_method: Literal["cash", "card", "transfer"] = "cash"
    tips: Literal["none", "individual", "shared"] = "none"
    description: Longish = ""
    require_med_book: bool = False
    require_experience: bool = False
    lat: float = Field(default=0.0, ge=-90, le=90)
    lng: float = Field(default=0.0, ge=-180, le=180)
    address: Short = ""
    city: Short = ""
    interior_photo_url: Annotated[str, StringConstraints(max_length=500)] = ""


class VacancyOut(BaseModel):
    id: str
    employer_id: str
    company_name: str
    company_photo_url: str
    employer_verified: bool
    role: str
    date: str
    start_time: int
    end_time: int
    rate: int
    rate_type: str
    pay_method: str = "cash"
    tips: str = "none"
    description: str
    require_med_book: bool
    require_experience: bool
    lat: float
    lng: float
    address: str
    city: str = ""
    interior_photo_url: str
    status: str
    distance_km: float | None = None
    boosted: bool = False
    # Доверие к заведению (видно ДО отклика): рейтинг от соискателей,
    # сколько смен уже закрыто и признак «платит вовремя».
    employer_rating: float = 0.0
    employer_shifts_done: int = 0
    employer_pays_on_time: bool = False


# ---- swipes / matches ----
class SwipeIn(BaseModel):
    target_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    target_type: Literal["vacancy", "user"]
    direction: Literal["like", "superlike", "dislike"]


class SwipeOut(BaseModel):
    recorded: bool
    matched: bool
    match_id: str | None = None


class MatchOut(BaseModel):
    id: str
    user_id: str
    employer_id: str
    vacancy_id: str
    status: str
    confirmed_by_seeker: bool
    confirmed_by_employer: bool
    # Код прихода виден ТОЛЬКО заведению (называет работнику на месте).
    checkin_code: str | None = None
    checked_in: bool = False  # смена закрыта (обе стороны подтвердили)
    seeker_checked_in: bool = False
    employer_checked_in: bool = False
    disputed: bool = False
    shift_pay: int = 0  # оплата смены, ₽ (для празднования дохода в UI)


# ---- chat ----
class MessageIn(BaseModel):
    text: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
    ]


# ---- жалобы (trust & safety) ----
class ReportIn(BaseModel):
    target_type: Literal["vacancy", "user", "match"]
    target_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    reason: Literal["spam", "fake", "scam", "abuse", "other"]
    text: Annotated[str, StringConstraints(max_length=1000)] = ""


class MessageOut(BaseModel):
    id: str
    match_id: str
    sender_id: str
    text: str
    is_system: bool
