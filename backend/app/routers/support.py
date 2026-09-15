"""Tracked in-app support requests owned by the authenticated account role."""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..db import get_db
from ..notify import notify_admins
from ..ratelimit import rate_limit
from ..security import current_principal
from ..support_cases import SupportCase, case_number

router = APIRouter(prefix="/support", tags=["support"])


class SupportCaseIn(BaseModel):
    topic: Literal["shift", "payment", "account", "safety", "other"]
    text: str = Field(max_length=2000)

    @field_validator("text")
    @classmethod
    def clean_text(cls, value: str) -> str:
        text = value.strip()
        if len(text) < 5:
            raise ValueError("Опишите проблему чуть подробнее")
        return text


def _out(row: SupportCase) -> dict:
    return {
        "id": row.id,
        "number": case_number(row.id),
        "topic": row.topic,
        "text": row.text,
        "status": row.status,
        "adminReply": row.admin_reply,
        "createdAt": row.created_at.isoformat(),
        "updatedAt": row.updated_at.isoformat(),
    }


@router.post(
    "/cases",
    status_code=201,
    dependencies=[Depends(rate_limit("support_case", 5, 60))],
)
def create_case(
    body: SupportCaseIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    row = SupportCase(
        owner_id=principal["id"],
        owner_role=principal["role"],
        topic=body.topic,
        text=body.text,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    preview = " ".join(row.text.split())[:120]
    notify_admins(
        f"🆘 Новое обращение {case_number(row.id)} · {row.topic}: {preview}. "
        "Откройте админ-панель StaffSwipe."
    )
    return _out(row)


@router.get("/cases")
def list_cases(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    rows = (
        db.query(SupportCase)
        .filter(
            SupportCase.owner_id == principal["id"],
            SupportCase.owner_role == principal["role"],
        )
        .order_by(SupportCase.created_at.desc())
        .limit(100)
        .all()
    )
    return [_out(row) for row in rows]
