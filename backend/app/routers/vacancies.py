"""Лента вакансий и их создание."""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..entitlements import (
    PLAN_VACANCY_LIMIT,
    active_boost_vacancy_ids,
    active_vacancy_count,
    get_or_create,
    plan_of,
)
from ..geo import distance_km
from ..models import Boost, Employer, Vacancy
from ..ratelimit import rate_limit
from ..schemas import VacancyIn, VacancyOut
from ..security import current_principal

router = APIRouter(prefix="/vacancies", tags=["vacancies"])


def _to_out(
    v: Vacancy, emp: Employer | None, dist: float | None, boosted: bool = False
) -> VacancyOut:
    return VacancyOut(
        id=v.id,
        employer_id=v.employer_id,
        company_name=emp.company_name if emp else "",
        company_photo_url=emp.photo_url if emp else "",
        employer_verified=emp.verified if emp else False,
        role=v.role,
        date=v.date,
        start_time=v.start_time,
        end_time=v.end_time,
        rate=v.rate,
        rate_type=v.rate_type,
        description=v.description,
        require_med_book=v.require_med_book,
        require_experience=v.require_experience,
        lat=v.lat,
        lng=v.lng,
        address=v.address,
        interior_photo_url=v.interior_photo_url,
        status=v.status,
        distance_km=round(dist, 1) if dist is not None else None,
        boosted=boosted,
    )


@router.get("", response_model=list[VacancyOut])
def list_vacancies(
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float = 25.0,
    role: str | None = None,
    min_rate: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    rate_type: str | None = None,
    no_med_book: bool = False,
    no_experience: bool = False,
    verified_only: bool = False,
    sort: str = "distance",  # distance|rate|date
    db: Session = Depends(get_db),
):
    """Активные вакансии с фильтрами. Boost-вакансии всегда наверху."""
    boosted_ids = active_boost_vacancy_ids(db)
    query = db.query(Vacancy).filter(Vacancy.status == "active")
    if role:
        query = query.filter(Vacancy.role == role)
    if min_rate is not None:
        query = query.filter(Vacancy.rate >= min_rate)
    if rate_type:
        query = query.filter(Vacancy.rate_type == rate_type)
    if no_med_book:
        query = query.filter(Vacancy.require_med_book.is_(False))
    if no_experience:
        query = query.filter(Vacancy.require_experience.is_(False))
    if date_from:
        query = query.filter(Vacancy.date >= date_from)
    if date_to:
        query = query.filter(Vacancy.date <= date_to)
    result: list[VacancyOut] = []
    for v in query.all():
        emp = db.get(Employer, v.employer_id)
        if verified_only and not (emp and emp.verified):
            continue
        dist = None
        if lat is not None and lng is not None:
            dist = distance_km(lat, lng, v.lat, v.lng)
            if dist > radius_km:
                continue
        result.append(_to_out(v, emp, dist, boosted=v.id in boosted_ids))

    # Boost всегда наверху; внутри группы — по выбранной сортировке.
    def _key(x: VacancyOut):
        if sort == "rate":
            return (not x.boosted, -x.rate)
        if sort == "date":
            return (not x.boosted, x.date)
        return (not x.boosted, x.distance_km if x.distance_km is not None else 1e9)

    result.sort(key=_key)
    return result


@router.post(
    "",
    response_model=VacancyOut,
    status_code=201,
    dependencies=[Depends(rate_limit("vacancy", 20, 60))],
)
def create_vacancy(
    body: VacancyIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    emp = db.get(Employer, principal["id"])
    if emp is None:
        raise HTTPException(status_code=404, detail="Работодатель не найден")

    # Лимит тарифа Free на число активных вакансий.
    limit = PLAN_VACANCY_LIMIT.get(plan_of(db, emp.id))
    if limit is not None and active_vacancy_count(db, emp.id) >= limit:
        raise HTTPException(
            status_code=402,
            detail="Лимит тарифа Free. Оформите Pro для большего числа вакансий.",
        )

    v = Vacancy(employer_id=emp.id, **body.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    # Алерты владельцам сохранённых поисков, подходящих под новую смену.
    from .saved_searches import notify_matching_searches

    notify_matching_searches(db, v)
    return _to_out(v, emp, None)


@router.post("/{vacancy_id}/boost")
def boost_vacancy(
    vacancy_id: str,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Поднять вакансию в топ ленты на 24 часа, списав 1 boost с баланса."""
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    v = db.get(Vacancy, vacancy_id)
    if v is None or v.employer_id != principal["id"]:
        raise HTTPException(status_code=404, detail="Вакансия не найдена")
    ent = get_or_create(db, principal["id"])
    if ent.boost_balance < 1:
        raise HTTPException(status_code=402, detail="Нет boost на балансе")
    ent.boost_balance -= 1
    expires = (datetime.now(UTC) + timedelta(hours=24)).isoformat()
    db.add(Boost(vacancy_id=vacancy_id, expires_at=expires))
    db.commit()
    return {"ok": True, "boostBalance": ent.boost_balance, "expiresAt": expires}
