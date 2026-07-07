"""Аналитика воронки: приём событий + агрегаты."""
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Employer, Event, User
from ..ratelimit import hit
from ..security import current_principal, optional_principal

router = APIRouter(tags=["analytics"])

# Ключевые шаги воронки.
FUNNEL = ["open", "swipe", "match", "confirm", "purchase"]

# Максимальный размер сериализованных props события (анти-раздувание БД).
_MAX_PROPS_CHARS = 2000


def _is_admin(db: Session, principal: dict) -> bool:
    admins = {x.strip() for x in settings.admin_tg_ids.split(",") if x.strip()}
    if not admins:
        return False
    owner = db.get(User, principal["id"]) or db.get(Employer, principal["id"])
    return owner is not None and str(owner.tg_id) in admins


class EventIn(BaseModel):
    name: str
    props: dict | None = None


@router.post("/events")
def track(
    body: EventIn,
    db: Session = Depends(get_db),
    principal: dict | None = Depends(optional_principal),
):
    # Защита от раздувания БД: (1) потолок размера props — каждая запись
    # ограничена; (2) для авторизованных — рейт-лимит на принципала. Анонимный
    # поток (событие «открыл» до входа) ограничивается на уровне прокси (Caddy),
    # т.к. app-лимит без принципала завязан на IP, которого здесь нет.
    if principal:
        hit(f"events:{principal['id']}", 120, 60)
    props = json.dumps(body.props or {}, ensure_ascii=False)[:_MAX_PROPS_CHARS]
    db.add(Event(
        owner_id=principal["id"] if principal else None,
        name=body.name[:64],
        props=props,
    ))
    db.commit()
    return {"ok": True}


class FunnelOut(BaseModel):
    counts: dict[str, int]


@router.get("/analytics/funnel", response_model=FunnelOut)
def funnel(
    principal: dict = Depends(current_principal), db: Session = Depends(get_db)
):
    if not _is_admin(db, principal):
        raise HTTPException(status_code=403, detail="Только для администратора")
    rows = (
        db.query(Event.name, func.count(Event.id))
        .group_by(Event.name)
        .all()
    )
    by_name = {name: count for name, count in rows}
    return FunnelOut(counts={step: by_name.get(step, 0) for step in FUNNEL})
