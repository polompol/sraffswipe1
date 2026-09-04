"""Аналитика воронки: приём событий + агрегаты."""
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Employer, Event, Match, User
from ..ratelimit import client_ip, hit
from ..security import current_principal, optional_principal

router = APIRouter(tags=["analytics"])

# Ключевые шаги воронки. Первые два знают только события с клиента
# («открыл приложение», «свайпнул»), остальные считаются по фактам в базе —
# так цифра не зависит от того, дошло ли событие с телефона.
FUNNEL = ["open", "swipe", "match", "confirm", "done"]

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
    request: Request,
    db: Session = Depends(get_db),
    principal: dict | None = Depends(optional_principal),
):
    # Защита от раздувания БД: потолок размера props + частота.
    # Раньше комментарий обещал, что анонимный поток ограничит Caddy, — но
    # никакого лимита на прокси нет, и это была единственная ручка без
    # авторизации, которая ПИШЕТ в базу. Теперь аноним ограничен по адресу.
    if principal:
        hit(f"events:{principal['id']}", 120, 60)
    else:
        hit(f"events-ip:{client_ip(request)}", 120, 60)
    # Служебные имена, которые клиент присылать не вправе:
    #   source — атрибуция, пишется только при регистрации (_track_source);
    #            иначе статистику источников можно накрутить снаружи;
    #   job    — отметки планировщика. Они переехали в свою таблицу, но имя
    #            держим закрытым и здесь: одна публичная ручка, пишущая в базу
    #            под именем на выбор клиента, уже однажды позволила
    #            останавливать все ежедневные задачи сервиса.
    name = body.name[:64]
    if name in {"source", "job"}:
        raise HTTPException(status_code=400, detail="Зарезервированное имя")
    # Обрезаем ДО сериализации, а не после. Раньше готовый JSON рубился по
    # длине посреди строки, и в базу ложился обломок, который потом не
    # прочитать: аналитика по такому событию просто падала.
    raw = {}
    for k, v in (body.props or {}).items():
        if len(json.dumps(raw | {k: v}, ensure_ascii=False)) > _MAX_PROPS_CHARS:
            break
        raw[k] = v
    props = json.dumps(raw, ensure_ascii=False)
    db.add(Event(
        owner_id=principal["id"] if principal else None,
        name=name,
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
    # Мэтчи, подтверждения и закрытые смены берём из таблицы смен: это
    # состоявшиеся факты. Шага «покупка» здесь больше нет — покупать в
    # сервисе нечего, и он всегда показывал ноль.
    matches = db.query(func.count(Match.id)).scalar() or 0
    confirmed = (
        db.query(func.count(Match.id))
        .filter(Match.status.in_(("confirmed", "completed")))
        .scalar()
        or 0
    )
    done = (
        db.query(func.count(Match.id))
        .filter(Match.status == "completed")
        .scalar()
        or 0
    )
    return FunnelOut(counts={
        "open": by_name.get("open", 0),
        "swipe": by_name.get("swipe", 0),
        "match": matches,
        "confirm": confirmed,
        "done": done,
    })
