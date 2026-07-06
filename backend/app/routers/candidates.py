"""Лента кандидатов для работодателя."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Integer, func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Match, Swipe, User
from ..security import current_principal

router = APIRouter(tags=["candidates"])


class CandidateOut(BaseModel):
    id: str
    name: str
    birth_date: str
    city: str
    district: str
    lat: float
    lng: float
    roles: list[str]
    med_book: str
    self_employed: bool
    inn: str | None
    experience_tags: list[str]
    rating: float
    photo_urls: list[str]
    about: str
    available_today: bool = False
    # Надёжность: вышел на `attended` из `shifts_total` подтверждённых смен.
    shifts_total: int = 0
    shifts_attended: int = 0


def _csv(value: str) -> list[str]:
    return [x for x in (value or "").split(",") if x]


def _reliability(db: Session, user_ids: list[str]) -> dict[str, tuple[int, int]]:
    """{user_id: (всего подтверждённых смен, из них вышел)} — одним запросом."""
    if not user_ids:
        return {}
    rows = (
        db.query(
            Match.user_id,
            func.count(Match.id),
            func.sum(func.cast(Match.no_show, Integer)),
        )
        .filter(
            Match.user_id.in_(user_ids),
            Match.status.in_(("confirmed", "completed")),
        )
        .group_by(Match.user_id)
        .all()
    )
    out: dict[str, tuple[int, int]] = {}
    for uid, total, noshows in rows:
        total = int(total or 0)
        noshows = int(noshows or 0)
        out[uid] = (total, total - noshows)
    return out


@router.get("/candidates", response_model=list[CandidateOut])
def list_candidates(
    role: str | None = None,
    district: str | None = None,
    available_today: bool = False,
    reliable_only: bool = False,
    principal: dict = Depends(current_principal),
    db: Session = Depends(get_db),
):
    """Лента кандидатов для заведения. Фильтры: роль, район, «готов сегодня»,
    «надёжные» (без неявок). Роль/район фильтруем в Python — CSV-роли и
    кириллица корректнее, чем LIKE/lower() на SQLite."""
    # Ленту кандидатов с ПДн видит только работодатель.
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    # Не показываем кандидатов, которых работодатель уже свайпнул (иначе колода
    # зацикливается после «кандидаты закончились»).
    swiped = [
        s[0] for s in db.query(Swipe.target_id).filter(
            Swipe.swiper_id == principal["id"],
            Swipe.target_type == "user",
        ).all()
    ]
    # «Готов выйти сегодня» — наверх ленты: их зовут на срочные смены первыми.
    q = db.query(User).filter(User.blocked.is_(False))
    if swiped:
        q = q.filter(User.id.notin_(swiped))
    if available_today:
        q = q.filter(User.available_today.is_(True))
    rows = (
        q.order_by(User.available_today.desc(), User.rating.desc())
        .limit(200)
        .all()
    )
    role_f = role.strip() if role else None
    dist_f = district.strip().lower() if district else None

    def _match(u: User) -> bool:
        if role_f and role_f not in _csv(u.roles):
            return False
        if dist_f and (u.district or "").strip().lower() != dist_f:
            return False
        return True

    users = [u for u in rows if _match(u)][:50]
    rel = _reliability(db, [u.id for u in users])
    if reliable_only:
        # Надёжный = без единой неявки (вышел на все подтверждённые смены).
        users = [
            u for u in users
            if rel.get(u.id, (0, 0))[0] == rel.get(u.id, (0, 0))[1]
        ]
    return [
        CandidateOut(
            id=u.id,
            name=u.name,
            # Только год рождения (возраст считается на клиенте) — точную дату
            # не раскрываем в общей ленте.
            birth_date=(u.birth_date[:4] + "-01-01") if u.birth_date else "",
            city=u.city,
            district=u.district,
            # Точные координаты дома соискателя не раскрываем до мэтча —
            # отдаём только город/район. Защита от деанонимизации/сталкинга.
            lat=0.0,
            lng=0.0,
            roles=_csv(u.roles),
            med_book=u.med_book,
            self_employed=u.self_employed,
            # ИНН не отдаём в общей ленте — он попадает в акт уже после мэтча.
            inn=None,
            experience_tags=_csv(u.experience_tags),
            rating=u.rating,
            photo_urls=_csv(u.photo_urls),
            about=u.about,
            available_today=u.available_today,
            shifts_total=rel.get(u.id, (0, 0))[0],
            shifts_attended=rel.get(u.id, (0, 0))[1],
        )
        for u in users
    ]
