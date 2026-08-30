"""Авторизация: телефон → SMS-код → JWT."""
import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employer, PhoneCode, User
from ..ratelimit import hit, rate_limit, rate_limit_ip
from ..schemas import RequestCodeIn, RequestCodeOut, TokenOut, VerifyIn
from ..security import (
    DOC_TOKEN_TTL,
    create_token,
    current_principal,
    secure_equals,
)
from ..sms import generate_code, send_code

router = APIRouter(prefix="/auth", tags=["auth"])
_log = logging.getLogger("staffswipe")


def _sms_enabled() -> None:
    """Вход по SMS открыт, только если реально подключён шлюз.

    Это запасная дверь на случай, если бота заблокируют (см. docs/START-TODAY.md).
    Пока шлюза нет, дверь закрыта наглухо: приложение ею не пользуется вовсе —
    вход идёт по подписи Telegram, — а открытая ручка позволяла заводить
    аккаунты в обход Telegram. Такой аккаунт живёт без tg_id, а значит не
    получает ни одного уведомления: ни про мэтч, ни про смену, ни про деньги.
    Заведение с таким аккаунтом при этом может публиковать смены.

    Ответ 404, а не 403: снаружи не должно быть видно даже того, что дверь есть.
    """
    from ..config import settings

    if settings.sms_provider == "none" and not settings.dev_mode:
        raise HTTPException(status_code=404, detail="Not Found")

# Код живёт 10 минут — после этого считаем его недействительным.
_CODE_TTL = timedelta(minutes=10)


def _aware(dt: datetime) -> datetime:
    """SQLite отдаёт naive datetime — приводим к UTC для сравнения."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


@router.post(
    "/request-code",
    response_model=RequestCodeOut,
    # Лимит по номеру защищает один номер, но номеров бесконечно много: скрипт
    # перебирал +79XXXXXXXXX и без счётчика бесконечно раздувал таблицу кодов.
    # Сейчас SMS не подключены и это стоит только места в базе, но в день
    # подключения реального шлюза та же ручка стала бы SMS-бомбой и прямым
    # счётом владельцу.
    dependencies=[Depends(rate_limit_ip("req-code", 10, 3600))],
)
def request_code(body: RequestCodeIn, db: Session = Depends(get_db)):
    _sms_enabled()
    # Анти-спам: не чаще 3 SMS в минуту на номер (защита от SMS-бомбинга).
    hit(f"req-code:{body.phone}", limit=3, window=60)
    code = generate_code()
    existing = db.get(PhoneCode, body.phone)
    if existing:
        existing.code = code
        # И время выдачи тоже: без этого повторно запрошенный код наследовал
        # срок первого и приходил уже просроченным — человек получал «код
        # истёк» на только что присланный код.
        existing.created_at = datetime.now(UTC)
    else:
        db.add(PhoneCode(phone=body.phone, code=code))
    db.commit()
    # Сбой SMS-шлюза не должен ронять запрос 500-й без объяснения. Код уже в
    # БД; при ошибке отправки просим повторить.
    try:
        send_code(body.phone, code)
    except Exception as e:  # noqa: BLE001 — любой сбой провайдера
        _log.error("SMS send failed: %s", e)
        raise HTTPException(
            status_code=502, detail="Не удалось отправить код. Попробуйте ещё раз."
        ) from e
    from ..config import settings

    return RequestCodeOut(sent=True, dev_code=code if settings.dev_mode else None)


@router.post("/verify", response_model=TokenOut)
def verify(body: VerifyIn, db: Session = Depends(get_db)):
    _sms_enabled()
    # Анти-брутфорс: не больше 5 попыток ввода кода в минуту на номер.
    hit(f"verify:{body.phone}", limit=5, window=60)
    record = db.get(PhoneCode, body.phone)
    # Тайминг-безопасное сравнение — не даём по времени ответа подбирать код.
    if record is None or not secure_equals(record.code, body.code):
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
        if employer is not None and employer.blocked:
            raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
        if employer is None:
            employer = Employer(phone=body.phone, contact_phone=body.phone)
            db.add(employer)
            db.commit()
            db.refresh(employer)
        token = create_token(employer.id, "employer", employer.token_version)
        db.commit()
        return TokenOut(access_token=token, role="employer", user_id=employer.id)

    user = db.query(User).filter(User.phone == body.phone).first()
    if user is not None and user.blocked:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
    if user is None:
        user = User(phone=body.phone)
        db.add(user)
        db.commit()
        db.refresh(user)
    token = create_token(user.id, "seeker", user.token_version)
    db.commit()
    return TokenOut(access_token=token, role="seeker", user_id=user.id)


class DocTokenOut(BaseModel):
    token: str


@router.post(
    "/doc-token",
    response_model=DocTokenOut,
    dependencies=[Depends(rate_limit("doctoken", 20, 60))],
)
def doc_token(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Короткий токен для скачивания документа (счёт, акт).

    PDF открывает браузер по прямой ссылке, заголовков он не шлёт, и токен
    приходится класть в адрес. Раньше туда клался обычный токен — тот, что
    живёт днями и открывает всё. Адрес оседает в истории браузера и в логах
    сервера: одна строка из лога давала полный доступ к аккаунту.

    Этот живёт пять минут и, кроме документа, не годен ни на что.
    """
    owner = db.get(User, principal["id"]) or db.get(Employer, principal["id"])
    version = int(getattr(owner, "token_version", 0) or 0)
    return DocTokenOut(token=create_token(
        principal["id"], principal["role"], version,
        scope="doc", ttl=DOC_TOKEN_TTL,
    ))
