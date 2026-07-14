"""Генерация PDF-акта выполненных работ для самозанятого."""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from fpdf import FPDF
from fpdf.enums import XPos, YPos
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employer, Match, User, Vacancy
from ..security import _is_blocked, decode_token

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


# Русские названия должностей для акта (ключи — как в вакансии).
_ROLE_RU = {
    "waiter": "Официант", "waiter_assistant": "Помощник официанта",
    "barista": "Бариста", "cook": "Повар", "dishwasher": "Посудомойщик",
    "hostess": "Хостес", "bartender": "Бармен", "hookah": "Кальянщик",
    "florist": "Флорист", "administrator": "Администратор",
    "courier": "Курьер", "cleaner": "Уборщик",
}


def _fmt_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


@router.get("/{match_id}/act.pdf")
def act_pdf(match_id: str, token: str = "", db: Session = Depends(get_db)):
    # Браузер открывает PDF через window.open — токен передаётся как query-параметр.
    principal = decode_token(token)
    if principal is None:
        raise HTTPException(status_code=401, detail="Нужен токен")
    # Query-токен идёт мимо current_principal — проверяем бан вручную, иначе
    # забаненный по старому JWT (до 30 дней) тянул бы акт с ИНН обеих сторон.
    if _is_blocked(db, principal):
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["id"] not in (m.user_id, m.employer_id):
        raise HTTPException(status_code=403, detail="Нет доступа к акту")
    # Акт выполненных работ имеет смысл только для подтверждённой смены.
    if m.status not in ("confirmed", "completed"):
        raise HTTPException(
            status_code=409, detail="Акт доступен после подтверждения смены"
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
    act_no = abs(hash(vac.id)) % 100000

    pdf = _pdf()
    pdf.set_font("DejaVu", "B", 16)
    pdf.cell(0, 10, f"Акт № {act_no}", **_NL)
    pdf.set_font("DejaVu", size=11)
    pdf.cell(0, 7, "выполненных работ (оказанных услуг)", **_NL)
    pdf.ln(4)

    role_ru = _ROLE_RU.get(vac.role, vac.role)
    rows = [
        ("Заказчик", emp.company_name or "-"),
        ("ИНН заказчика", emp.inn or "-"),
        ("ОГРН", emp.ogrn or "-"),
        ("Исполнитель", user.name or "-"),
        ("ИНН исполнителя", user.inn or "-"),
        ("Статус", "Самозанятый (НПД)" if user.self_employed else "Физ. лицо"),
        ("Смена", role_ru),
        ("Дата", vac.date),
        ("Время", f"{_fmt_time(vac.start_time)}–{_fmt_time(vac.end_time)}"),
        ("Сумма, ₽", str(pay)),
    ]
    for label, value in rows:
        pdf.set_font("DejaVu", size=11)
        pdf.cell(70, 8, f"{label}:", border=0)
        pdf.set_font("DejaVu", "B", 11)
        pdf.cell(0, 8, str(value), **_NL)

    pdf.ln(6)
    pdf.set_font("DejaVu", size=10)
    pdf.multi_cell(
        0,
        6,
        "Услуги оказаны полностью и в срок. Чек НПД формируется исполнителем "
        "в приложении «Мой налог». Сформировано в StaffSwipe.",
    )

    data = pdf.output()
    return Response(
        content=bytes(data),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="act_{vac.id}.pdf"'
        },
    )
