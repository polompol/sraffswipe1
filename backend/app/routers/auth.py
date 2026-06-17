"""Авторизация: телефон → SMS-код → JWT."""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employer, PhoneCode, User
from ..ratelimit import hit
from ..schemas import RequestCodeIn, RequestCodeOut, TokenOut, VerifyIn
from ..security import create_token
from ..sms import generate_code, send_code

router = APIRouter(prefix="/auth", tags=["auth"])

# Код живёт 10 минут — после этого считаем его недействительным.
_CODE_TTL = timedelta(minutes=10)


def _aware(dt: datetime) -> datetime:
    """SQLite отдаёт naive datetime — приводим к UTC для сравнения."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


@router.post("/request-code", response_model=RequestCodeOut)
def request_code(body: RequestCodeIn, db: Session = Depends(get_db)):
    # Анти-спам: не чаще 3 SMS в минуту на номер (защита от SMS-бомбинга).
    hit(f"req-code:{body.phone}", limit=3, window=60)
    code = generate_code()
    existing = db.get(PhoneCode, body.phone)
    if existing:
        existing.code = code
    else:
        db.add(PhoneCode(phone=body.phone, code=code))
    db.commit()
    send_code(body.phone, code)
    from ..config import settings

    return RequestCodeOut(sent=True, dev_code=code if settings.dev_mode else None)


@router.post("/verify", response_model=TokenOut)
def verify(body: VerifyIn, db: Session = Depends(get_db)):
    # Анти-брутфорс: не больше 5 попыток ввода кода в минуту на номер.
    hit(f"verify:{body.phone}", limit=5, window=60)
    record = db.get(PhoneCode, body.phone)
    if record is None or record.code != body.code:
        raise HTTPException(status_code=400, detail="Неверный код")
    # Просроченный код недействителен — удаляем и просим запросить заново.
    if datetime.now(UTC) - _aware(record.created_at) > _CODE_TTL:
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=400, detail="Код истёк, запросите новый")
    db.delete(record)

    if body.role == "employer":
        employer = (
            db.query(Employer).filter(Employer.phone == body.phone).first()
        )
        if employer is None:
            employer = Employer(phone=body.phone, contact_phone=body.phone)
            db.add(employer)
            db.commit()
            db.refresh(employer)
        token = create_token(employer.id, "employer")
        db.commit()
        return TokenOut(access_token=token, role="employer", user_id=employer.id)

    user = db.query(User).filter(User.phone == body.phone).first()
    if user is None:
        user = User(phone=body.phone)
        db.add(user)
        db.commit()
        db.refresh(user)
    token = create_token(user.id, "seeker")
    db.commit()
    return TokenOut(access_token=token, role="seeker", user_id=user.id)
