"""Генерация PDF-акта выполненных работ для самозанятого."""
import zlib
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from fpdf import FPDF
from fpdf.enums import XPos, YPos
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employer, Match, User, Vacancy
from ..ratelimit import rate_limit_ip
from ..roles import role_ru
from ..rubles import plural, rubles_in_words
from ..security import decode_token, ensure_token_usable

router = APIRouter(prefix="/matches", tags=["acts"])

# Перенос строки в fpdf2 без устаревшего ln=True.
_NL = {"new_x": XPos.LMARGIN, "new_y": YPos.NEXT}

# Юникод-шрифт DejaVu (кириллица) — акт печатается нормальным русским, а не
# транслитом. Шрифт лежит в репозитории (backend/app/fonts), чтобы работать и
# в докер-образе без системных шрифтов.
_FONT_DIR = Path(__file__).resolve().parent.parent / "fonts"


def _pdf() -> FPDF:
    pdf = FPDF()
    pdf.add_font("DejaVu", "", str(_FONT_DIR / "DejaVuSans.ttf"))
    pdf.add_font("DejaVu", "B", str(_FONT_DIR / "DejaVuSans-Bold.ttf"))
    pdf.add_page()
    return pdf


def _fmt_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _fmt_date(iso: str) -> str:
    """2026-08-07 → 07.08.2026. В русском документе дата пишется так."""
    try:
        return datetime.strptime(iso, "%Y-%m-%d").strftime("%d.%m.%Y")
    except (ValueError, TypeError):
        return iso or "-"


def act_number(match_id: str) -> str:
    """Номер акта — навсегда один и тот же для одной смены.

    Раньше номер считался через hash(): в Python хеш строк солится случайно
    при каждом старте процесса, поэтому один и тот же акт скачивался сегодня
    под номером 70658, а завтра — под 12345. Для документа, на который
    ссылается бухгалтерия, это недопустимо. crc32 детерминирован.
    """
    return f"{zlib.crc32(match_id.encode()) % 100000:05d}"


@router.get(
    "/{match_id}/act.pdf",
    # Генерация PDF — ~40 мс процессора на запрос, а токен передаётся в
    # адресе: гонять можно было чем угодно, хоть curl в цикле. Лимит по IP,
    # а не по аккаунту: заголовка Authorization здесь нет — браузер открывает
    # PDF по прямой ссылке и заголовков не шлёт.
    dependencies=[Depends(rate_limit_ip("act", 20, 60))],
)
def act_pdf(match_id: str, token: str = "", db: Session = Depends(get_db)):
    # Браузер открывает PDF через window.open — токен передаётся как query-параметр.
    principal = decode_token(token)
    if principal is None:
        raise HTTPException(status_code=401, detail="Нужен токен")
    # Query-токен идёт мимо current_principal — проверяем теми же правилами:
    # иначе забаненный или разлогиненный тянул бы акт с ИНН обеих сторон.
    ensure_token_usable(db, principal)
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["id"] not in (m.user_id, m.employer_id):
        raise HTTPException(status_code=403, detail="Нет доступа к акту")
    # Только по ЗАКРЫТОЙ смене. Раньше акт выдавался и по «подтверждённой»,
    # то есть за неделю до самой смены: получался первичный бухгалтерский
    # документ «услуги оказаны полностью и в срок» на работу, которой ещё не
    # было, — и с ИНН обеих сторон внутри.
    if m.status != "completed":
        raise HTTPException(
            status_code=409,
            detail="Акт будет доступен после закрытия смены.",
        )
    vac = db.get(Vacancy, m.vacancy_id)
    emp = db.get(Employer, m.employer_id)
    user = db.get(User, m.user_id)
    if not (vac and emp and user):
        raise HTTPException(status_code=404, detail="Недостаточно данных")

    # Длительность с учётом ночных смен (например 20:00→04:00): переход за
    # полночь даёт отрицательную разницу — добавляем сутки.
    dur_min = vac.end_time - vac.start_time
    if dur_min <= 0:
        dur_min += 1440
    pay = vac.rate if vac.rate_type == "perShift" else round(vac.rate * dur_min / 60)
    hours = dur_min / 60
    role_name = role_ru(vac.role)
    city = vac.city or "Москва"

    pdf = _pdf()
    pdf.set_font("DejaVu", "B", 15)
    pdf.cell(
        0, 9,
        f"Акт № {act_number(m.id)} от {_fmt_date(vac.date)}",
        align="C", **_NL,
    )
    pdf.set_font("DejaVu", size=11)
    pdf.cell(0, 6, "выполненных работ (оказанных услуг)", align="C", **_NL)
    pdf.ln(3)

    # Место и дата составления — обязательные реквизиты первичного документа.
    pdf.set_font("DejaVu", size=10)
    pdf.cell(95, 6, f"г. {city}")
    pdf.cell(0, 6, _fmt_date(vac.date), align="R", **_NL)
    pdf.ln(3)

    rows = [
        ("Заказчик", emp.company_name or "-"),
        ("ИНН / ОГРН заказчика", f"{emp.inn or '-'} / {emp.ogrn or '-'}"),
        ("Адрес места оказания услуг", vac.address or "-"),
        ("Исполнитель", user.name or "-"),
        ("ИНН исполнителя", user.inn or "-"),
        ("Статус исполнителя",
         "Самозанятый (плательщик НПД)" if user.self_employed else "Физическое лицо"),
    ]
    for label, value in rows:
        pdf.set_font("DejaVu", size=10)
        pdf.cell(62, 7, f"{label}:", border=0)
        pdf.set_font("DejaVu", "B", 10)
        pdf.multi_cell(0, 7, str(value), **_NL)

    pdf.ln(3)

    # Таблица услуг: из неё видно, откуда взялась сумма. В споре «вы посчитали
    # не то» этот расчёт снимает половину вопросов.
    pdf.set_font("DejaVu", "B", 9)
    head = [("Наименование услуги", 95), ("Кол-во", 22), ("Цена, ₽", 30),
            ("Сумма, ₽", 33)]
    for title, w in head:
        pdf.cell(w, 8, title, border=1, align="C")
    pdf.ln()

    if vac.rate_type == "perShift":
        qty, price = "1 смена", vac.rate
    else:
        qty = f"{hours:.1f} ".replace(".0 ", " ") + plural(
            int(hours), "час", "часа", "часов")
        price = vac.rate
    name = (
        f"Услуги по профессии «{role_name}», "
        f"{_fmt_date(vac.date)}, "
        f"{_fmt_time(vac.start_time)}–{_fmt_time(vac.end_time)}"
    )
    pdf.set_font("DejaVu", size=9)
    y0 = pdf.get_y()
    pdf.multi_cell(95, 6, name, border=1)
    y1 = pdf.get_y()
    pdf.set_xy(pdf.l_margin + 95, y0)
    h = y1 - y0
    pdf.cell(22, h, qty, border=1, align="C")
    pdf.cell(30, h, str(price), border=1, align="R")
    pdf.cell(33, h, str(pay), border=1, align="R", **_NL)

    pdf.set_font("DejaVu", "B", 10)
    pdf.cell(147, 8, "Итого:", border=1, align="R")
    pdf.cell(33, 8, str(pay), border=1, align="R", **_NL)

    pdf.ln(2)
    pdf.set_font("DejaVu", size=10)
    pdf.multi_cell(0, 6, f"Сумма прописью: {rubles_in_words(pay)}.", **_NL)

    pdf.ln(2)
    pdf.set_font("DejaVu", size=9)
    pdf.multi_cell(
        0, 5,
        "Услуги оказаны полностью и в срок. Заказчик претензий по объёму, "
        "качеству и срокам не имеет. Исполнитель — плательщик налога на "
        "профессиональный доход; чек формируется исполнителем в приложении "
        "«Мой налог» и является документом, подтверждающим оплату. "
        "Настоящий акт чек НПД не заменяет.",
    )

    # Подписи: без них акт — просто справка. Строки печатаются пустыми,
    # стороны подписывают от руки при расчёте.
    pdf.ln(8)
    pdf.set_font("DejaVu", size=10)
    pdf.cell(95, 6, "Заказчик:")
    pdf.cell(0, 6, "Исполнитель:", **_NL)
    pdf.ln(8)
    pdf.cell(95, 6, "______________ / ____________________")
    pdf.cell(0, 6, "______________ / ____________________", **_NL)
    pdf.set_font("DejaVu", size=7)
    pdf.cell(95, 4, "        подпись                       расшифровка")
    pdf.cell(0, 4, "        подпись                       расшифровка", **_NL)

    pdf.ln(6)
    pdf.set_font("DejaVu", size=7)
    pdf.cell(0, 4, "Сформировано в StaffSwipe", align="C", **_NL)

    data = pdf.output()
    return Response(
        content=bytes(data),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="act_{vac.id}.pdf"'
        },
    )
