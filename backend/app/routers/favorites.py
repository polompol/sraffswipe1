"""Избранные вакансии соискателя — сохранить смену и вернуться позже."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employer, Favorite, Vacancy
from ..schemas import VacancyOut
from ..security import current_principal

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.get("", response_model=list[VacancyOut])
def list_favorites(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Полные карточки сохранённых вакансий (свежие данные из БД)."""
    from .vacancies import _shifts_done_by_employer, _to_out

    fav_ids = [
        f.vacancy_id
        for f in db.query(Favorite.vacancy_id)
        .filter(Favorite.owner_id == principal["id"])
        .all()
    ]
    if not fav_ids:
        return []
    rows = db.query(Vacancy).filter(Vacancy.id.in_(fav_ids)).all()
    emp_ids = {v.employer_id for v in rows}
    emps = {
        e.id: e for e in db.query(Employer).filter(Employer.id.in_(emp_ids)).all()
    }
    done = _shifts_done_by_employer(db, emp_ids)
    return [
        _to_out(
            v, emps.get(v.employer_id), None,
            shifts_done=done.get(v.employer_id, 0),
        )
        for v in rows
    ]


@router.get("/ids", response_model=list[str])
def list_favorite_ids(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Только id — чтобы подсветить «сохранено» в ленте без тяжёлой выборки."""
    return [
        f.vacancy_id
        for f in db.query(Favorite.vacancy_id)
        .filter(Favorite.owner_id == principal["id"])
        .all()
    ]


@router.post("/{vacancy_id}")
def add_favorite(
    vacancy_id: str,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    if db.get(Vacancy, vacancy_id) is None:
        raise HTTPException(status_code=404, detail="Вакансия не найдена")
    exists = (
        db.query(Favorite)
        .filter(
            Favorite.owner_id == principal["id"],
            Favorite.vacancy_id == vacancy_id,
        )
        .first()
    )
    if not exists:
        db.add(Favorite(owner_id=principal["id"], vacancy_id=vacancy_id))
        db.commit()
    return {"saved": True}


@router.delete("/{vacancy_id}")
def remove_favorite(
    vacancy_id: str,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    db.query(Favorite).filter(
        Favorite.owner_id == principal["id"],
        Favorite.vacancy_id == vacancy_id,
    ).delete()
    db.commit()
    return {"saved": False}
