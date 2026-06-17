"""Лента кандидатов для работодателя."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
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


def _csv(value: str) -> list[str]:
    return [x for x in (value or "").split(",") if x]


@router.get("/candidates", response_model=list[CandidateOut])
def list_candidates(
    principal: dict = Depends(current_principal), db: Session = Depends(get_db)
):
    # Ленту кандидатов с ПДн видит только работодатель.
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    users = db.query(User).limit(50).all()
    return [
        CandidateOut(
            id=u.id,
            name=u.name,
            birth_date=u.birth_date,
            city=u.city,
            district=u.district,
            lat=u.lat,
            lng=u.lng,
            roles=_csv(u.roles),
            med_book=u.med_book,
            self_employed=u.self_employed,
            # ИНН не отдаём в общей ленте — он попадает в акт уже после мэтча.
            inn=None,
            experience_tags=_csv(u.experience_tags),
            rating=u.rating,
            photo_urls=_csv(u.photo_urls),
            about=u.about,
        )
        for u in users
    ]
