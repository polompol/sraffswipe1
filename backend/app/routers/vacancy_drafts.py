"""Сохранение неполной формы; публикация атомарна и безопасна при повторе."""

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employer, Vacancy, VacancyDraft
from ..ratelimit import hit, rate_limit
from ..schemas import (
    IsoDate,
    Longish,
    PhotoUrl,
    Short,
    StaffRole,
    VacancyIn,
    VacancyOut,
)
from ..security import current_principal
from .vacancies import _check_photo, _to_out, after_publish, prepare_vacancy

router = APIRouter(prefix="/vacancy-drafts", tags=["vacancy-drafts"])
MAX_DRAFTS = 50


class DraftFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: StaffRole = "waiter"
    date: IsoDate | None = None
    start_time: int | None = Field(default=600, ge=0, le=1439)
    end_time: int | None = Field(default=1320, ge=0, le=1439)
    rate: int | None = Field(default=350, ge=0, le=1_000_000)
    rate_type: Literal["perHour", "perShift"] = "perHour"
    headcount: int = Field(default=1, ge=1, le=20)
    pay_method: Literal["cash", "card", "transfer"] = "cash"
    tips: Literal["none", "individual", "shared"] = "none"
    description: Longish = ""
    require_med_book: bool = True
    require_experience: bool = False
    lat: float = Field(default=0, ge=-90, le=90)
    lng: float = Field(default=0, ge=-180, le=180)
    address: Short = ""
    city: Short = ""
    interior_photo_url: PhotoUrl = ""
    step: int = Field(default=0, ge=0, le=2)


class DraftSaveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(default=0, ge=0)
    data: DraftFields


class DraftVersionIn(BaseModel):
    version: int = Field(ge=1)


class DraftOut(BaseModel):
    id: str
    version: int
    data: DraftFields
    updated_at: datetime


def _out(draft: VacancyDraft) -> DraftOut:
    return DraftOut(
        id=draft.id,
        version=draft.version,
        data=DraftFields.model_validate(draft.payload),
        updated_at=draft.updated_at.replace(tzinfo=UTC),
    )


def _employer(db: Session, principal: dict, *, lock: bool = False) -> Employer:
    if principal["role"] != "employer":
        raise HTTPException(403, "Только для работодателя")
    q = db.query(Employer).filter(Employer.id == principal["id"])
    if lock:
        q = q.with_for_update()
    emp = q.first()
    if emp is None:
        raise HTTPException(404, "Работодатель не найден")
    return emp


def _own(db: Session, draft_id: UUID, emp: Employer) -> VacancyDraft:
    draft = db.get(VacancyDraft, str(draft_id))
    if draft is None or draft.employer_id != emp.id or draft.deleted:
        raise HTTPException(404, "Черновик не найден")
    return draft


def _editable(draft: VacancyDraft) -> None:
    if draft.published_vacancy_id:
        raise HTTPException(409, "Черновик уже опубликован. Откройте «Мои смены».")


def _conflict() -> HTTPException:
    return HTTPException(
        409,
        "Черновик изменён на другом устройстве. Откройте свежую версию "
        "из списка; ваши поля пока остаются на экране.",
    )


@router.get("", response_model=list[DraftOut])
def list_drafts(
    db: Session = Depends(get_db), principal: dict = Depends(current_principal)
):
    emp = _employer(db, principal)
    return [
        _out(d)
        for d in db.query(VacancyDraft)
        .filter(
            VacancyDraft.employer_id == emp.id,
            VacancyDraft.published_vacancy_id.is_(None),
            VacancyDraft.deleted.is_(False),
        )
        .order_by(VacancyDraft.updated_at.desc(), VacancyDraft.id)
        .limit(MAX_DRAFTS)
        .all()
    ]


@router.get("/{draft_id}", response_model=DraftOut)
def get_draft(
    draft_id: UUID,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    draft = _own(db, draft_id, _employer(db, principal))
    _editable(draft)
    return _out(draft)


@router.put(
    "/{draft_id}",
    response_model=DraftOut,
    dependencies=[Depends(rate_limit("draft-save", 60, 60))],
)
def save_draft(
    draft_id: UUID,
    body: DraftSaveIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    emp = _employer(db, principal, lock=True)
    payload = body.data.model_dump()
    _check_photo(body.data.interior_photo_url, emp.id)
    draft = db.get(VacancyDraft, str(draft_id))
    if draft is None:
        if body.version != 0:
            raise HTTPException(404, "Черновик не найден")
        count = (
            db.query(VacancyDraft)
            .filter(
                VacancyDraft.employer_id == emp.id,
                VacancyDraft.deleted.is_(False),
                VacancyDraft.published_vacancy_id.is_(None),
            )
            .count()
        )
        if count >= MAX_DRAFTS:
            raise HTTPException(
                409,
                "Можно сохранить до 50 черновиков. "
                "Удалите или опубликуйте один из них.",
            )
        draft = VacancyDraft(id=str(draft_id), employer_id=emp.id, payload=payload)
        db.add(draft)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            draft = _own(db, draft_id, emp)
            if draft.version != 1 or draft.payload != payload:
                raise _conflict() from None
        db.refresh(draft)
        return _out(draft)
    draft = _own(db, draft_id, emp)
    _editable(draft)
    # Повтор после потери ответа: то же содержимое и ровно следующая версия.
    if draft.version == body.version + 1 and draft.payload == payload:
        return _out(draft)
    if draft.version != body.version:
        raise _conflict()
    changed = (
        db.query(VacancyDraft)
        .filter(
            VacancyDraft.id == draft.id,
            VacancyDraft.version == body.version,
            VacancyDraft.deleted.is_(False),
            VacancyDraft.published_vacancy_id.is_(None),
        )
        .update(
            {
                "payload": payload,
                "version": body.version + 1,
                "updated_at": datetime.now(UTC),
            },
            synchronize_session=False,
        )
    )
    if not changed:
        raise _conflict()
    db.commit()
    db.refresh(draft)
    return _out(draft)


@router.delete("/{draft_id}", status_code=204)
def delete_draft(
    draft_id: UUID,
    version: int = Query(ge=1),
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    draft = _own(db, draft_id, _employer(db, principal, lock=True))
    _editable(draft)
    changed = (
        db.query(VacancyDraft)
        .filter(
            VacancyDraft.id == draft.id,
            VacancyDraft.version == version,
            VacancyDraft.deleted.is_(False),
            VacancyDraft.published_vacancy_id.is_(None),
        )
        .update(
            {"deleted": True, "payload": {}, "version": version + 1},
            synchronize_session=False,
        )
    )
    if not changed:
        raise _conflict()
    db.commit()


@router.post(
    "/{draft_id}/publish",
    response_model=VacancyOut,
    dependencies=[Depends(rate_limit("draft-publish-attempt", 60, 60))],
)
def publish_draft(
    draft_id: UUID,
    body: DraftVersionIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    emp = _employer(db, principal, lock=True)
    draft = _own(db, draft_id, emp)
    if draft.published_vacancy_id:
        return _to_out(db.get(Vacancy, draft.published_vacancy_id), emp, None)
    if draft.version != body.version:
        raise _conflict()
    try:
        data = VacancyIn.model_validate(
            {k: v for k, v in draft.payload.items() if k != "step"}
        )
    except ValidationError as exc:
        raise HTTPException(
            422, "Проверьте поля смены: " + exc.errors()[0]["msg"]
        ) from None
    if not data.city.strip():
        raise HTTPException(422, "Укажите город смены")
    # Сначала захватываем версию UPDATE-запросом: на SQLite FOR UPDATE нет.
    claimed = (
        db.query(VacancyDraft)
        .filter(
            VacancyDraft.id == draft.id,
            VacancyDraft.version == body.version,
            VacancyDraft.deleted.is_(False),
            VacancyDraft.published_vacancy_id.is_(None),
        )
        .update({"version": body.version + 1}, synchronize_session=False)
    )
    if not claimed:
        db.expire(draft)
        if draft.published_vacancy_id:
            return _to_out(db.get(Vacancy, draft.published_vacancy_id), emp, None)
        raise _conflict()
    vacancy = prepare_vacancy(db, emp, data)
    # Квитанция и ошибки заполнения не расходуют квоту НОВЫХ публикаций.
    # Если лимит исчерпан, незакоммиченные vacancy и версия откатятся вместе.
    hit(f"vacancy:{emp.id}", 10, 3600)
    draft.published_vacancy_id = vacancy.id
    db.commit()
    db.refresh(vacancy)
    after_publish(db, background, vacancy)
    return _to_out(vacancy, emp, None)
