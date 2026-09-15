"""Operator queue for tracked support cases.

Kept separate from Trust & Safety reports: a support request belongs to the
person asking for help, while a report is a moderation signal about another
entity. Both use the same admin authorization and append-only audit trail.
"""
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..admin_audit import record_admin_action
from ..db import get_db
from ..models import Employer, User
from ..notify import notify_owner
from ..support_cases import SupportCase, case_number
from .admin import require_admin

router = APIRouter(prefix="/admin/support", tags=["admin"])


class SupportReplyIn(BaseModel):
    reply: str = Field(max_length=2000)

    @field_validator("reply")
    @classmethod
    def clean_reply(cls, value: str) -> str:
        reply = value.strip()
        if len(reply) < 2:
            raise ValueError("Напишите ответ пользователю")
        return reply


class SupportCloseIn(BaseModel):
    reply: str = Field(default="", max_length=2000)

    @field_validator("reply")
    @classmethod
    def clean_reply(cls, value: str) -> str:
        return value.strip()


def _owner_info(db: Session, row: SupportCase) -> str:
    if row.owner_role == "employer":
        owner = db.get(Employer, row.owner_id)
        return (owner.company_name if owner else "") or "Заведение"
    owner = db.get(User, row.owner_id)
    return (owner.name if owner else "") or "Работник"


def _out(row: SupportCase, owner_info: str = "") -> dict:
    return {
        "id": row.id,
        "number": case_number(row.id),
        "ownerId": row.owner_id,
        "ownerRole": row.owner_role,
        "ownerInfo": owner_info,
        "topic": row.topic,
        "text": row.text,
        "status": row.status,
        "adminReply": row.admin_reply,
        "createdAt": row.created_at.isoformat(),
        "updatedAt": row.updated_at.isoformat(),
    }


def _case_or_404(db: Session, case_id: str) -> SupportCase:
    row = db.get(SupportCase, case_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    return row


@router.get("")
def list_support_cases(
    status: str = Query(default="open", pattern="^(open|all)$"),
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    q = db.query(SupportCase)
    if status == "open":
        # `answered` остаётся в рабочей очереди, пока оператор явно не закрыл
        # обращение. Иначе первый ответ прятал бы незавершённый вопрос.
        q = q.filter(SupportCase.status != "closed")
    rows = q.order_by(SupportCase.created_at.desc()).limit(100).all()
    return [_out(row, _owner_info(db, row)) for row in rows]


@router.post("/{case_id}/reply")
def reply_support_case(
    case_id: str,
    body: SupportReplyIn,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    row = _case_or_404(db, case_id)
    row.admin_reply = body.reply
    row.status = "answered"
    row.updated_at = datetime.now(UTC)
    record_admin_action(
        db,
        actor_id=admin["id"],
        action="support.reply",
        target_type="support_case",
        target_id=row.id,
        reason=body.reply,
    )
    db.commit()
    db.refresh(row)

    notify_owner(
        db,
        row.owner_id,
        f"По обращению {case_number(row.id)}: {body.reply}",
    )
    return _out(row, _owner_info(db, row))


@router.post("/{case_id}/close")
def close_support_case(
    case_id: str,
    body: SupportCloseIn | None = None,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    row = _case_or_404(db, case_id)
    reply = body.reply if body else ""
    if reply:
        row.admin_reply = reply
    row.status = "closed"
    row.updated_at = datetime.now(UTC)
    record_admin_action(
        db,
        actor_id=admin["id"],
        action="support.close",
        target_type="support_case",
        target_id=row.id,
        reason=reply,
    )
    db.commit()
    db.refresh(row)

    if reply:
        notify_owner(
            db,
            row.owner_id,
            f"По обращению {case_number(row.id)}: {reply}",
        )
    return _out(row, _owner_info(db, row))
