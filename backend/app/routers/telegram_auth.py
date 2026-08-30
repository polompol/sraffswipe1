"""Авторизация через Telegram Mini App (initData → JWT). Замена SMS."""
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Employer, Entitlement, Event, Referral, User
from ..ratelimit import rate_limit_ip
from ..schemas import TokenOut
from ..security import create_token
from ..telegram import parse_start_param, parse_user, validate_init_data

router = APIRouter(prefix="/auth", tags=["auth"])


class TelegramAuthIn(BaseModel):
    init_data: str
    role: str = "seeker"  # seeker|employer
    # Реф-метка для разработки. В бою её берут из подписанных данных
    # Telegram, а это поле игнорируется — подписать его нечем.
    start_param: str = ""


def _owner_exists(db, owner_id: str) -> bool:
    return (
        db.get(User, owner_id) is not None
        or db.get(Employer, owner_id) is not None
    )


def _owner_tg_id(db, owner_id: str) -> int | None:
    owner = db.get(User, owner_id) or db.get(Employer, owner_id)
    return owner.tg_id if owner is not None else None


def _banned_by_tg(db, tg_id: int) -> bool:
    """Заблокирован ли этот Telegram хоть в одной роли.

    Иначе бан обходится в два нажатия: заблокированный работник открывает
    приложение заведением, и раз такого аккаунта ещё нет — он создаётся
    чистым. Оператор блокирует человека, а человек продолжает работать.
    """
    if tg_id is None:
        return False
    for table in (User, Employer):
        row = db.query(table).filter(table.tg_id == tg_id).first()
        if row is not None and row.blocked:
            return True
    return False


def _apply_referral(db, referred_id: str, code: str) -> None:
    """Записать, кто кого привёл. Один раз на приглашённого.

    Наград за приглашение нет: внутренних «валют» в сервисе не осталось, а
    обещать то, чего нет, нельзя. Запись нужна для честного ответа на вопрос
    «откуда пришли люди» — по ней видно, какое заведение или работник реально
    приводит других."""
    if not code.startswith("ref_"):
        return
    referrer_id = code[4:]
    if (
        not referrer_id
        or referrer_id == referred_id
        or not _owner_exists(db, referrer_id)
    ):
        return
    # Само-реферал: два аккаунта одного человека (совпадает tg_id) — не бонусим.
    ref_tg = _owner_tg_id(db, referrer_id)
    new_tg = _owner_tg_id(db, referred_id)
    if ref_tg and new_tg and ref_tg == new_tg:
        return
    if db.query(Referral).filter(Referral.referred_id == referred_id).first():
        return
    db.add(Referral(referrer_id=referrer_id, referred_id=referred_id, rewarded=False))
    db.commit()


def _track_source(db, owner_id: str, code: str, role: str) -> None:
    """Источник трафика: регистрация по ссылке t.me/<bot>?startapp=src_<канал>.
    Пишется один раз — при создании аккаунта (атрибуция рекламных каналов)."""
    if not code.startswith("src_"):
        return
    src = code[4:][:32].strip().lower()
    if not src:
        return
    db.add(Event(
        owner_id=owner_id, name="source",
        props=json.dumps({"src": src, "role": role}, ensure_ascii=False),
    ))
    db.commit()


@router.post(
    "/telegram",
    response_model=TokenOut,
    # Вход не требует авторизации, поэтому ограничиваем по IP: иначе скрипт
    # бесконечно дёргает проверку подписи и базу.
    #
    # 300 в минуту, а не 30. Мобильные операторы прячут тысячи абонентов за
    # одним публичным адресом (CGNAT): при всплеске — реклама, репост, ролик —
    # живые люди с одного оператора упирались бы в отказ на входе. Симптом
    # самый обидный: «приложение не работает», при том что в логах всё
    # спокойно, а человек больше не вернётся.
    #
    # Подбирать здесь всё равно нечего: initData подписан токеном бота, и
    # чужая подпись отвергается сразу. Лимит защищает не от подбора, а от
    # нагрузки на базу — для этого 300 в минуту с одного адреса достаточно.
    dependencies=[Depends(rate_limit_ip("tg-login", 300, 60))],
)
def telegram_login(body: TelegramAuthIn, db: Session = Depends(get_db)):
    valid = validate_init_data(
        body.init_data, settings.telegram_bot_token,
        max_age_seconds=settings.initdata_ttl_hours * 3600,
    )
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
    # Аватарка из Telegram — фото профиля сразу, без S3. Telegram кладёт
    # photo_url в initData, если у пользователя есть публичное фото.
    tg_photo = tg_user.get("photo_url") or ""
    # Метку берём ИЗ ПОДПИСАННЫХ данных Telegram. Поле в теле запроса —
    # только для разработки: initData там подделать нечем, а в бою оно
    # позволяло приписать себе любой источник и любого пригласившего, то есть
    # своими руками испортить единственный ответ на вопрос «откуда люди».
    ref_code = parse_start_param(body.init_data)
    if not ref_code and settings.allow_insecure_telegram_auth:
        ref_code = body.start_param

    # Бан выписывают ЧЕЛОВЕКУ, а не роли. Вход в Telegram один, ролей две, и
    # блокировка второй роли переносится оператором сразу. Но если второй роли
    # на момент бана ещё НЕ БЫЛО, переносить было нечего: заблокированный
    # работник заводил заведение тем же Telegram и спокойно входил. Поэтому
    # смотрим не только свою таблицу, но и соседнюю — по тому же tg_id.
    if _banned_by_tg(db, tg_id):
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    if body.role == "employer":
        emp = db.query(Employer).filter(Employer.tg_id == tg_id).first()
        if emp is not None and emp.blocked:
            raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
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
            _track_source(db, emp.id, ref_code, "employer")
        return TokenOut(
            access_token=create_token(emp.id, "employer", emp.token_version),
            role="employer",
            user_id=emp.id,
        )

    user = db.query(User).filter(User.tg_id == tg_id).first()
    if user is not None and user.blocked:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
    if user is None:
        user = User(
            tg_id=tg_id,
            tg_username=username,
            phone=f"tg:{tg_id}",
            name=name,
            photo_urls=tg_photo,  # аватарка из Telegram как стартовое фото
        )
        db.add(user)
        db.flush()
        db.add(Entitlement(owner_id=user.id))
        db.commit()
        db.refresh(user)
        _apply_referral(db, user.id, ref_code)
        _track_source(db, user.id, ref_code, "seeker")
    return TokenOut(
        access_token=create_token(user.id, "seeker", user.token_version),
        role="seeker",
        user_id=user.id,
    )
