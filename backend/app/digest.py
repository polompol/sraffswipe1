"""Дайджест свежих смен и напоминания о смене.

Чистая логика выбора получателей/сообщений (тестируется без бота) + отправка
через notify_owner (тихий no-op без токена). В проде вызывается планировщиком
(cron): `build_*` собирает, `send_*` рассылает.
"""
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from .cities import normalize
from .models import Employer, Match, Swipe, User, Vacancy
from .notify import notify_owner
from .roles import date_ru, role_ru, time_ru
from .rubles import plural
from .shift_rules import accrue_commission, sys_message
from .timeutil import local_today, shift_end_utc

_log = logging.getLogger("staffswipe")


def _today() -> str:
    # Дата смены — местная. Считать её по часам сервера значит с 21:00 UTC
    # (полночь в Москве) напоминать людям про вчерашний день.
    return local_today()


def _fmt_time(minutes: int) -> str:
    return time_ru(minutes)


def build_digest(db: Session, limit: int = 3) -> dict[str, list[str]]:
    """Для каждого соискателя — до `limit` свежих активных смен в его городе,
    которые он ещё не свайпал. Возвращает {user_id: [тексты строк смен]}."""
    out: dict[str, list[str]] = {}

    # Смены читаем ОДИН раз на всю рассылку и раскладываем по городам.
    # Раньше на каждого человека делалось два отдельных запроса: все его
    # свайпы и ВСЕ активные смены страны, которые тут же отсеивались в Python.
    # При тысяче человек это две тысячи запросов и тысяча полных выгрузок
    # ленты — ночная рассылка занимала бы базу целиком.
    blocked_emps = {
        e[0] for e in db.query(Employer.id).filter(Employer.blocked.is_(True))
    }
    by_city: dict[str, list[Vacancy]] = {}
    for v in (
        db.query(Vacancy)
        .filter(Vacancy.status == "active")
        .order_by(Vacancy.created_at.desc())
        .all()
    ):
        if v.employer_id in blocked_emps:
            continue
        # Смену, которая уже прошла, звать смотреть незачем: в ленте её нет, а
        # в письме она была — человек открывал приложение и не находил ничего.
        if v.date < local_today(v.city):
            continue
        # Через справочник, а не строкой: у человека в анкете может лежать
        # «Питер», а у смены — «Санкт-Петербург». Буква в букву они не
        # совпадут никогда, и дайджест этому человеку не придёт вовсе.
        by_city.setdefault(normalize(v.city or "").lower(), []).append(v)
    if not by_city:
        return out

    # Свайпы — тоже одним запросом и только по этим сменам: свайпы по старым
    # сменам на рассылку не влияют, тянуть их незачем.
    live_ids = [v.id for city in by_city.values() for v in city]
    swiped: dict[str, set[str]] = {}
    for swiper_id, target_id in db.query(
        Swipe.swiper_id, Swipe.target_id
    ).filter(Swipe.target_type == "vacancy", Swipe.target_id.in_(live_ids)):
        swiped.setdefault(swiper_id, set()).add(target_id)

    for u in db.query(User).filter(User.blocked.is_(False)).all():
        if not u.city:
            continue
        vacs = by_city.get(normalize(u.city).lower())
        if not vacs:
            continue
        seen = swiped.get(u.id, ())
        picked: list[str] = []
        for v in vacs:
            if v.id in seen:
                continue
            # Должность по-русски и дата по-человечески: в базе лежит
            # «barista» и «2026-08-12», а в дайджест это уходило как есть.
            picked.append(f"{role_ru(v.role)} · {v.rate}₽ · {date_ru(v.date)}")
            if len(picked) >= limit:
                break
        if picked:
            out[u.id] = picked
    return out


def send_digest(db: Session, limit: int = 3) -> int:
    """Разослать дайджест. Возвращает число отправленных (для метрик/тестов)."""
    sent = 0
    for user_id, lines in build_digest(db, limit).items():
        text = "Свежие смены рядом:\n" + "\n".join(f"• {x}" for x in lines)
        notify_owner(db, user_id, text)
        sent += 1
    return sent


def build_reminders(db: Session) -> list[tuple[str, str, str]]:
    """Напоминания о сменах на сегодня: (match_id, кому, текст).

    Берём смены, по которым работник ЕЩЁ НЕ отметился и по которым сегодня
    ещё не напоминали.

    Неподтверждённые смены раньше не напоминались вовсе — а это как раз тот
    случай, когда напомнить важнее всего. Стороны договорились в чате, кнопку
    «Подтвердить» никто не нажал, и смена остаётся ничьей: кода прихода нет,
    акта не будет, спор открыть не по чему, и заведение за неё не платит.
    Честные люди попадают сюда по забывчивости, поэтому пишем ОБОИМ и прямо
    говорим, чего не хватает.
    """
    today = _today()
    # В базе берём с запасом в сутки в обе стороны, а «сегодня» сверяем по
    # городу каждой смены: во Владивостоке новый день наступает на семь часов
    # раньше московского, и напоминание «сегодня смена» приходило либо на день
    # раньше, либо ночью.
    from datetime import date as _date
    from datetime import timedelta as _td

    span = [
        (_date.fromisoformat(today) + _td(days=d)).isoformat()
        for d in (-1, 0, 1)
    ]
    rows = (
        db.query(Match, Vacancy)
        .join(Vacancy, Match.vacancy_id == Vacancy.id)
        .filter(
            Match.status.in_(("confirmed", "matched")),
            Match.seeker_checked_in.is_(False),
            Vacancy.date.in_(span),
        )
        .all()
    )
    result: list[tuple[str, str, str]] = []
    for m, v in rows:
        if v.date != local_today(v.city):
            continue
        if m.reminded_on == v.date:
            continue
        where = v.address or v.city or ""
        when = f"Сегодня смена в {_fmt_time(v.start_time)}" + (
            f", {where}" if where else ""
        )
        if m.status == "confirmed":
            result.append((m.id, m.user_id, (
                when
                + ".\n\nКогда придёте — попросите у администратора код и "
                "введите его в приложении. Это не обязательно, смена закроется "
                "и так, но код — ваше доказательство, что вы были на месте."
            )))
            continue
        # Смена сегодня, а подтверждения нет — пишем обеим сторонам.
        result.append((m.id, m.user_id, (
            when + ", но заведение ещё не подтвердило её."
            "\n\nПока смена не подтверждена, у неё нет кода прихода и не будет "
            "акта. Напишите в чат смены и попросите подтвердить — это одна "
            "кнопка."
        )))
        result.append((m.id, m.employer_id, (
            f"Смена сегодня в {_fmt_time(v.start_time)} не подтверждена, "
            "а человек её ждёт.\n\nПодтвердите её в приложении — тогда "
            "появится код прихода и акт. Если смена не нужна, скажите об этом "
            "в чате, чтобы человек не приехал зря."
        )))
    return result


def send_reminders(db: Session) -> int:
    """Разослать напоминания о сменах на сегодня. Возвращает число отправленных.

    Повторный запуск в тот же день ничего не дублирует: у мэтча проставляется
    дата напоминания. Поэтому вызывать можно и вручную из админки, и по крону.
    """
    reminders = build_reminders(db)
    for match_id, user_id, text in reminders:
        notify_owner(db, user_id, text,
                     open_app="Открыть смену", screen="shifts")
        m = db.get(Match, match_id)
        if m is not None:
            v = db.get(Vacancy, m.vacancy_id)
            # Помечаем ДАТОЙ СМЕНЫ, а не датой сервера: в восточном городе
            # день смены и день сервера расходятся, и напоминание уходило
            # человеку дважды.
            m.reminded_on = v.date if v is not None else _today()
    db.commit()
    return len(reminders)


def build_unfilled_alerts(db: Session) -> list[tuple[str, str, str]]:
    """Заведениям: «смена завтра, а людей нет». (vacancy_id, employer_id, текст).

    Заведение публикует смену и забывает про неё. Если откликов не было, оно
    узнаёт об этом утром в день смены — когда искать уже поздно. Никто об
    этом не предупреждал: напоминания были только работникам.

    Предупреждаем накануне — за день ещё можно поднять ставку, нажать
    «Срочно» или позвать знакомого.
    """
    from datetime import date
    from datetime import timedelta as _td

    # «Завтра» у каждого города своё. Берём в базе с запасом в сутки в обе
    # стороны, а точное «завтра» сверяем по городу смены: во Владивостоке
    # московское «завтра» — это уже сегодня, и предупреждение «людей нет»
    # приходило туда, когда искать замену поздно.
    try:
        base = date.fromisoformat(local_today())
    except ValueError:
        return []
    span = [(base + _td(days=d)).isoformat() for d in (0, 1, 2)]

    rows = [
        v
        for v in db.query(Vacancy)
        .filter(Vacancy.status == "active", Vacancy.date.in_(span))
        .all()
        if v.date == (
            date.fromisoformat(local_today(v.city)) + _td(days=1)
        ).isoformat()
    ]
    if not rows:
        return []
    # Считаем ЗАКРЫТЫМИ только подтверждённые места. Мэтч без подтверждения
    # («договариваемся») тоже занимает место в ленте — и это правильно, иначе
    # на одно место набежит десять человек. Но для предупреждения он ничего не
    # значит: заведение видело «мест не осталось», успокаивалось, а утром на
    # смену не приходил никто. Такие места считаем отдельно и говорим про них
    # прямо — это единственный момент, когда ещё можно успеть.
    def _count(*statuses: str) -> dict[str, int]:
        return {
            vid: int(n)
            for vid, n in db.query(Match.vacancy_id, func.count(Match.id))
            .filter(
                Match.vacancy_id.in_([v.id for v in rows]),
                Match.status.in_(statuses),
                Match.no_show.is_(False),
            )
            .group_by(Match.vacancy_id)
            .all()
        }

    confirmed = _count("confirmed", "completed")
    pending = _count("matched")

    out: list[tuple[str, str, str]] = []
    for v in rows:
        need = v.headcount or 1
        got = confirmed.get(v.id, 0)
        waiting = pending.get(v.id, 0)
        if got >= need:
            continue
        left = need - got
        # Формы были перепутаны: при двух-четырёх выходило «не хватает
        # 2 человек» — читается как опечатка.
        who = plural(left, "человека", "человека", "человек")
        text = (
            f"Завтра смена в {_fmt_time(v.start_time)}"
            + (f", {v.address}" if v.address else "")
            + f" — не хватает {left} {who}.\n\n"
        )
        if waiting:
            # Творительный падеж: «с 1 человеком», «с 2 людьми».
            ppl = plural(waiting, "человеком", "людьми", "людьми")
            text += (
                f"С {waiting} {ppl} вы уже договорились, но смену пока "
                "подтвердила только одна сторона — напомните в чате и нажмите "
                "«Подтвердить смену». Без этого место считается занятым, а "
                "выйти человек не обязан.\n\n"
            )
        text += (
            # Кнопки «Срочно» в приложении больше нет — она называется
            # «Позвать людей на эту смену». Звать нажать то, чего нет, нельзя.
            "Что помогает за день до смены: поднять ставку, нажать «Позвать "
            "людей на эту смену» или позвать своих через «Мои работники»."
        )
        out.append((v.id, v.employer_id, text))
    return out


def send_unfilled_alerts(db: Session) -> int:
    """Разослать предупреждения о незакрытых сменах на завтра."""
    alerts = build_unfilled_alerts(db)
    for _vid, employer_id, text in alerts:
        notify_owner(db, employer_id, text,
                     open_app="Открыть смену", screen="vacancies")
    return len(alerts)


def _shift_end(v: Vacancy) -> datetime:
    """Момент окончания смены в UTC (время смены — местное, см. timeutil)."""
    return shift_end_utc(v.date, v.start_time, v.end_time, v.city)


# Через сколько часов после конца смены она считается состоявшейся, если
# никто не сказал обратного. Смена вечером — расчёт на следующий день днём.
SETTLE_AFTER_HOURS = 12

# Насколько старую смену расчёт ещё готов закрыть. Дальше — молча оставляем
# оператору. Две причины. Первая: при включении новой механики в базе могут
# лежать подтверждённые смены за прошлые месяцы, и без этой границы первый же
# запуск выставил бы заведениям счёт сразу за всё. Вторая: спорить о смене
# двухнедельной давности бессмысленно — никто уже не помнит, как было.
SETTLE_MAX_AGE_DAYS = 14

# Через сколько часов после конца смены спрашиваем обе стороны «всё прошло как
# договаривались?». Раньше расчёта — чтобы возразить успели без спешки.
ASK_AFTER_HOURS = 2


def build_aftershift_asks(db: Session) -> list[tuple[str, str]]:
    """Пары (match_id, текст) — «вчера была смена, всё в порядке?».

    Единственное предупреждение перед тем, как за смену спишется комиссия.
    Без него авто-расчёт был бы неприятным сюрпризом: заведение узнавало бы о
    списании постфактум.
    """
    today = _today()
    deadline = datetime.now(UTC) - timedelta(hours=ASK_AFTER_HOURS)
    rows = (
        db.query(Match, Vacancy)
        .join(Vacancy, Match.vacancy_id == Vacancy.id)
        .filter(
            # И по сменам, которые подтвердил только работник: за них тоже
            # начисляется комиссия, значит спросить надо тем более.
            Match.status.in_(("confirmed", "matched")),
            Match.disputed.is_(False),
            Match.settle_notified_on != today,
        )
        .all()
    )
    out: list[tuple[str, str]] = []
    for m, v in rows:
        try:
            if _shift_end(v) > deadline:
                continue
        except ValueError:
            continue
        # Смену, которую подтвердил только работник, тоже засчитаем — но
        # заведение, которое так и не нажало «Подтвердить», об этом может не
        # догадываться. Говорим прямо, а не общими словами.
        if m.status == "matched":
            if not m.confirmed_by_seeker:
                continue
            out.append((
                m.id,
                f"Смена {date_ru(v.date)} в {_fmt_time(v.start_time)} "
                "завершилась. Вы её не подтверждали, но работник подтвердил "
                "выход — значит, засчитаем её как состоявшуюся и начислим "
                "комиссию.\n\n"
                "Если смены не было — откройте её, «Что-то пошло не так» → "
                "«Смена не состоялась», и комиссии не будет.",
            ))
            continue
        out.append((
            m.id,
            f"Смена {date_ru(v.date)} в {_fmt_time(v.start_time)} завершилась.\n\n"
            "Если всё прошло как договаривались — делать ничего не нужно, "
            "смена закроется сама.\n"
            # Путь к кнопке называем целиком: сама по себе «Смена не
            # состоялась» лежит внутри меню «Что-то пошло не так», и человек
            # искал её на экране, где её нет.
            "Если смены не было — откройте её, «Что-то пошло не так» → "
            "«Смена не состоялась». Иначе засчитаем её как состоявшуюся.",
        ))
    return out


def send_aftershift_asks(db: Session) -> int:
    """Разослать вопрос обеим сторонам. Повторов за день не будет."""
    today = _today()
    asks = build_aftershift_asks(db)
    for match_id, text in asks:
        m = db.get(Match, match_id)
        if m is None:
            continue
        for owner_id in (m.user_id, m.employer_id):
            # Сразу в нужную смену: в письме сказано «откройте её и нажмите»,
            # а кнопка вела в общий список — человек искал смену сам, и это
            # единственный шанс возразить до начисления комиссии.
            notify_owner(db, owner_id, text,
                         open_app="Открыть смену", screen="chat",
                         ident=match_id)
        m.settle_notified_on = today
    db.commit()
    return len(asks)


def settle_shifts(db: Session) -> int:
    """Закрыть состоявшиеся смены и начислить комиссию.

    Главное правило сервиса, и оно намеренно перевёрнуто по сравнению с тем,
    как было. Раньше смена закрывалась ТОЛЬКО когда обе стороны нажимали
    кнопку — значит, чтобы не платить 10%, заведению достаточно было ничего
    не нажимать и не называть работнику код прихода. Сторона, которая должна
    деньги, выигрывала от бездействия, и никакая отметка (ни код, ни
    геолокация) этого не лечила: код тоже давало заведение.

    Теперь: договорились о смене — смена считается состоявшейся, пока кто-то
    явно не сказал обратного кнопкой «Смена не состоялась». Молчание больше
    не бесплатно.

    Не трогаем: спорные смены (их решает оператор) и те, по которым уже
    заявили, что смены не было.
    """
    now = datetime.now(UTC)
    deadline = now - timedelta(hours=SETTLE_AFTER_HOURS)
    too_old = now - timedelta(days=SETTLE_MAX_AGE_DAYS)
    rows = (
        db.query(Match, Vacancy)
        .join(Vacancy, Match.vacancy_id == Vacancy.id)
        .filter(
            # «matched» здесь не случайно, см. ниже про подтверждение одной
            # стороной: без него заведение не платило, просто не нажимая
            # кнопку, — а это та же дыра, ради которой всё правило и писалось.
            Match.status.in_(("confirmed", "matched")),
            Match.disputed.is_(False),
            Match.not_held_by == "",
        )
        .all()
    )
    closed = 0
    for m, v in rows:
        try:
            ends = _shift_end(v)
        except ValueError:  # некорректная дата в вакансии — пропускаем
            continue
        if ends > deadline:
            continue
        # СМЕНА, КОТОРУЮ ПОДТВЕРДИЛ РАБОТНИК, МОЛЧАНИЕМ НЕ ОТМЕНИТЬ.
        #
        # Правило «молчание = смена состоялась» действовало только на
        # подтверждённые обеими сторонами смены — и ровно на шаг раньше
        # оставалась та самая дыра, ради которой оно писалось: заведение не
        # нажимает «Подтвердить», расчёт такую смену не берёт, комиссии нет
        # никогда. Сторона, которая должна деньги, снова выигрывала от
        # бездействия.
        #
        # Заведение уже выбрало этого человека на эту смену (взаимный лайк по
        # конкретной вакансии), а работник сказал «выхожу». Молчание третьим
        # ответом быть не может. Выйти из смены заведение может двумя
        # кнопками, и обе уже есть: отменить до смены или «Смена не
        # состоялась» после. Плюс утром его об этом спрашивают отдельно.
        #
        # А смену, которую не подтвердил никто, просто закрываем без денег и
        # без неявки: договорённости не было, и висеть вечно ей незачем.
        if m.status == "matched" and not m.confirmed_by_seeker:
            m.status = "expired"
            sys_message(db, m.id,
                 "Смена закрыта: её не подтвердил никто. Комиссии нет.")
            continue
        if ends < too_old:
            # Слишком старая: счёт задним числом за то, чего никто уже не
            # помнит, — верный способ поссориться с заведением. Закрываем без
            # комиссии, чтобы смена не висела вечно и не держала место.
            m.status = "expired"
            sys_message(db, m.id,
                 "Смена закрыта без комиссии: с её окончания прошло слишком "
                 "много времени, чтобы разбираться автоматически.")
            continue
        # Закрываем атомарным UPDATE с теми же условиями, что стояли в
        # запросе выше, — а не присваиванием полю.
        #
        # Условия «не спорная» и «никто не заявил, что смены не было»
        # проверялись ОДИН раз, при чтении списка. Между чтением и записью
        # проходит весь прогон: заведение в это время может нажать «Смена не
        # состоялась», работник — открыть спор. Присваивание полю затирало это
        # возражение и начисляло комиссию за смену, против которой только что
        # возразили явно. Ровно то, что доктрина сервиса запрещает: не платить
        # можно только явно, и явное возражение всегда сильнее молчания.
        #
        # Условие внутри UPDATE проверяет сама база в момент записи, поэтому
        # окна между проверкой и записью не остаётся вовсе.
        applied = (
            db.query(Match)
            .filter(
                Match.id == m.id,
                Match.disputed.is_(False),
                Match.not_held_by == "",
            )
            .update(
                {Match.status: "completed", Match.no_show: False},
                synchronize_session=False,
            )
        )
        if not applied:
            # Возразили, пока шёл расчёт. Смену не трогаем: её судьбу решит
            # либо оператор (спор), либо уже проставленное «не состоялась».
            db.rollback()
            continue
        db.refresh(m)
        accrue_commission(db, m)
        sys_message(db, m.id, "Смена закрыта ✓ Возражений не поступило.")
        # Коммит на КАЖДУЮ смену, и только потом уведомления. Раньше был один
        # коммит на весь прогон, а сообщения улетали сразу: любой конфликт при
        # записи (например гонка с отметкой кодом, где на комиссию стоит
        # уникальный индекс) откатывал всю пачку — люди уже получили «смена
        # закрыта, комиссия начислена», а в базе не закрылось ничего, и назавтра
        # приходило второе такое же сообщение.
        try:
            db.commit()
        except Exception:  # noqa: BLE001 — одна смена не должна ронять прогон
            db.rollback()
            _log.exception("Не удалось закрыть смену %s", m.id)
            continue
        notify_owner(
            db, m.employer_id,
            "Смена закрыта: возражений не было. Комиссия — 10% от смены.",
        )
        notify_owner(
            db, m.user_id,
            "Смена закрыта ✓ В разделе «Мои смены» можно скачать акт "
            "и оценить заведение.",
            open_app="Открыть смены", screen="shifts",
        )
        closed += 1
    db.commit()
    return closed
