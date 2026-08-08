"""Счёт и акт для заведения-юрлица.

Ресторан не может оплатить комиссию по безналу без счёта с реквизитами, а
поставить расход — без акта. Этих документов в проекте не было вовсе, и это
был блокер для первого платящего клиента.
"""
import pytest

from app.timeutil import local_today

REQUISITES = {
    "org_name": "ИП Петров Пётр Петрович",
    "org_inn": "770101234567",
    "org_bank_account": "40802810000000012345",
    "org_bank_bic": "044525225",
    "org_bank_name": "ПАО Сбербанк",
    "org_corr_account": "30101810400000000225",
    "org_signer": "Петров П.П.",
}


@pytest.fixture()
def requisites(monkeypatch):
    from app.config import settings

    for k, v in REQUISITES.items():
        monkeypatch.setattr(settings, k, v, False)
    return settings


def _employer_with_debt(client):
    """Заведение с одной закрытой сменой и неоплаченной комиссией."""
    from app.db import SessionLocal
    from app.models import Employer, Match

    emp = client.post("/auth/telegram",
                      json={"init_data": "", "role": "employer"}).json()
    eh = {"Authorization": f"Bearer {emp['access_token']}"}
    v = client.post("/vacancies", headers=eh, json={
        "role": "barista", "date": local_today(), "start_time": 600,
        "end_time": 1080, "rate": 350, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Тверская, 1",
    }).json()
    seek = client.post("/auth/telegram",
                       json={"init_data": "", "role": "seeker"}).json()
    sh = {"Authorization": f"Bearer {seek['access_token']}"}
    client.post("/swipes", headers=eh, json={
        "target_id": seek["user_id"], "target_type": "user", "direction": "like"})
    sw = client.post("/swipes", headers=sh, json={
        "target_id": v["id"], "target_type": "vacancy",
        "direction": "like"}).json()
    mid = sw["match_id"]
    client.post(f"/matches/{mid}/confirm", headers=sh)
    client.post(f"/matches/{mid}/confirm", headers=eh)
    rows = client.get("/matches", headers=eh).json()
    code = [m for m in rows if m["id"] == mid][0]["checkin_code"]
    client.post(f"/matches/{mid}/checkin", headers=sh, json={"code": code})
    client.post(f"/matches/{mid}/attendance", headers=eh, json={"attended": True})

    db = SessionLocal()
    try:
        e = db.get(Employer, emp["user_id"])
        e.company_name = "ООО «Лак Бистро»"
        e.inn = "7707123456"
        e.address = "Москва, Никольская, 10"
        db.commit()
        assert db.get(Match, mid).status == "completed"
    finally:
        db.close()
    return emp["access_token"], emp["user_id"]


def test_invoice_has_everything_a_bookkeeper_needs(client, requisites):
    """В счёте есть реквизиты получателя, плательщик, сумма и прописью."""
    pypdf = pytest.importorskip("pypdf")
    import io

    token, _ = _employer_with_debt(client)
    r = client.get("/billing/invoice.pdf", params={"token": token})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"

    text = " ".join(
        pypdf.PdfReader(io.BytesIO(r.content)).pages[0].extract_text().split()
    )
    assert "Счёт на оплату" in text
    assert REQUISITES["org_inn"] in text            # ИНН получателя
    assert REQUISITES["org_bank_account"] in text   # расчётный счёт
    assert REQUISITES["org_bank_bic"] in text       # БИК
    assert "Лак Бистро" in text                     # плательщик
    assert "7707123456" in text                     # ИНН плательщика
    assert "280" in text                            # комиссия 10% от 2800
    assert "Двести восемьдесят рублей" in text      # сумма прописью
    assert "НДС не облагается" in text


def test_act_is_issued_for_the_same_shifts(client, requisites):
    pypdf = pytest.importorskip("pypdf")
    import io

    token, _ = _employer_with_debt(client)
    r = client.get("/billing/act.pdf", params={"token": token})
    assert r.status_code == 200
    text = " ".join(
        pypdf.PdfReader(io.BytesIO(r.content)).pages[0].extract_text().split()
    )
    assert "Акт оказанных услуг" in text
    assert "претензий" in text
    assert "280" in text


def test_document_number_is_stable(client, requisites):
    """Повторное скачивание даёт ТОТ ЖЕ номер: иначе бухгалтерия получит два
    разных документа на одну оплату."""
    import re

    pypdf = pytest.importorskip("pypdf")
    import io

    token, _ = _employer_with_debt(client)

    def number():
        r = client.get("/billing/invoice.pdf", params={"token": token})
        text = pypdf.PdfReader(io.BytesIO(r.content)).pages[0].extract_text()
        return re.search(r"№ (\d+)", text).group(1)

    assert number() == number()


def test_no_documents_without_requisites(client):
    """Без реквизитов документ не выдаём: бумага с прочерками бесполезна."""
    token, _ = _employer_with_debt(client)
    r = client.get("/billing/invoice.pdf", params={"token": token})
    assert r.status_code == 503
    assert "Реквизиты" in r.json()["detail"]


def test_no_invoice_without_debt(client, requisites):
    """Нечего выставлять — честный 404, а не пустой документ."""
    emp = client.post("/auth/telegram",
                      json={"init_data": "", "role": "employer"}).json()
    r = client.get("/billing/invoice.pdf",
                   params={"token": emp["access_token"]})
    assert r.status_code == 404


def test_seeker_cannot_get_an_invoice(client, requisites):
    seek = client.post("/auth/telegram",
                       json={"init_data": "", "role": "seeker"}).json()
    r = client.get("/billing/invoice.pdf",
                   params={"token": seek["access_token"]})
    assert r.status_code == 403


def test_invoice_requires_a_token(client, requisites):
    assert client.get("/billing/invoice.pdf").status_code == 401
    assert client.get("/billing/invoice.pdf",
                      params={"token": "мусор"}).status_code == 401
