"""Верификация работодателя по ИНН (DaData) + «мои работники» / «позвать снова»."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..entitlements import get_or_create
from ..models import Employer, Match, Swipe, User
from ..notify import notify_owner
from ..security import current_principal
from .dadata import lookup_party

router = APIRouter(prefix="/employer", tags=["employer"])


class WorkerOut(BaseModel):
    id: str
    name: str
    rating: float
    available_today: bool
    shifts_total: int
    shifts_attended: int


@router.get("/workers", response_model=list[WorkerOut])
def my_workers(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Работники, которые уже выходили на смены этого заведения — чтобы позвать
    снова (постоянство — главная боль общепита)."""
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    from .candidates import _reliability

    user_ids = [
        uid for (uid,) in db.query(Match.user_id)
        .filter(
            Match.employer_id == principal["id"],
            Match.status.in_(("confirmed", "completed")),
        )
        .distinct()
        .all()
    ]
    if not user_ids:
        return []
    rel = _reliability(db, user_ids)
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    return [
        WorkerOut(
            id=u.id, name=u.name or "Соискатель", rating=u.rating,
            available_today=u.available_today,
            shifts_total=rel.get(u.id, (0, 0))[0],
            shifts_attended=rel.get(u.id, (0, 0))[1],
        )
        for u in users
    ]


@router.post("/invite/{user_id}")
def invite_again(
    user_id: str,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Позвать работника снова: фиксируем интерес заведения и шлём ему пинг."""
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    emp = db.get(Employer, principal["id"])
    if emp is None or db.get(User, user_id) is None:
        raise HTTPException(status_code=404, detail="Не найдено")
    exists = (
        db.query(Swipe)
        .filter(
            Swipe.swiper_id == principal["id"],
            Swipe.target_id == user_id,
            Swipe.target_type == "user",
        )
        .first()
    )
    if not exists:
        db.add(Swipe(
            swiper_id=principal["id"], target_id=user_id,
            target_type="user", direction="like",
        ))
        db.commit()
    notify_owner(db, user_id, f"Вас снова зовут на смену в «{emp.company_name}»")
    return {"ok": True}


class VerifyIn(BaseModel):
    inn: str


class VerifyOut(BaseModel):
    found: bool
    verified: bool
    name: str = ""
    ogrn: str = ""
    address: str = ""
    hint: str = ""


@router.post("/verify", response_model=VerifyOut)
def verify_employer(
    body: VerifyIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    emp = db.get(Employer, principal["id"])
    if emp is None:
        raise HTTPException(status_code=404, detail="Не найдено")

    party = lookup_party(body.inn)
    if party.found:
        emp.inn = party.inn or body.inn
        emp.ogrn = party.ogrn
        emp.address = party.address or emp.address
        if party.name:
            emp.company_name = party.name

    # Бейдж «Проверен» выдаётся только при оплаченной верификации (verify_year).
    ent = get_or_create(db, emp.id)
    if ent.employer_verified and party.found:
        emp.verified = True
    db.commit()

    hint = ""
    if not party.found:
        hint = "Организация не найдена в DaData (проверьте ИНН или ключ DaData)."
    elif not ent.employer_verified:
        hint = "Данные подтянуты. Бейдж «Проверен» — после оплаты верификации."

    return VerifyOut(
        found=party.found,
        verified=emp.verified,
        name=emp.company_name,
        ogrn=emp.ogrn,
        address=emp.address,
        hint=hint,
    )
