"""Авторизация: телефон → SMS-код → JWT."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employer, PhoneCode, User
from ..schemas import RequestCodeIn, RequestCodeOut, TokenOut, VerifyIn
from ..security import create_token
from ..sms import generate_code, send_code

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-code", response_model=RequestCodeOut)
def request_code(body: RequestCodeIn, db: Session = Depends(get_db)):
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
    record = db.get(PhoneCode, body.phone)
    if record is None or record.code != body.code:
        raise HTTPException(status_code=400, detail="Неверный код")
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
