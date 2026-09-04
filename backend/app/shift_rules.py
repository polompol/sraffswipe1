"""Правила смены: когда она закрыта, сколько стоит и кто кому должен.

Это самое дорогое место в проекте: здесь считается оплата, начисляется
комиссия и решается, состоялась ли смена. Раньше всё это лежало посреди
роутера мэтчей, и два соседних модуля тянули его оттуда локальными
импортами внутри функций — иначе получался цикл. Теперь правила живут
отдельно, а роутер занимается своим делом: разбирает запрос и отвечает.

Главное правило продукта: МОЛЧАНИЕ = СМЕНА СОСТОЯЛАСЬ. Обратное было дырой —
смена закрывалась только по кнопкам обеих сторон, и заведению было выгодно
молчать и не называть код прихода. Не платить можно только явно, кнопкой
«Смена не состоялась».
"""
import logging
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .models import Commission, Entitlement, Match, Message, Report, Vacancy, WalletTxn
from .notify import notify_admins
from .roles import time_ru
from .timeutil import shift_end_utc

logger = logging.getLogger("staffswipe.shift_rules")


def sys_message(db: Session, match_id: str, text: str) -> None:
    db.add(Message(match_id=match_id, sender_id="system", text=text, is_system=True))


def fmt_time(minutes: int) -> str:
    return time_ru(minutes)


def fmt_date(iso: str) -> str:
    """2026-08-09 → 9 августа: в предупреждении человек должен узнать смену."""
    months = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля",
              "августа", "сентября", "октября", "ноября", "декабря")
    try:
        y, mth, d = (int(x) for x in iso.split("-"))
        return f"{d} {months[mth - 1]}"
    except (ValueError, IndexError):
        return iso


def planned_minutes(v: Vacancy) -> int:
    mins = v.end_time - v.start_time
    if mins <= 0:
        mins += 1440  # ночная смена через полночь
    return mins


def shift_pay(v: Vacancy, actual_minutes: int | None = None) -> int:
    """Оплата смены, ₽ (зеркало estimatedPay в TMA).

    actual_minutes — фактическая длительность, если смена разошлась с
    объявленной: человек опоздал, ушёл раньше или задержался. Почасовая
    оплата считается по факту, посменная — нет: там договорились на смену
    целиком, и часы значения не имеют.
    """
    if v.rate_type == "perShift":
        return v.rate
    mins = actual_minutes if actual_minutes is not None else planned_minutes(v)
    return round(v.rate * mins / 60)


def already_accrued(db: Session, match_id: str) -> bool:
    """Есть ли уже начисление по этой смене.

    Отдельной функцией, а не строкой внутри: между этой проверкой и вставкой
    есть окно, в которое успевает вторая сторона (ночной расчёт и кнопка
    заведения могут сойтись в одну секунду). Окно закрыто уникальностью
    match_id и перехватом ошибки ниже — а чтобы это можно было проверить
    тестом, проверку надо уметь «ослепить».
    """
    row = db.query(Commission).filter(Commission.match_id == match_id).first()
    return row is not None


def accrue_commission(db: Session, m: Match) -> None:
    """Начисляем комиссию за закрытую смену. Идемпотентно — по одной записи
    на смену. Если у заведения есть денежный баланс (аванс) — списываем сразу;
    иначе комиссия висит pending и попадает в недельный счёт."""
    if settings.commission_pct <= 0:
        return
    if already_accrued(db, m.id):
        return
    v = db.get(Vacancy, m.vacancy_id)
    if v is None:
        return
    pay = shift_pay(v, m.actual_minutes)
    # Округляем половину ВВЕРХ, а не «к чётному», как делает round(): при
    # комиссии 282.5 ₽ он давал 282, а при 283.5 — 284. Объяснить заведению
    # такую логику невозможно, а копейки в бухгалтерии всплывают.
    fee = int(
        (Decimal(pay) * settings.commission_pct / 100).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )
    amount = max(settings.commission_min_rub, fee)
    c = Commission(
        employer_id=m.employer_id, match_id=m.id, shift_pay=pay, amount=amount,
    )
    # Всё начисление — в отдельной «точке отката» (SAVEPOINT).
    #
    # Проверка выше («начисление уже есть?») не спасает от гонки: расчёт по
    # расписанию и кнопка «Смена состоялась» могут сойтись на одной смене в
    # одну секунду, оба увидят «начисления нет» и оба вставят запись. Вторая
    # вставка упирается в уникальность match_id — раньше эта ошибка вылетала
    # наверх: человеку показывалась «Внутренняя ошибка сервера», а ночной
    # расчёт падал на этой смене целиком и не доходил до остальных.
    #
    # С точкой отката проигравший в гонке откатывает только свою вставку
    # (и своё списание с баланса — двойного списания не будет), а всё, что
    # сделано до этого, остаётся. Комиссия уже начислена соседом — работа
    # выполнена, поэтому просто выходим.
    try:
        with db.begin_nested():
            # Атомарный UPDATE с условием «хватает денег» — двойное списание
            # при гонке невозможно.
            paid = (
                db.query(Entitlement)
                .filter(
                    Entitlement.owner_id == m.employer_id,
                    Entitlement.balance_rub >= amount,
                )
                .update(
                    {Entitlement.balance_rub: Entitlement.balance_rub - amount},
                    synchronize_session=False,
                )
            )
            if paid:
                c.status = "paid"
                db.add(WalletTxn(
                    owner_id=m.employer_id, amount=-amount, kind="commission",
                    note=f"Комиссия за смену {m.id[:8]}",
                ))
                sys_message(
                    db, m.id, f"Комиссия {amount} ₽ списана с баланса заведения ✓"
                )
            db.add(c)
            db.flush()
    except IntegrityError:
        logger.info("комиссия по смене %s уже начислена параллельно", m.id)


def maybe_complete(db: Session, m: Match) -> None:
    """Обе стороны подтвердили выход — закрываем сразу, не дожидаясь расчёта.

    Но НЕ раньше конца самой смены. Иначе пара аккаунтов набивала себе
    закрытые смены, рейтинг и бейдж «Платит вовремя» за пару минут: заведение
    жмёт «человек пришёл», видит собственный код и вводит его за работника —
    и смена, назначенная на следующую неделю, уже «состоялась».
    """
    if (
        m.status == "confirmed"
        and m.seeker_checked_in
        and m.employer_checked_in
        and not m.disputed
        and shift_is_over(db, m)
    ):
        m.status = "completed"
        m.no_show = False
        accrue_commission(db, m)
        sys_message(db, m.id, "Обе стороны подтвердили выход ✓ Смена закрыта.")


def shift_is_over(db: Session, m: Match) -> bool:
    """Смена уже закончилась по времени?

    Одно правило на весь модуль. Без него «закрыть смену» и «отметить неявку»
    работали в любой момент, в том числе за неделю ДО смены, и это ломало сразу
    три вещи: работник получал ложную неявку и не мог даже отметиться кодом;
    пара аккаунтов набивала себе рейтинг и бейдж «Платит вовремя» за минуты, не
    дожидаясь никаких смен; акт «услуги оказаны полностью и в срок» выдавался
    на работу, которой ещё не было.
    """
    v = db.get(Vacancy, m.vacancy_id)
    if v is None:
        return True  # смены нет — блокировать нечего
    try:
        return datetime.now(UTC) >= shift_end_utc(
            v.date, v.start_time, v.end_time, v.city
        )
    except (ValueError, TypeError):
        return True  # битая дата — не мешаем людям работать


def open_dispute(db: Session, m: Match, note: str) -> None:
    """Пометить смену спорной и завести разбор для оператора.

    Споры, рождавшиеся автоматически (стороны разошлись в показаниях), не
    создавали жалобу вовсе — единственным сигналом было сообщение админам в
    Telegram, а оно шлётся «как получится» и молча глотает сбои. В админ-панели
    таких смен не было видно нигде, а расчёт их не трогает: деньги зависали
    навсегда, и никто об этом не знал.
    """
    if m.disputed:
        return
    m.disputed = True
    db.add(Report(
        reporter_id="system", target_type="match", target_id=m.id,
        reason="other", text=note[:1000],
    ))
    notify_admins(f"⚠️ Спор по смене {m.id[:8]}: {note[:160]} Админ-панель.")
