"""Генерация PDF-акта выполненных работ для самозанятого."""
from fastapi import APIRouter, Depends, HTTPException, Response
from fpdf import FPDF
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employer, Match, User, Vacancy
from ..security import decode_token

router = APIRouter(prefix="/matches", tags=["acts"])


def _fmt_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


@router.get("/{match_id}/act.pdf")
def act_pdf(match_id: str, token: str = "", db: Session = Depends(get_db)):
    # Браузер открывает PDF через window.open — токен передаётся как query-параметр.
    principal = decode_token(token)
    if principal is None:
        raise HTTPException(status_code=401, detail="Нужен токен")
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["id"] not in (m.user_id, m.employer_id):
        raise HTTPException(status_code=403, detail="Нет доступа к акту")
    vac = db.get(Vacancy, m.vacancy_id)
    emp = db.get(Employer, m.employer_id)
    user = db.get(User, m.user_id)
    if not (vac and emp and user):
        raise HTTPException(status_code=404, detail="Недостаточно данных")

    pay = (
        vac.rate
        if vac.rate_type == "perShift"
        else round(vac.rate * (vac.end_time - vac.start_time) / 60)
    )
    act_no = abs(hash(vac.id)) % 100000

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, f"ACT / AKT No {act_no}", ln=True)
    pdf.set_font("Helvetica", size=11)
    pdf.cell(0, 7, "vypolnennyh rabot (okazannyh uslug)", ln=True)
    pdf.ln(4)

    rows = [
        ("Zakazchik / Customer", emp.company_name),
        ("INN", emp.inn),
        ("OGRN", emp.ogrn),
        ("Ispolnitel / Contractor", user.name),
        ("INN ispolnitelya", user.inn or "-"),
        ("Status", "Samozanyatyy (NPD)" if user.self_employed else "Fiz. litso"),
        ("Smena / Shift", vac.role),
        ("Data / Date", vac.date),
        ("Vremya / Time", f"{_fmt_time(vac.start_time)}-{_fmt_time(vac.end_time)}"),
        ("Summa / Total, RUB", str(pay)),
    ]
    for label, value in rows:
        pdf.set_font("Helvetica", size=11)
        pdf.cell(70, 8, f"{label}:", border=0)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, str(value), ln=True)

    pdf.ln(6)
    pdf.set_font("Helvetica", size=10)
    pdf.multi_cell(
        0,
        6,
        "Uslugi okazany polnostyu i v srok. Chek NPD formiruetsya ispolnitelem "
        "v prilozhenii 'Moy nalog'. Sformirovano v StaffSwipe.",
    )

    data = pdf.output()
    return Response(
        content=bytes(data),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="act_{vac.id}.pdf"'
        },
    )
