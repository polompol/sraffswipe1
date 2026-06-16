"""Авторизация через Telegram Mini App (initData → JWT). Замена SMS."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Employer, Entitlement, User
from ..schemas import TokenOut
from ..security import create_token
from ..telegram import parse_user, validate_init_data

router = APIRouter(prefix="/auth", tags=["auth"])


class TelegramAuthIn(BaseModel):
    init_data: str
    role: str = "seeker"  # seeker|employer


@router.post("/telegram", response_model=TokenOut)
def telegram_login(body: TelegramAuthIn, db: Session = Depends(get_db)):
    valid = validate_init_data(body.init_data, settings.telegram_bot_token)
    if not valid and not settings.allow_insecure_telegram_auth:
        raise HTTPException(status_code=401, detail="Невалидный initData")

    tg_user = parse_user(body.init_data) or {}
    tg_id = tg_user.get("id")
    if tg_id is None and not settings.allow_insecure_telegram_auth:
        raise HTTPException(status_code=401, detail="Нет данных пользователя")

    # В insecure/dev-режиме без подписи используем стабильный демо-id.
    if tg_id is None:
        tg_id = 0
    username = tg_user.get("username")
    name = tg_user.get("first_name", "")

    if body.role == "employer":
        emp = db.query(Employer).filter(Employer.tg_id == tg_id).first()
        if emp is None:
            emp = Employer(
                tg_id=tg_id,
                tg_username=username,
                phone=f"tg:{tg_id}",
                contact_phone="",
                company_name=name or "Заведение",
            )
            db.add(emp)
            db.flush()
            db.add(Entitlement(owner_id=emp.id))
            db.commit()
            db.refresh(emp)
        return TokenOut(
            access_token=create_token(emp.id, "employer"),
            role="employer",
            user_id=emp.id,
        )

    user = db.query(User).filter(User.tg_id == tg_id).first()
    if user is None:
        user = User(
            tg_id=tg_id,
            tg_username=username,
            phone=f"tg:{tg_id}",
            name=name,
        )
        db.add(user)
        db.flush()
        db.add(Entitlement(owner_id=user.id))
        db.commit()
        db.refresh(user)
    return TokenOut(
        access_token=create_token(user.id, "seeker"),
        role="seeker",
        user_id=user.id,
    )
