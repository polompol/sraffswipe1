"""Pydantic-схемы запросов/ответов."""
from pydantic import BaseModel


# ---- auth ----
class RequestCodeIn(BaseModel):
    phone: str
    role: str = "seeker"  # seeker|employer


class RequestCodeOut(BaseModel):
    sent: bool
    dev_code: str | None = None  # заполняется только в dev_mode


class VerifyIn(BaseModel):
    phone: str
    code: str
    role: str = "seeker"


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str


# ---- vacancies ----
class VacancyIn(BaseModel):
    role: str
    date: str
    start_time: int
    end_time: int
    rate: int
    rate_type: str = "perHour"
    description: str = ""
    require_med_book: bool = False
    require_experience: bool = False
    lat: float = 0.0
    lng: float = 0.0
    address: str = ""
    interior_photo_url: str = ""


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
    description: str
    require_med_book: bool
    require_experience: bool
    lat: float
    lng: float
    address: str
    interior_photo_url: str
    status: str
    distance_km: float | None = None


# ---- swipes / matches ----
class SwipeIn(BaseModel):
    target_id: str
    target_type: str  # vacancy|user
    direction: str  # like|superlike|dislike


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


# ---- chat ----
class MessageIn(BaseModel):
    text: str


class MessageOut(BaseModel):
    id: str
    match_id: str
    sender_id: str
    text: str
    is_system: bool
