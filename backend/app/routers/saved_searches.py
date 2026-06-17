"""Сохранённые поиски + алерты о новых подходящих сменах."""
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import SavedSearch, Vacancy
from ..notify import notify_owner
from ..security import current_principal

router = APIRouter(prefix="/saved-searches", tags=["saved-searches"])


class SavedSearchIn(BaseModel):
    title: str = "Мой поиск"
    filters: dict = {}
    notify: bool = True


class SavedSearchOut(BaseModel):
    id: str
    title: str
    filters: dict
    notify: bool


def _to_out(s: SavedSearch) -> SavedSearchOut:
    try:
        flt = json.loads(s.filters)
    except json.JSONDecodeError:
        flt = {}
    return SavedSearchOut(id=s.id, title=s.title, filters=flt, notify=s.notify)


@router.get("", response_model=list[SavedSearchOut])
def list_searches(
    principal: dict = Depends(current_principal), db: Session = Depends(get_db)
):
    rows = (
        db.query(SavedSearch)
        .filter(SavedSearch.owner_id == principal["id"])
        .order_by(SavedSearch.created_at.desc())
        .all()
    )
    return [_to_out(s) for s in rows]


@router.post("", response_model=SavedSearchOut, status_code=201)
def create_search(
    body: SavedSearchIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    s = SavedSearch(
        owner_id=principal["id"],
        title=body.title[:60],
        filters=json.dumps(body.filters, ensure_ascii=False),
        notify=body.notify,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _to_out(s)


@router.delete("/{search_id}")
def delete_search(
    search_id: str,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    s = db.get(SavedSearch, search_id)
    if s is None or s.owner_id != principal["id"]:
        raise HTTPException(status_code=404, detail="Поиск не найден")
    db.delete(s)
    db.commit()
    return {"ok": True}


def _matches(flt: dict, v: Vacancy) -> bool:
    # Город — главный фильтр: алерт о смене не в своём городе бесполезен.
    if flt.get("city") and (v.city or "").strip().lower() != str(
        flt["city"]
    ).strip().lower():
        return False
    if flt.get("role") and v.role != flt["role"]:
        return False
    if flt.get("min_rate") is not None and v.rate < int(flt["min_rate"]):
        return False
    if flt.get("rate_type") and v.rate_type != flt["rate_type"]:
        return False
    if flt.get("no_med_book") and v.require_med_book:
        return False
    if flt.get("no_experience") and v.require_experience:
        return False
    return True


def notify_matching_searches(vacancy_id: str, max_notify: int = 200) -> int:
    """Оповестить владельцев подходящих поисков. Запускается фоновой задачей —
    открывает свою сессию (сессия запроса уже закрыта) и ограничена сверху."""
    from ..db import SessionLocal

    db = SessionLocal()
    sent = 0
    try:
        vacancy = db.get(Vacancy, vacancy_id)
        if vacancy is None:
            return 0
        searches = (
            db.query(SavedSearch)
            .filter(SavedSearch.notify.is_(True))
            .limit(2000)
            .all()
        )
        for s in searches:
            if sent >= max_notify:
                break
            try:
                flt = json.loads(s.filters)
            except json.JSONDecodeError:
                continue
            if _matches(flt, vacancy):
                notify_owner(
                    db,
                    s.owner_id,
                    f"🔔 Новая смена по вашему поиску «{s.title}»: "
                    f"{vacancy.role}, {vacancy.rate} ₽. Откройте StaffSwipe.",
                )
                sent += 1
        return sent
    finally:
        db.close()
