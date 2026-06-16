"""Аналитика воронки: приём событий + агрегаты."""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Event
from ..security import current_principal, optional_principal

router = APIRouter(tags=["analytics"])

# Ключевые шаги воронки.
FUNNEL = ["open", "swipe", "match", "confirm", "purchase"]


class EventIn(BaseModel):
    name: str
    props: dict | None = None


@router.post("/events")
def track(
    body: EventIn,
    db: Session = Depends(get_db),
    principal: dict | None = Depends(optional_principal),
):
    db.add(Event(
        owner_id=principal["id"] if principal else None,
        name=body.name[:64],
        props=json.dumps(body.props or {}, ensure_ascii=False),
    ))
    db.commit()
    return {"ok": True}


class FunnelOut(BaseModel):
    counts: dict[str, int]


@router.get("/analytics/funnel", response_model=FunnelOut)
def funnel(
    _p: dict = Depends(current_principal), db: Session = Depends(get_db)
):
    rows = (
        db.query(Event.name, func.count(Event.id))
        .group_by(Event.name)
        .all()
    )
    by_name = {name: count for name, count in rows}
    return FunnelOut(counts={step: by_name.get(step, 0) for step in FUNNEL})
