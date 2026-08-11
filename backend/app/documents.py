"""Счёт и акт от сервиса заведению — документы для безнала.

Ресторан-юрлицо не может оплатить комиссию просто «картой из приложения»:
бухгалтерии нужен счёт с реквизитами получателя, а чтобы поставить расход —
акт оказанных услуг. Без этих двух бумаг оплата по безналу невозможна, и
никакой код этого не заменит.

Пока реквизиты в настройках не заполнены, документы НЕ выдаются. Бумага с
прочерками вместо ИНН и расчётного счёта бесполезна: бухгалтерия вернёт её,
а у заведения останется ощущение, что сервис несерьёзный.
"""
import zlib
from datetime import datetime
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from sqlalchemy.orm import Session

from .config import settings
from .models import Commission, Employer, Vacancy
from .roles import role_ru
from .rubles import plural, rubles_in_words
from .timeutil import local_now

_NL = {"new_x": XPos.LMARGIN, "new_y": YPos.NEXT}
_FONT_DIR = Path(__file__).resolve().parent / "fonts"

class RequisitesMissing(Exception):
    """Не заполнены реквизиты получателя платежа."""


def _pdf() -> FPDF:
    pdf = FPDF()
    pdf.add_font("D", "", str(_FONT_DIR / "DejaVuSans.ttf"))
    pdf.add_font("D", "B", str(_FONT_DIR / "DejaVuSans-Bold.ttf"))
    pdf.add_page()
    return pdf


def _fmt_date(iso: str) -> str:
    try:
        return datetime.strptime(iso[:10], "%Y-%m-%d").strftime("%d.%m.%Y")
    except (ValueError, TypeError):
        return iso or "-"


def doc_number(prefix: str, employer_id: str, period: str) -> str:
    """Номер документа — постоянный для одной пары «заведение + период».

    Считаем детерминированно (crc32), а не счётчиком в базе: повторное
    скачивание того же счёта должно давать тот же номер, иначе бухгалтерия
    получит два разных документа на одну оплату.
    """
    key = f"{prefix}:{employer_id}:{period}".encode()
    return f"{zlib.crc32(key) % 100000:05d}"


def _pending(db: Session, employer_id: str) -> list[Commission]:
    """Начисления к оплате — из них складывается СЧЁТ."""
    return (
        db.query(Commission)
        .filter(
            Commission.employer_id == employer_id,
            Commission.status == "pending",
        )
        .order_by(Commission.created_at)
        .all()
    )


def _for_period(
    db: Session, employer_id: str, period: str
) -> list[Commission]:
    """Все начисления за месяц — из них складывается АКТ.

    Именно все, а не только неоплаченные. Акт подтверждает, что услуга
    оказана, и нужен заведению для расходов — то есть в первую очередь по
    ОПЛАЧЕННЫМ смемам. Сначала акт собирался из тех же неоплаченных, что и
    счёт, и получалось наоборот: заведение с балансом (комиссия списывается
    сразу и помечается оплаченной) не могло получить акт вообще.
    """
    # Месяц обязан быть 01–12: строка вроде «2026-13» проходила прежнюю
    # проверку формата, превращалась в дату «2026-13-01» и роняла документ.
    try:
        year, month = (int(x) for x in period.split("-"))
    except ValueError:
        raise LookupError("Период указан неверно") from None
    if not 1 <= month <= 12:
        raise LookupError("Период указан неверно")
    start = f"{year:04d}-{month:02d}-01"
    end = f"{year + (month // 12)}-{(month % 12) + 1:02d}-01"
    return (
        db.query(Commission)
        .filter(
            Commission.employer_id == employer_id,
            Commission.created_at >= datetime.fromisoformat(start),
            Commission.created_at < datetime.fromisoformat(end),
        )
        .order_by(Commission.created_at)
        .all()
    )


def _requisites_block(pdf: FPDF) -> None:
    """Шапка с реквизитами получателя — по ней бухгалтер делает платёж."""
    rows = [
        ("Получатель", settings.org_name),
        ("ИНН / КПП", f"{settings.org_inn}"
                      + (f" / {settings.org_kpp}" if settings.org_kpp else "")),
        ("Счёт получателя", settings.org_bank_account),
        ("Банк", settings.org_bank_name),
        ("БИК", settings.org_bank_bic),
        ("Корр. счёт", settings.org_corr_account),
    ]
    pdf.set_font("D", size=9)
    for label, value in rows:
        if not value:
            continue
        pdf.set_font("D", size=9)
        pdf.cell(45, 6, f"{label}:", border=0)
        pdf.set_font("D", "B", 9)
        pdf.multi_cell(0, 6, str(value), **_NL)
    pdf.ln(2)


def _party_block(pdf: FPDF, emp: Employer) -> None:
    pdf.set_font("D", size=9)
    pdf.cell(45, 6, "Плательщик:")
    pdf.set_font("D", "B", 9)
    pdf.multi_cell(0, 6, emp.company_name or "-", **_NL)
    if emp.inn:
        pdf.set_font("D", size=9)
        pdf.cell(45, 6, "ИНН плательщика:")
        pdf.set_font("D", "B", 9)
        pdf.multi_cell(0, 6, emp.inn, **_NL)
    if emp.address:
        pdf.set_font("D", size=9)
        pdf.cell(45, 6, "Адрес:")
        pdf.set_font("D", "B", 9)
        pdf.multi_cell(0, 6, emp.address, **_NL)
    pdf.ln(3)


def _table(pdf: FPDF, rows: list[tuple[str, str, str]], total: int) -> None:
    """Таблица позиций: наименование, количество, сумма."""
    pdf.set_font("D", "B", 9)
    for title, w in (("Наименование услуги", 120), ("Кол-во", 25), ("Сумма, ₽", 35)):
        pdf.cell(w, 8, title, border=1, align="C")
    pdf.ln()
    pdf.set_font("D", size=9)
    for name, qty, amount in rows:
        y0 = pdf.get_y()
        pdf.multi_cell(120, 6, name, border=1)
        h = pdf.get_y() - y0
        pdf.set_xy(pdf.l_margin + 120, y0)
        pdf.cell(25, h, qty, border=1, align="C")
        pdf.cell(35, h, amount, border=1, align="R", **_NL)
    pdf.set_font("D", "B", 10)
    pdf.cell(145, 8, "Итого:", border=1, align="R")
    pdf.cell(35, 8, str(total), border=1, align="R", **_NL)
    pdf.ln(2)
    pdf.set_font("D", size=9)
    vat = (
        "В том числе НДС 20%." if settings.org_vat
        else "НДС не облагается."
    )
    pdf.multi_cell(0, 5, f"Всего услуг: {len(rows)}. {vat}", **_NL)
    pdf.multi_cell(0, 5, f"Сумма прописью: {rubles_in_words(total)}.", **_NL)


def _signature(pdf: FPDF, title: str) -> None:
    pdf.ln(10)
    pdf.set_font("D", size=9)
    pdf.cell(0, 6, f"{title}: ______________________ / "
                   f"{settings.org_signer or '____________________'}", **_NL)
    pdf.set_font("D", size=7)
    pdf.cell(0, 4, "                          подпись", **_NL)


def _period_label() -> str:
    now = local_now()
    return f"{now.year}-{now.month:02d}"


def invoice_pdf(db: Session, employer_id: str) -> tuple[bytes, str]:
    """Счёт на оплату комиссии за закрытые смены. Возвращает (pdf, имя файла)."""
    if not settings.org_ready:
        raise RequisitesMissing
    emp = db.get(Employer, employer_id)
    if emp is None:
        raise LookupError("Заведение не найдено")
    items = _pending(db, employer_id)
    if not items:
        raise LookupError("Нет неоплаченной комиссии — счёт выставлять не за что")

    period = _period_label()
    number = doc_number("inv", employer_id, period)
    total = sum(c.amount for c in items)

    pdf = _pdf()
    pdf.set_font("D", "B", 14)
    pdf.cell(0, 9, f"Счёт на оплату № {number} от "
                   f"{local_now().strftime('%d.%m.%Y')}", **_NL)
    pdf.ln(2)
    _requisites_block(pdf)
    _party_block(pdf, emp)

    rows = []
    for c in items:
        vac = db.get(Vacancy, _vacancy_id_for(db, c))
        when = _fmt_date(vac.date) if vac else _fmt_date(c.created_at.isoformat())
        # Должность известна не всегда (смену могли снять) — тогда пишем
        # просто про смену, без «смена, смена».
        what = (
            f"{role_ru(vac.role)}, смена {when}" if vac
            else f"смена {when}"
        )
        rows.append((
            f"Услуги подбора персонала: {what} "
            f"(оплата смены {c.shift_pay} ₽)",
            "1", str(c.amount),
        ))
    _table(pdf, rows, total)

    pdf.ln(3)
    pdf.set_font("D", size=9)
    pdf.multi_cell(
        0, 5,
        f"Оплатить в течение {settings.commission_due_days} "
        f"{plural(settings.commission_due_days, 'дня', 'дней', 'дней')} "
        f"с даты счёта. В назначении платежа укажите номер счёта.",
        **_NL,
    )
    _signature(pdf, "Руководитель")
    return bytes(pdf.output()), f"schet_{number}.pdf"


def act_pdf(
    db: Session, employer_id: str, period: str = ""
) -> tuple[bytes, str]:
    """Акт оказанных услуг за месяц (для расходов заведения).

    period — «ГГГГ-ММ»; по умолчанию текущий месяц. Акты закрывают период,
    поэтому чаще всего нужен именно прошлый месяц.
    """
    if not settings.org_ready:
        raise RequisitesMissing
    emp = db.get(Employer, employer_id)
    if emp is None:
        raise LookupError("Заведение не найдено")
    period = period or _period_label()
    items = _for_period(db, employer_id, period)
    if not items:
        raise LookupError("За этот месяц закрытых смен нет — акт пустой")
    number = doc_number("act", employer_id, period)
    total = sum(c.amount for c in items)

    pdf = _pdf()
    pdf.set_font("D", "B", 14)
    pdf.cell(0, 9, f"Акт оказанных услуг № {number} от "
                   f"{local_now().strftime('%d.%m.%Y')}", **_NL)
    pdf.ln(2)
    pdf.set_font("D", size=9)
    pdf.cell(45, 6, "Исполнитель:")
    pdf.set_font("D", "B", 9)
    pdf.multi_cell(0, 6, f"{settings.org_name}, ИНН {settings.org_inn}", **_NL)
    _party_block(pdf, emp)

    rows = [(
        f"Услуги подбора персонала на смену "
        f"(оплата смены {c.shift_pay} ₽)", "1", str(c.amount),
    ) for c in items]
    _table(pdf, rows, total)

    pdf.ln(3)
    pdf.set_font("D", size=9)
    pdf.multi_cell(
        0, 5,
        "Услуги оказаны полностью и в срок. Заказчик претензий по объёму, "
        "качеству и срокам не имеет.",
        **_NL,
    )
    pdf.ln(8)
    pdf.set_font("D", size=9)
    pdf.cell(95, 6, "Исполнитель:")
    pdf.cell(0, 6, "Заказчик:", **_NL)
    pdf.ln(8)
    pdf.cell(95, 6, "______________ / ____________________")
    pdf.cell(0, 6, "______________ / ____________________", **_NL)
    return bytes(pdf.output()), f"akt_{number}.pdf"


def _vacancy_id_for(db: Session, c: Commission) -> str:
    """Смена, за которую начислена комиссия (через мэтч)."""
    from .models import Match

    m = db.get(Match, c.match_id)
    return m.vacancy_id if m else ""
