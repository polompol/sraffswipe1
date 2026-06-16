"""Верификация работодателя по ИНН (DaData) + начисленное право verify."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..entitlements import get_or_create
from ..models import Employer
from ..security import current_principal
from .dadata import lookup_party

router = APIRouter(prefix="/employer", tags=["employer"])


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
