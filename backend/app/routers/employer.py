"""Верификация работодателя по ИНН (DaData) + «мои работники» / «позвать снова»."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employer, Match, Swipe, User
from ..notify import notify_owner
from ..ratelimit import rate_limit
from ..security import current_principal
from .billing import commission_overdue
from .dadata import lookup_party

router = APIRouter(prefix="/employer", tags=["employer"])


class WorkerOut(BaseModel):
    id: str
    name: str
    rating: float
    available_today: bool
    shifts_total: int
    shifts_attended: int
    # Со сколькими разными заведениями человек работал — см. пояснение
    # в candidates.py: без этой цифры накрутку одной парой не отличить.
    employers_total: int = 0


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

    # Не только состоявшиеся смены: тот, кто не вышел, тоже должен быть виден
    # с его надёжностью («вышел на 0 из 1»). Иначе заведение теряет из виду
    # ровно тех, кого важнее всего помнить. Раньше неявка оставляла смену
    # «подтверждённой» и попадала сюда сама; теперь у неё свой статус.
    user_ids = [
        uid for (uid,) in db.query(Match.user_id)
        .filter(
            Match.employer_id == principal["id"],
            or_(
                Match.status.in_(("confirmed", "completed")),
                Match.no_show.is_(True),
            ),
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
            shifts_total=rel.get(u.id, (0, 0, 0))[0],
            shifts_attended=rel.get(u.id, (0, 0, 0))[1],
            employers_total=rel.get(u.id, (0, 0, 0))[2],
        )
        for u in users
    ]


class ApplicantOut(BaseModel):
    """Человек, который сам откликнулся на смену заведения.

    Это зеркало экрана «Тебя зовут» у работника. Раньше у заведения его не
    было вовсе: в профиле висел счётчик «Новых откликов: 5», а нажатие вело
    в общую ленту кандидатов, где эти пятеро ничем не отличались от полусотни
    остальных. Вопрос «кто уже хочет ко мне» — для заведения первый, и до
    сих пор ответа на него в приложении не было.
    """

    id: str
    name: str
    age: int | None = None
    district: str = ""
    roles: list[str] = []
    med_book: str = "no"
    rating: float = 0.0
    photo_urls: list[str] = []
    about: str = ""
    available_today: bool = False
    shifts_total: int = 0
    shifts_attended: int = 0
    employers_total: int = 0
    # Заведение уже отказало этому человеку, но он остаётся в списке: отказ
    # больше не приговор, передумать можно в один тап.
    declined: bool = False
    # На какую именно смену откликнулся — заведение обычно ведёт несколько.
    vacancy_id: str
    vacancy_role: str
    vacancy_date: str
    vacancy_start: int
    vacancy_end: int


@router.get("/applicants", response_model=list[ApplicantOut])
def applicants(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Кто откликнулся на мои смены и ещё ждёт ответа.

    Показываем только тех, кому заведение ещё не ответило: свайпнул — значит
    решение принято, и человек уходит из этого списка (в мэтчи или в отказ).
    """
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    from ..models import Vacancy
    from .candidates import _age, _csv, _reliability

    vacancies = {
        v.id: v for v in db.query(Vacancy).filter(
            Vacancy.employer_id == principal["id"],
            Vacancy.status == "active",
        ).all()
    }
    if not vacancies:
        return []
    likes = (
        db.query(Swipe)
        .filter(
            Swipe.target_type == "vacancy",
            Swipe.target_id.in_(list(vacancies)),
            Swipe.direction == "like",
        )
        .order_by(Swipe.created_at.desc())
        .all()
    )
    if not likes:
        return []
    # Кого заведение уже позвало — из списка убираем: они в мэтчах.
    # А вот те, кому отказали, ОСТАЮТСЯ, просто уходят вниз с пометкой.
    # Раньше отказ прятал человека навсегда — и из этого списка, и из ленты
    # кандидатов, — а он сам выбрал вашу смену. Один случайный свайп влево
    # (в приложении с карточками их много) означал потерянного работника.
    answers = {
        uid: direction
        for uid, direction in db.query(Swipe.target_id, Swipe.direction).filter(
            Swipe.swiper_id == principal["id"],
            Swipe.target_type == "user",
        ).all()
    }
    invited = {uid for uid, d in answers.items() if d in ("like",)}
    declined = {uid for uid, d in answers.items() if d not in ("like",)}
    seen: set[str] = set()
    pairs: list[tuple[Swipe, object]] = []
    for s in likes:
        if s.swiper_id in invited or s.swiper_id in seen:
            continue
        seen.add(s.swiper_id)
        pairs.append((s, vacancies[s.target_id]))
    # Отклонённые — в конец списка: сначала те, кому вы ещё не ответили.
    pairs.sort(key=lambda pair: pair[0].swiper_id in declined)
    if not pairs:
        return []
    users = {
        u.id: u for u in db.query(User)
        .filter(User.id.in_([s.swiper_id for s, _ in pairs]), User.blocked.is_(False))
        .all()
    }
    rel = _reliability(db, list(users))
    out: list[ApplicantOut] = []
    for s, v in pairs:
        u = users.get(s.swiper_id)
        if u is None:
            continue
        out.append(ApplicantOut(
            id=u.id,
            name=u.name or "Соискатель",
            age=_age(u.birth_date),
            district=u.district,
            roles=_csv(u.roles),
            med_book=u.med_book,
            rating=u.rating,
            photo_urls=_csv(u.photo_urls),
            about=u.about,
            available_today=u.available_today,
            shifts_total=rel.get(u.id, (0, 0, 0))[0],
            shifts_attended=rel.get(u.id, (0, 0, 0))[1],
            employers_total=rel.get(u.id, (0, 0, 0))[2],
            declined=u.id in declined,
            vacancy_id=v.id,
            vacancy_role=v.role,
            vacancy_date=v.date,
            vacancy_start=v.start_time,
            vacancy_end=v.end_time,
        ))
    return out


@router.post(
    "/invite/{user_id}",
    # Анти-спам: не заваливаем работника пингами «зовём снова».
    dependencies=[Depends(rate_limit("invite", 20, 3600))],
)
def invite_again(
    user_id: str,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Позвать работника снова: фиксируем интерес заведения и шлём ему пинг."""
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    # Тот же барьер, что и на свайпах: должник не зовёт новых людей (иначе это
    # обход блока приглашений через этот эндпоинт).
    if commission_overdue(db, principal["id"]):
        raise HTTPException(
            status_code=402,
            detail="Есть просроченная комиссия — оплатите счёт, "
                   "чтобы звать людей.",
        )
    emp = db.get(Employer, principal["id"])
    if emp is None or db.get(User, user_id) is None:
        raise HTTPException(status_code=404, detail="Не найдено")
    # Звать некуда, если нет ни одной опубликованной смены: человек получал
    # «вас снова зовут», открывал приложение — и не находил, на что
    # откликнуться. Приглашение без смены — это обманутое ожидание.
    from ..models import Vacancy

    # Смена должна быть не только активной, но и БУДУЩЕЙ. Проверка на дату
    # отсутствовала: смена висит «активной», пока её не снимут руками, и
    # заведение звало людей на вчерашний день — человек открывал приложение и
    # не находил, на что откликнуться.
    from ..timeutil import local_today

    has_shift = (
        db.query(Vacancy)
        .filter(
            Vacancy.employer_id == principal["id"],
            Vacancy.status == "active",
            Vacancy.date >= local_today(),
        )
        .first()
    )
    if has_shift is None:
        raise HTTPException(
            status_code=409,
            detail="Сначала опубликуйте смену на будущую дату — "
                   "иначе человеку некуда выйти.",
        )
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
    # Пинг шлём только при НОВОМ интересе — повторные вызовы не спамят человека.
    if not exists:
        notify_owner(
            db, user_id, f"Вас снова зовут на смену в «{emp.company_name}»"
        )
    # Отдаём, отправили мы сообщение или человек уже был позван: иначе кнопка
    # на второе нажатие показывала тот же успех, и управляющий не понимал,
    # дошло ли до человека хоть что-нибудь.
    return {"ok": True, "notified": not exists}


class VerifyIn(BaseModel):
    inn: str


class VerifyOut(BaseModel):
    found: bool
    verified: bool
    name: str = ""
    ogrn: str = ""
    address: str = ""
    hint: str = ""


@router.post(
    "/verify",
    response_model=VerifyOut,
    # Ходит в ПЛАТНУЮ DaData. Соседние ручки /dadata/* лимит имеют, а здесь
    # его забыли — скрипт в цикле опустошал бы баланс DaData за счёт владельца.
    # Проверка ИНН делается один раз при регистрации, 10 в час хватает с лихвой.
    dependencies=[Depends(rate_limit("verify", 10, 3600))],
)
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

    db.commit()

    # Бейдж «Проверено» НЕ выдаётся за найденный ИНН. ИНН — публичные данные:
    # любой наберёт ИНН известного ресторана и получит чужой бейдж вместе с
    # названием и адресом. Доказательства владения бизнесом у сервиса нет и на
    # пилоте быть не может, поэтому бейдж ставит оператор — руками, поговорив
    # с заведением. Раньше здесь стояла ссылка на «оплаченную верификацию»:
    # такой услуги в сервисе нет и не было, а поставить бейдж не мог никто
    # вообще — во всём коде не было ни одного места, где он выдаётся.
    hint = ""
    if not party.found:
        hint = "Организация не найдена в DaData (проверьте ИНН или ключ DaData)."
    elif not emp.verified:
        hint = ("Данные подтянуты. Бейдж «Проверено» ставит оператор "
                "StaffSwipe после короткого разговора с вами.")

    return VerifyOut(
        found=party.found,
        verified=emp.verified,
        name=emp.company_name,
        ogrn=emp.ogrn,
        address=emp.address,
        hint=hint,
    )
