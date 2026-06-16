"""Авторизация через Telegram Mini App (initData → JWT). Замена SMS."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..entitlements import get_or_create
from ..models import Employer, Entitlement, Referral, User
from ..schemas import TokenOut
from ..security import create_token
from ..telegram import parse_start_param, parse_user, validate_init_data

router = APIRouter(prefix="/auth", tags=["auth"])


class TelegramAuthIn(BaseModel):
    init_data: str
    role: str = "seeker"  # seeker|employer
    start_param: str = ""  # dev-override реф-кода (в проде берётся из initData)


def _owner_exists(db, owner_id: str) -> bool:
    return (
        db.get(User, owner_id) is not None
        or db.get(Employer, owner_id) is not None
    )


def _apply_referral(db, referred_id: str, code: str) -> None:
    """Бонус рефереру за нового приглашённого. Один раз на приглашённого."""
    if not code.startswith("ref_"):
        return
    referrer_id = code[4:]
    if (
        not referrer_id
        or referrer_id == referred_id
        or not _owner_exists(db, referrer_id)
    ):
        return
    if db.query(Referral).filter(Referral.referred_id == referred_id).first():
        return
    db.add(Referral(referrer_id=referrer_id, referred_id=referred_id, rewarded=True))
    ent = get_or_create(db, referrer_id)
    ent.superlike_balance += settings.referral_bonus_superlikes
    db.commit()


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
    ref_code = body.start_param or parse_start_param(body.init_data)

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
            _apply_referral(db, emp.id, ref_code)
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
        _apply_referral(db, user.id, ref_code)
    return TokenOut(
        access_token=create_token(user.id, "seeker"),
        role="seeker",
        user_id=user.id,
    )
