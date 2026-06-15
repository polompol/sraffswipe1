"""Лента вакансий и их создание."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..geo import distance_km
from ..models import Employer, Vacancy
from ..schemas import VacancyIn, VacancyOut
from ..security import current_principal

router = APIRouter(prefix="/vacancies", tags=["vacancies"])


def _to_out(v: Vacancy, emp: Employer | None, dist: float | None) -> VacancyOut:
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
    )


@router.get("", response_model=list[VacancyOut])
def list_vacancies(
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float = 25.0,
    db: Session = Depends(get_db),
):
    """Активные вакансии. При заданных lat/lng — фильтр по радиусу и сортировка."""
    query = db.query(Vacancy).filter(Vacancy.status == "active")
    result: list[VacancyOut] = []
    for v in query.all():
        emp = db.get(Employer, v.employer_id)
        dist = None
        if lat is not None and lng is not None:
            dist = distance_km(lat, lng, v.lat, v.lng)
            if dist > radius_km:
                continue
        result.append(_to_out(v, emp, dist))
    if lat is not None and lng is not None:
        result.sort(key=lambda x: x.distance_km or 1e9)
    return result


@router.post("", response_model=VacancyOut, status_code=201)
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
    v = Vacancy(employer_id=emp.id, **body.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return _to_out(v, emp, None)
