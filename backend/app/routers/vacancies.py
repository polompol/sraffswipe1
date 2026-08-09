"""Лента вакансий и их создание."""
import math

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..entitlements import (
    PLAN_VACANCY_LIMIT,
    active_vacancy_count,
    plan_of,
)
from ..geo import distance_km
from ..models import Employer, Match, Swipe, User, Vacancy
from ..notify import notify_owner
from ..ratelimit import rate_limit
from ..schemas import VacancyIn, VacancyOut
from ..security import current_principal, optional_principal
from ..timeutil import local_today
from .billing import commission_overdue

router = APIRouter(prefix="/vacancies", tags=["vacancies"])


def _shifts_done_by_employer(db: Session, emp_ids: set[str]) -> dict[str, int]:
    """Сколько ЗАКРЫТЫХ смен (completed) у каждого работодателя.

    Только completed (не confirmed) — иначе публичный счётчик доверия
    накручивался бы фиктивными мэтчами без реального выхода. Согласовано с
    _earnings/_reliability. Один групповой запрос — без N+1 на каждую вакансию."""
    if not emp_ids:
        return {}
    rows = (
        db.query(Match.employer_id, func.count(Match.id))
        .filter(
            Match.employer_id.in_(emp_ids),
            Match.status == "completed",
        )
        .group_by(Match.employer_id)
        .all()
    )
    return {emp_id: cnt for emp_id, cnt in rows}


def taken_counts(db: Session, vacancy_ids: list[str]) -> dict[str, int]:
    """Сколько мест уже занято по каждой смене.

    Занятым считаем мэтч в любом «живом» состоянии: договорились, подтвердили,
    отработали. Неявка место не занимает — заведению снова нужен человек.
    """
    if not vacancy_ids:
        return {}
    rows = (
        db.query(Match.vacancy_id, func.count(Match.id))
        .filter(
            Match.vacancy_id.in_(vacancy_ids),
            Match.status.in_(("matched", "confirmed", "completed")),
            Match.no_show.is_(False),
        )
        .group_by(Match.vacancy_id)
        .all()
    )
    return {vid: int(n) for vid, n in rows}


def _to_out(
    v: Vacancy,
    emp: Employer | None,
    dist: float | None,
    shifts_done: int = 0,
    taken: int = 0,
) -> VacancyOut:
    rating = emp.rating if emp else 0.0
    # «Платит вовремя» — заслуженный знак доверия: высокий рейтинг от
    # соискателей И уже несколько закрытых смен (не выдаётся «авансом»).
    pays_on_time = bool(emp) and rating >= 4.5 and shifts_done >= 3
    return VacancyOut(
        id=v.id,
        employer_id=v.employer_id,
        company_name=emp.company_name if emp else "",
        company_photo_url=emp.photo_url if emp else "",
        employer_verified=emp.verified if emp else False,
        role=v.role,
        date=v.date,
        start_time=v.start_time,
        end_time=v.end_time,
        rate=v.rate,
        rate_type=v.rate_type,
        pay_method=v.pay_method,
        tips=v.tips,
        description=v.description,
        require_med_book=v.require_med_book,
        require_experience=v.require_experience,
        headcount=v.headcount or 1,
        slots_left=max(0, (v.headcount or 1) - taken),
        lat=v.lat,
        lng=v.lng,
        address=v.address,
        city=v.city,
        interior_photo_url=v.interior_photo_url,
        status=v.status,
        distance_km=round(dist, 1) if dist is not None else None,
        employer_rating=round(rating, 1),
        employer_shifts_done=shifts_done,
        employer_pays_on_time=pays_on_time,
    )


@router.get("", response_model=list[VacancyOut])
def list_vacancies(
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float = 25.0,
    city: str | None = None,
    role: str | None = None,
    min_rate: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    rate_type: str | None = None,
    no_med_book: bool = False,
    no_experience: bool = False,
    verified_only: bool = False,
    tips_only: bool = False,
    sort: str = "distance",  # distance|rate|date
    mine: bool = False,
    db: Session = Depends(get_db),
    principal: dict | None = Depends(optional_principal),
):
    """Активные вакансии с фильтрами.

    `mine=1` — вернуть собственные вакансии работодателя (любой статус)."""
    # Раздел «Мои вакансии» — только свои, для текущего работодателя.
    if mine:
        if not principal or principal["role"] != "employer":
            return []
        emp = db.get(Employer, principal["id"])
        rows = (
            db.query(Vacancy)
            .filter(Vacancy.employer_id == principal["id"])
            .order_by(Vacancy.created_at.desc())
            .all()
        )
        done = _shifts_done_by_employer(db, {principal["id"]})
        taken = taken_counts(db, [v.id for v in rows])
        return [
            _to_out(
                v, emp, None,
                shifts_done=done.get(v.employer_id, 0),
                taken=taken.get(v.id, 0),
            )
            for v in rows
        ]
    query = db.query(Vacancy).filter(Vacancy.status == "active")
    # Не показываем смены, которые соискатель уже свайпнул, — иначе колода
    # зацикливается и после «просмотрел все» те же карточки лезут снова.
    if principal and principal["role"] == "seeker":
        swiped = [
            s[0] for s in db.query(Swipe.target_id).filter(
                Swipe.swiper_id == principal["id"],
                Swipe.target_type == "vacancy",
            ).all()
        ]
        if swiped:
            query = query.filter(Vacancy.id.notin_(swiped))
    if role:
        query = query.filter(Vacancy.role == role)
    if min_rate is not None:
        query = query.filter(Vacancy.rate >= min_rate)
    if rate_type:
        query = query.filter(Vacancy.rate_type == rate_type)
    if tips_only:
        query = query.filter(Vacancy.tips != "none")
    if no_med_book:
        query = query.filter(Vacancy.require_med_book.is_(False))
    if no_experience:
        query = query.filter(Vacancy.require_experience.is_(False))
    # Прошедшие смены не показываем НИКОГДА: раньше отсечка работала только
    # если человек сам выставил фильтр по датам, и вчерашние смены висели в
    # ленте вечно — на них откликались, а они давно прошли.
    # Дата смены — местная (см. timeutil): по часам сервера вчерашние
    # смены висели бы в ленте ещё три часа после полуночи в Москве.
    query = query.filter(Vacancy.date >= local_today())
    if date_from:
        query = query.filter(Vacancy.date >= date_from)
    if date_to:
        query = query.filter(Vacancy.date <= date_to)

    # Город: на PostgreSQL фильтруем в SQL (lower() корректен и для кириллицы),
    # на SQLite — в Python, т.к. его lower() не сворачивает кириллицу. Так лента
    # не тянет в память все смены страны и пользователь видит только свой город.
    city_norm = city.strip().lower() if city else None
    is_sqlite = settings.database_url.startswith("sqlite")
    if city_norm and not is_sqlite:
        query = query.filter(func.lower(Vacancy.city) == city_norm)

    # Отсекаем далёкие смены ДО ограничения выборки.
    #
    # Раньше порядок был обратный: база отдавала 300 самых свежих смен, и уже
    # среди них искались близкие. Пока смен десятки, разницы нет. Но стоит
    # ленте вырасти до нескольких сотен, и человек с окраины видел бы только
    # центр — просто потому, что там публикуют чаще. Лента переставала быть
    # лентой «рядом», и заметить это по жалобам почти невозможно.
    #
    # Рамка грубая (прямоугольник вокруг точки), точное расстояние считается
    # ниже: задача рамки — не пустить в выборку заведомо далёкое.
    if lat is not None and lng is not None:
        d_lat = radius_km / 111.0
        # Меридианы сходятся к полюсам: на широте Москвы градус долготы вдвое
        # короче градуса широты. cos у полюса → 0, поэтому нижняя граница.
        d_lng = radius_km / max(1.0, 111.0 * math.cos(math.radians(lat)))
        query = query.filter(
            or_(
                and_(
                    Vacancy.lat.between(lat - d_lat, lat + d_lat),
                    Vacancy.lng.between(lng - d_lng, lng + d_lng),
                ),
                # Смена заведена только по городу, без точки на карте, —
                # её по расстоянию не судим и из ленты не выбрасываем.
                and_(Vacancy.lat == 0, Vacancy.lng == 0),
            )
        )

    # Кап на размер выборки — защита от перегрузки на больших объёмах.
    rows = query.order_by(Vacancy.created_at.desc()).limit(300).all()

    # Батч-подгрузка работодателей одним запросом (без N+1 на каждую вакансию).
    emp_ids = {v.employer_id for v in rows}
    emps = (
        {e.id: e for e in db.query(Employer).filter(Employer.id.in_(emp_ids)).all()}
        if emp_ids
        else {}
    )
    done = _shifts_done_by_employer(db, emp_ids)
    taken = taken_counts(db, [v.id for v in rows])

    result: list[VacancyOut] = []
    for v in rows:
        if city_norm and is_sqlite and (v.city or "").strip().lower() != city_norm:
            continue
        emp = emps.get(v.employer_id)
        if verified_only and not (emp and emp.verified):
            continue
        dist = None
        # Координаты 0,0 = «город без точки на карте» — не фильтруем по радиусу,
        # иначе валидная смена (заведена только по городу) пропала бы из ленты.
        if lat is not None and lng is not None and (v.lat or v.lng):
            dist = distance_km(lat, lng, v.lat, v.lng)
            if dist > radius_km:
                continue
        # Набранную смену в ленте не показываем: людей уже нашли, а отклик
        # на неё — потерянное время обеих сторон. Раньше поля «сколько нужно»
        # не было вовсе, и смена висела, пока заведение не снимет её руками.
        if taken.get(v.id, 0) >= (v.headcount or 1):
            continue
        result.append(_to_out(
            v, emp, dist,
            shifts_done=done.get(v.employer_id, 0),
            taken=taken.get(v.id, 0),
        ))

    # Порядок ленты определяет только выбранная сортировка. Платного
    # поднятия в топ нет: место в ленте не продаётся.
    def _key(x: VacancyOut):
        if sort == "rate":
            return -x.rate
        if sort == "date":
            return x.date
        return x.distance_km if x.distance_km is not None else 1e9

    result.sort(key=_key)
    return result


@router.get("/invites", response_model=list[VacancyOut])
def invites(
    principal: dict = Depends(current_principal),
    db: Session = Depends(get_db),
):
    """«Кто меня зовёт»: активные смены заведений, которые лайкнули соискателя,
    но мэтча ещё нет. Свайп по такой смене → мгновенный мэтч (лайк взаимный)."""
    if principal["role"] != "seeker":
        raise HTTPException(status_code=403, detail="Только для соискателя")
    me = principal["id"]
    emp_ids = [
        s[0] for s in db.query(Swipe.swiper_id).filter(
            Swipe.target_id == me,
            Swipe.target_type == "user",
            Swipe.direction == "like",
        ).distinct().all()
    ]
    if not emp_ids:
        return []
    # Смены, которые соискатель уже свайпнул, повторно не показываем.
    swiped = [
        s[0] for s in db.query(Swipe.target_id).filter(
            Swipe.swiper_id == me, Swipe.target_type == "vacancy",
        ).all()
    ]
    q = db.query(Vacancy).filter(
        Vacancy.employer_id.in_(emp_ids), Vacancy.status == "active",
    )
    if swiped:
        q = q.filter(Vacancy.id.notin_(swiped))
    rows = q.order_by(Vacancy.created_at.desc()).limit(100).all()
    if not rows:
        return []
    ids = {v.employer_id for v in rows}
    emps = {e.id: e for e in db.query(Employer).filter(Employer.id.in_(ids)).all()}
    done = _shifts_done_by_employer(db, ids)
    return [
        _to_out(
            v, emps.get(v.employer_id), None,
            shifts_done=done.get(v.employer_id, 0),
        )
        for v in rows
    ]


@router.post(
    "",
    response_model=VacancyOut,
    status_code=201,
    dependencies=[Depends(rate_limit("vacancy", 20, 60))],
)
def create_vacancy(
    body: VacancyIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    emp = db.get(Employer, principal["id"])
    if emp is None:
        raise HTTPException(status_code=404, detail="Работодатель не найден")

    # Просроченный долг по комиссии → новые вакансии не публикуем до оплаты.
    if commission_overdue(db, emp.id):
        raise HTTPException(
            status_code=402,
            detail="Есть неоплаченная комиссия за прошлые смены — "
                   "оплатите счёт, чтобы публиковать новые вакансии.",
        )

    # Лимит тарифа Free на число активных вакансий.
    limit = PLAN_VACANCY_LIMIT.get(plan_of(db, emp.id))
    if limit is not None and active_vacancy_count(db, emp.id) >= limit:
        raise HTTPException(
            status_code=402,
            detail="Лимит тарифа Free. Оформите Pro для большего числа вакансий.",
        )

    v = Vacancy(employer_id=emp.id, **body.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    # Алерты по сохранённым поискам — в фоне, чтобы не тормозить публикацию.
    from .saved_searches import notify_matching_searches

    background.add_task(notify_matching_searches, v.id)
    # Авто-модерация: подозрительные формулировки (предоплата и т.п.).
    from ..moderation import auto_flag

    auto_flag(db, "vacancy", v.id, body.description, body.role)
    return _to_out(v, emp, None)


def _own_vacancy_or_404(db: Session, vacancy_id: str, principal: dict) -> Vacancy:
    """Своя вакансия работодателя. Чужую не отдаём и не даём трогать."""
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    v = db.get(Vacancy, vacancy_id)
    if v is None or v.employer_id != principal["id"]:
        raise HTTPException(status_code=404, detail="Смена не найдена")
    return v


def _blocked_by_matches(db: Session, vacancy_id: str) -> bool:
    """Есть ли отклики. Вакансия с мэтчем — это уже договорённость с
    конкретным человеком: по ней считается оплата и комиссия. Менять или
    удалять её задним числом нельзя — иначе можно снизить ставку после
    того, как работник согласился."""
    return db.query(Match.id).filter(Match.vacancy_id == vacancy_id).first() is not None


@router.put("/{vacancy_id}", response_model=VacancyOut)
def update_vacancy(
    vacancy_id: str,
    body: VacancyIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Исправить свою смену (опечатка в ставке, времени, адресе).
    Доступно, пока по ней нет откликов."""
    v = _own_vacancy_or_404(db, vacancy_id, principal)
    taken = taken_counts(db, [v.id]).get(v.id, 0)
    fields = body.model_dump()

    # Нельзя объявить, что нужно меньше людей, чем уже набрано, — иначе
    # человек, с которым договорились, остаётся «лишним».
    if fields["headcount"] < taken:
        raise HTTPException(
            status_code=409,
            detail=f"На смену уже взято {taken} чел. — меньше поставить нельзя.",
        )

    if _blocked_by_matches(db, vacancy_id):
        # Исключение из заморозки условий: увеличить число людей можно всегда.
        # «Нужен ещё один официант» никого не ущемляет — у тех, кто уже
        # согласился, ставка, время и адрес остаются прежними. Всё остальное
        # по-прежнему заморожено.
        others_changed = any(
            getattr(v, f) != val for f, val in fields.items() if f != "headcount"
        )
        if others_changed or fields["headcount"] <= (v.headcount or 1):
            raise HTTPException(
                status_code=409,
                detail="По смене уже есть отклик — условия менять нельзя. "
                       "Можно только увеличить число нужных людей. "
                       "Остальное — договоритесь в чате.",
            )

    for field, value in fields.items():
        setattr(v, field, value)
    db.commit()
    db.refresh(v)

    from ..moderation import auto_flag

    auto_flag(db, "vacancy", v.id, body.description, body.role)
    emp = db.get(Employer, v.employer_id)
    return _to_out(v, emp, None, taken=taken)


@router.delete("/{vacancy_id}", status_code=204)
def delete_vacancy(
    vacancy_id: str,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Снять свою смену с публикации. Доступно, пока нет откликов —
    иначе человек, который уже договорился, потерял бы смену молча."""
    v = _own_vacancy_or_404(db, vacancy_id, principal)
    if _blocked_by_matches(db, vacancy_id):
        raise HTTPException(
            status_code=409,
            detail="По смене уже есть отклик — снять нельзя. "
                   "Напишите человеку в чате, если планы поменялись.",
        )
    # Свайпы по снятой смене больше не нужны: без них цель «висит» в истории
    # и мешает, если заведение позже создаст похожую.
    db.query(Swipe).filter(
        Swipe.target_id == vacancy_id, Swipe.target_type == "vacancy"
    ).delete(synchronize_session=False)
    db.delete(v)
    db.commit()
    return None


@router.post(
    "/{vacancy_id}/urgent",
    # Анти-спам: рассылка «Срочно» всем доступным сегодня — не чаще 3/час.
    dependencies=[Depends(rate_limit("urgent", 3, 3600))],
)
def urgent_ping(
    vacancy_id: str,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """«Срочно»: пингуем доступных сегодня соискателей в городе смены.
    Рассылка через notify_owner (тихий no-op без токена бота)."""
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    if commission_overdue(db, principal["id"]):
        raise HTTPException(
            status_code=402,
            detail="Есть просроченная комиссия — оплатите счёт, "
                   "чтобы звать людей на смены.",
        )
    v = db.get(Vacancy, vacancy_id)
    if v is None or v.employer_id != principal["id"]:
        raise HTTPException(status_code=404, detail="Вакансия не найдена")
    city = (v.city or "").strip().lower()
    seekers = (
        db.query(User)
        .filter(User.blocked.is_(False), User.available_today.is_(True))
        .all()
    )
    sent = 0
    text = f"Срочно нужен человек: {v.role} · {v.rate}₽ · {v.address or v.city}"
    for u in seekers:
        if city and (u.city or "").strip().lower() != city:
            continue
        notify_owner(db, u.id, text)
        sent += 1
    return {"ok": True, "pinged": sent}
