"""Pydantic-схемы запросов/ответов."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

Role = Literal["seeker", "employer"]
Phone = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^\+?\d{10,15}$")
]
Code = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^\d{4,8}$")
]
# Короткие строковые поля с разумным потолком длины (анти-абуз).
Short = Annotated[str, StringConstraints(max_length=120)]
Longish = Annotated[str, StringConstraints(max_length=2000)]

# Должности — закрытый список, ровно как в приложении (tma/src/types/domain.ts).
# Раньше здесь принималась любая строка, и это была бесплатная витрина для
# объявлений: должность выводится крупным шрифтом в ленте, а модерации у неё
# нет. Заодно чужая должность ломала фильтр — по ней не находилось ничего.
StaffRole = Literal[
    "waiter", "waiter_assistant", "barista", "cook", "dishwasher", "hostess",
    "bartender", "hookah", "florist", "administrator", "courier", "cleaner",
]
# Отметки об опыте — тоже закрытый список (галочки в анкете, не свободный текст).
ExperienceTag = Literal[
    "medBook", "experienced", "english", "cashRegister", "selfEmployed",
]
# Адрес картинки: только http(s). Пусто — «фото нет». Без этой проверки в поле
# можно было записать что угодно (javascript:, data:, ссылку-счётчик) — а оно
# подставляется в src картинки на чужом экране.
PhotoUrl = Annotated[
    str, StringConstraints(max_length=500, pattern=r"^(https?://\S+)?$")
]


# ---- auth ----
class RequestCodeIn(BaseModel):
    phone: Phone
    role: Role = "seeker"


class RequestCodeOut(BaseModel):
    sent: bool
    dev_code: str | None = None  # заполняется только в dev_mode


class VerifyIn(BaseModel):
    phone: Phone
    code: Code
    role: Role = "seeker"


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str


# ---- vacancies ----
# Нижняя граница оплаты смены. Не про «справедливую зарплату» (её определяет
# рынок), а про то, что смена — настоящая: см. пояснение в _check_duration.
MIN_RATE_PER_HOUR = 100
MIN_RATE_PER_SHIFT = 500


class VacancyIn(BaseModel):
    role: StaffRole
    date: Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
    start_time: int = Field(ge=0, le=1440)
    end_time: int = Field(ge=0, le=1440)
    rate: int = Field(ge=0, le=1_000_000)
    rate_type: Literal["perHour", "perShift"] = "perHour"
    # Сколько человек нужно. Потолок 20 — дальше это уже не подработка
    # через приложение, а отдельный разговор с заведением.
    headcount: int = Field(default=1, ge=1, le=20)
    pay_method: Literal["cash", "card", "transfer"] = "cash"
    tips: Literal["none", "individual", "shared"] = "none"
    description: Longish = ""
    require_med_book: bool = False
    require_experience: bool = False
    lat: float = Field(default=0.0, ge=-90, le=90)
    lng: float = Field(default=0.0, ge=-180, le=180)
    address: Short = ""
    city: Short = ""
    interior_photo_url: PhotoUrl = ""

    @model_validator(mode="after")
    def _check_duration(self) -> "VacancyIn":
        # У почасовой смены должна быть длительность. start==end трактовалось
        # бы как «ночная через полночь» = 24 часа → завышенная оплата/комиссия.
        if self.rate_type == "perHour" and self.start_time == self.end_time:
            raise ValueError("Время начала и конца смены не должно совпадать")
        # Смена за 0 ₽ — не предложение работы, а бесплатный инструмент
        # накрутки: пара сговорившихся аккаунтов закрывала такие «смены»
        # десятками, получая работнику ★5,0 и «вышел на 12 из 12», а сервису —
        # ноль комиссии (10% от нуля). Именно по этим цифрам заведение решает,
        # пускать ли незнакомого человека к кассе. С нижней границей каждая
        # фиктивная смена стоит настоящих денег, и накрутка перестаёт окупаться.
        # Пороги заведомо ниже рынка Москвы (250–500 ₽/час) — честному
        # заведению они не мешают.
        if self.rate_type == "perHour" and self.rate < MIN_RATE_PER_HOUR:
            raise ValueError(
                f"Ставка не может быть ниже {MIN_RATE_PER_HOUR} ₽ в час"
            )
        if self.rate_type == "perShift" and self.rate < MIN_RATE_PER_SHIFT:
            raise ValueError(
                f"Оплата за смену не может быть ниже {MIN_RATE_PER_SHIFT} ₽"
            )
        # Смена во вчерашнем дне принималась молча — и тут же пропадала из
        # ленты, потому что прошедшие смены в неё не попадают. Заведение
        # опубликовало смену, увидело её у себя в списке и ждало откликов,
        # которых физически не могло быть. Ошибиться легко: в календаре
        # телефона соседние числа стоят вплотную.
        from .timeutil import local_today

        # Именно по времени ГОРОДА смены. С одним поясом на сервис заведение
        # во Владивостоке не могло опубликовать смену на сегодня уже с двух
        # часов дня по местному: для московского сервера этот день ещё не
        # наступил.
        if self.date < local_today(self.city):
            raise ValueError("Смена не может быть в прошлом")
        return self


class VacancyOut(BaseModel):
    id: str
    employer_id: str
    company_name: str
    company_photo_url: str
    employer_verified: bool
    role: str
    date: str
    start_time: int
    end_time: int
    rate: int
    rate_type: str
    pay_method: str = "cash"
    tips: str = "none"
    description: str
    require_med_book: bool
    require_experience: bool
    headcount: int = 1
    slots_left: int = 1   # сколько мест ещё свободно
    lat: float
    lng: float
    address: str
    city: str = ""
    interior_photo_url: str
    status: str
    distance_km: float | None = None
    # Доверие к заведению (видно ДО отклика): рейтинг от соискателей,
    # сколько смен уже закрыто и признак «платит вовремя».
    employer_rating: float = 0.0
    employer_shifts_done: int = 0
    employer_pays_on_time: bool = False


# ---- swipes / matches ----
class SwipeIn(BaseModel):
    target_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    target_type: Literal["vacancy", "user"]
    direction: Literal["like", "dislike"]
    # На КАКУЮ смену заведение зовёт человека. Без этого поля сервер выбирал
    # смену сам — первую попавшуюся из тех, что человек лайкнул. На экране
    # «Кто откликнулся» под карточкой прямо написано «Бариста · 19 августа»,
    # заведение жало «Беру на смену» — и мэтч мог оказаться на другую свою
    # смену. Для свайпа по вакансии поле не нужно: там смена и есть цель.
    vacancy_id: Annotated[
        str, StringConstraints(min_length=1, max_length=64)
    ] | None = None


class SwipeOut(BaseModel):
    recorded: bool
    matched: bool
    match_id: str | None = None
    # НА КАКУЮ смену получилось совпадение. Соискатель это и так видит — он
    # смахнул конкретную карточку. А заведение листает людей, смену там выбрать
    # негде, и сервер подбирает ближайшую сам: без этих полей экран «Взаимно!»
    # у заведения не мог сказать, на какой день и час оно только что позвало
    # человека. Заполняются только когда matched=true.
    vacancy_id: str | None = None
    role: str = ""
    shift_date: str = ""
    shift_start: int = 0
    shift_end: int = 0


class MatchOut(BaseModel):
    id: str
    user_id: str
    employer_id: str
    vacancy_id: str
    status: str
    confirmed_by_seeker: bool
    confirmed_by_employer: bool
    # Код прихода виден ТОЛЬКО заведению (называет работнику на месте).
    checkin_code: str | None = None
    checked_in: bool = False  # смена закрыта (обе стороны подтвердили)
    seeker_checked_in: bool = False
    employer_checked_in: bool = False
    disputed: bool = False
    shift_pay: int = 0  # оплата смены, ₽ (для празднования дохода в UI)
    # Когда смена. Без этих полей приложение не знало о смене ничего, кроме
    # названия заведения: человек открывал чат и не видел, на какой день и час
    # он вообще договорился. Плюс по ним видно, какие действия ещё уместны —
    # отменить и перенести можно только НЕ начавшуюся смену, а сказать «не
    # состоялась» — только после её окончания.
    shift_date: str = ""      # ГГГГ-ММ-ДД
    shift_start: int = 0      # минуты от полуночи
    shift_end: int = 0
    # Предложенный перенос. Полей не было в ответе вовсе, а приложение рисует
    # кнопки «Согласен / Не смогу» именно по ним — то есть работник получал
    # уведомление «откройте чат, чтобы согласиться», открывал и не находил,
    # на что нажать. Фича была мертва со стороны интерфейса.
    reschedule_date: str = ""
    reschedule_start: int | None = None
    reschedule_end: int | None = None
    # С КЕМ и НА ЧТО договорились. Этих полей в ответе не было вовсе: приложение
    # рисовало их из демо-данных, поэтому на разработческой сборке всё выглядело
    # правильно, а на живом сервере каждая строка «Моих смен» превращалась в
    # безымянное «Заведение» без должности, и то же самое видел работодатель —
    # список людей без имён. Отдаём только участникам мэтча: они уже договорились
    # работать вместе. Телефона и ИНН здесь нет.
    role: str = ""            # должность на смене
    company_name: str = ""    # название заведения (видит соискатель)
    company_photo_url: str = ""
    seeker_name: str = ""     # имя работника (видит заведение)


# ---- chat ----
class MessageIn(BaseModel):
    text: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
    ]


# ---- жалобы (trust & safety) ----
class ReportIn(BaseModel):
    target_type: Literal["vacancy", "user", "match"]
    target_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    reason: Literal["spam", "fake", "scam", "abuse", "other"]
    text: Annotated[str, StringConstraints(max_length=1000)] = ""


class MessageOut(BaseModel):
    id: str
    match_id: str
    sender_id: str
    text: str
    is_system: bool
    # Время написания. Его не отдавали вовсе, и в чате не было ни одной даты.
    # Для спора это главное: «написал в 23:40, что не выйдет» без времени —
    # не довод, а слова. Оператор разбирает спор по переписке, и порядок
    # событий в ней должен быть виден.
    created_at: datetime
