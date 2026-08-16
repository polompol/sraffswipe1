"""Лента кандидатов для работодателя."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Integer, and_, func, or_
from sqlalchemy.orm import Session

from ..cities import normalize, same_city
from ..db import get_db
from ..models import Employer, Match, Swipe, User
from ..ratelimit import rate_limit
from ..security import current_principal

router = APIRouter(tags=["candidates"])


def _age(iso: str) -> int | None:
    """Полных лет по дате рождения. None — если дата не заполнена/битая."""
    try:
        born = date.fromisoformat(iso)
    except (ValueError, TypeError):
        return None
    today = date.today()
    return today.year - born.year - (
        (today.month, today.day) < (born.month, born.day)
    )


class CandidateOut(BaseModel):
    id: str
    name: str
    # Возраст числом, а не дата рождения. Раньше отдавали «год-01-01», чтобы
    # не раскрывать точную дату, — и клиент считал по ней возраст, завышая
    # его почти у всех, у кого день рождения ещё не прошёл. Готовое число
    # и точнее, и раскрывает о человеке меньше, чем любая дата.
    age: int | None = None
    city: str
    district: str
    lat: float
    lng: float
    roles: list[str]
    med_book: str
    self_employed: bool
    inn: str | None
    experience_tags: list[str]
    rating: float
    photo_urls: list[str]
    about: str
    available_today: bool = False
    # Надёжность: вышел на `attended` из `shifts_total` подтверждённых смен.
    shifts_total: int = 0
    shifts_attended: int = 0
    # Со сколькими РАЗНЫМИ заведениями человек уже работал. Без этой цифры
    # «вышел на 12 из 12» ничем не отличалось от двенадцати смен, закрытых
    # с одним и тем же дружественным (или своим же, заведённым на второй
    # Telegram-аккаунт) заведением. Теперь накрутка видна сразу: 12 смен и
    # 1 заведение — это не опыт, а один и тот же человек с двух сторон.
    employers_total: int = 0


def _csv(value: str) -> list[str]:
    return [x for x in (value or "").split(",") if x]


def _reliability(db: Session, user_ids: list[str]) -> dict[str, tuple[int, int, int]]:
    """{user_id: (всего смен, из них вышел, со сколькими заведениями)}.

    Одним запросом — иначе на каждую анкету в ленте уходил бы свой.
    """
    if not user_ids:
        return {}
    rows = (
        db.query(
            Match.user_id,
            func.count(Match.id),
            # «Подвёл» = неявка или поздняя отмена: для заведения разницы нет.
            func.sum(func.cast(
                or_(Match.no_show.is_(True), Match.cancelled_late.is_(True)),
                Integer,
            )),
            func.count(func.distinct(Match.employer_id)),
        )
        .filter(
            Match.user_id.in_(user_ids),
            # Надёжность считаем по РЕАЛЬНЫМ сменам: закрытая (completed = вышел),
            # зафиксированная неявка (no_show) ИЛИ поздняя отмена работником.
            # Голый confirmed без отметки не в счёт — иначе «вышел на N смен»
            # накручивается фиктивными мэтчами. Накрутить хорошую статистику
            # через неявку нельзя: она её ухудшает.
            #
            # Ранняя отмена в статистику НЕ попадает вообще, и это принципиально:
            # человек, предупредивший за два дня, дал заведению время найти
            # замену — наказывать его не за что. Наказывается только поздняя
            # отмена, после которой замену уже не найти.
            or_(
                Match.status == "completed",
                Match.no_show.is_(True),
                and_(Match.status == "cancelled",
                     Match.cancelled_by == "seeker",
                     Match.cancelled_late.is_(True)),
            ),
        )
        .group_by(Match.user_id)
        .all()
    )
    out: dict[str, tuple[int, int, int]] = {}
    for uid, total, noshows, employers in rows:
        total = int(total or 0)
        noshows = int(noshows or 0)
        out[uid] = (total, total - noshows, int(employers or 0))
    return out


@router.get(
    "/candidates",
    response_model=list[CandidateOut],
    # Лента отдаёт персональные данные людей. Зарегистрироваться «заведением»
    # может кто угодно, а один запрос возвращает до 200 анкет — без ограничения
    # базу соискателей можно было выкачать скриптом. Живому заведению 30
    # обновлений ленты в минуту хватает с запасом.
    dependencies=[Depends(rate_limit("candidates", 30, 60))],
)
def list_candidates(
    role: str | None = None,
    district: str | None = None,
    city: str | None = None,
    available_today: bool = False,
    reliable_only: bool = False,
    principal: dict = Depends(current_principal),
    db: Session = Depends(get_db),
):
    """Лента кандидатов для заведения. Фильтры: город, роль, район, «готов
    сегодня», «надёжные» (без неявок). Роль/район/город фильтруем в Python —
    CSV-роли и кириллица корректнее, чем LIKE/lower() на SQLite."""
    # Ленту кандидатов с ПДн видит только работодатель.
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    # Город. Фильтра не было вообще: пока город один, это незаметно, но кафе в
    # Казани листало бы москвичей — то есть главный экран заведения переставал
    # работать в тот день, когда появляется второй город. По умолчанию берём
    # город самого заведения, чтобы ничего не надо было выбирать руками.
    me = db.get(Employer, principal["id"])
    city_f = normalize(city) if city else normalize(getattr(me, "city", "") or "")
    # Не показываем кандидатов, которых работодатель уже свайпнул (иначе колода
    # зацикливается после «кандидаты закончились»).
    swiped = [
        s[0] for s in db.query(Swipe.target_id).filter(
            Swipe.swiper_id == principal["id"],
            Swipe.target_type == "user",
        ).all()
    ]
    # «Готов выйти сегодня» — наверх: их зовут на срочные смены первыми.
    q = db.query(User).filter(User.blocked.is_(False))
    if swiped:
        q = q.filter(User.id.notin_(swiped))
    if available_today:
        q = q.filter(User.available_today.is_(True))
    rows = (
        q.order_by(User.available_today.desc(), User.rating.desc())
        .limit(200)
        .all()
    )
    role_f = role.strip() if role else None
    dist_f = district.strip().lower() if district else None

    def _match(u: User) -> bool:
        if role_f and role_f not in _csv(u.roles):
            return False
        if dist_f and (u.district or "").strip().lower() != dist_f:
            return False
        # Город человека может быть не заполнен (старые анкеты) — таких не
        # прячем: лучше показать заведению лишнего, чем спрятать своего.
        if city_f and u.city and not same_city(u.city, city_f):
            return False
        return True

    users = [u for u in rows if _match(u)][:50]
    rel = _reliability(db, [u.id for u in users])
    if reliable_only:
        # Надёжный = без единой неявки (вышел на все подтверждённые смены).
        users = [
            u for u in users
            if rel.get(u.id, (0, 0, 0))[0] == rel.get(u.id, (0, 0, 0))[1]
        ]
    return [
        CandidateOut(
            id=u.id,
            name=u.name,
            age=_age(u.birth_date),
            city=u.city,
            district=u.district,
            # Точные координаты дома соискателя не раскрываем до мэтча —
            # отдаём только город/район. Защита от деанонимизации/сталкинга.
            lat=0.0,
            lng=0.0,
            roles=_csv(u.roles),
            med_book=u.med_book,
            self_employed=u.self_employed,
            # ИНН не отдаём в общей ленте — он попадает в акт уже после мэтча.
            inn=None,
            experience_tags=_csv(u.experience_tags),
            rating=u.rating,
            photo_urls=_csv(u.photo_urls),
            about=u.about,
            available_today=u.available_today,
            shifts_total=rel.get(u.id, (0, 0, 0))[0],
            shifts_attended=rel.get(u.id, (0, 0, 0))[1],
            employers_total=rel.get(u.id, (0, 0, 0))[2],
        )
        for u in users
    ]
