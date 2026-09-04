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
    # ОГРНИП и адрес: их просили заполнить в настройках, а в счёт они не
    # попадали. Бухгалтерия заведения сверяет получателя платежа именно по
    # ним — счёт без них возвращают на доработку.
    "org_ogrn": "321774600123456",
    "org_address": "Москва, ул. Никольская, д. 10",
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
    # Смену нельзя закрыть раньше её окончания — доводим до конца.
    from datetime import UTC, datetime, timedelta

    from app.models import Vacancy
    db0 = SessionLocal()
    try:
        vac = db0.get(Vacancy, db0.get(Match, mid).vacancy_id)
        vac.date = (datetime.now(UTC) - timedelta(days=1)).strftime("%Y-%m-%d")
        db0.commit()
    finally:
        db0.close()
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


def test_invoice_has_everything_a_bookkeeper_needs(client, requisites, doc_token):
    """В счёте есть реквизиты получателя, плательщик, сумма и прописью."""
    pypdf = pytest.importorskip("pypdf")
    import io

    token, _ = _employer_with_debt(client)
    r = client.get("/billing/invoice.pdf", params={"token": doc_token(client, token)})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"

    text = " ".join(
        pypdf.PdfReader(io.BytesIO(r.content)).pages[0].extract_text().split()
    )
    assert "Счёт на оплату" in text
    assert REQUISITES["org_inn"] in text            # ИНН получателя
    assert REQUISITES["org_bank_account"] in text   # расчётный счёт
    assert REQUISITES["org_bank_bic"] in text       # БИК
    assert REQUISITES["org_ogrn"] in text           # ОГРНИП получателя
    assert "Никольская" in text                     # адрес получателя
    assert "Лак Бистро" in text                     # плательщик
    assert "7707123456" in text                     # ИНН плательщика
    assert "280" in text                            # комиссия 10% от 2800
    assert "Двести восемьдесят рублей" in text      # сумма прописью
    assert "НДС не облагается" in text


def test_act_is_issued_for_the_same_shifts(client, requisites, doc_token):
    pypdf = pytest.importorskip("pypdf")
    import io

    token, _ = _employer_with_debt(client)
    r = client.get("/billing/act.pdf", params={"token": doc_token(client, token)})
    assert r.status_code == 200
    text = " ".join(
        pypdf.PdfReader(io.BytesIO(r.content)).pages[0].extract_text().split()
    )
    assert "Акт оказанных услуг" in text
    assert "претензий" in text
    assert "280" in text


def test_document_number_is_stable(client, requisites, doc_token):
    """Повторное скачивание даёт ТОТ ЖЕ номер: иначе бухгалтерия получит два
    разных документа на одну оплату."""
    import re

    pypdf = pytest.importorskip("pypdf")
    import io

    token, _ = _employer_with_debt(client)

    def number():
        r = client.get("/billing/invoice.pdf",
                       params={"token": doc_token(client, token)})
        text = pypdf.PdfReader(io.BytesIO(r.content)).pages[0].extract_text()
        return re.search(r"№ (\d+)", text).group(1)

    assert number() == number()


def test_no_documents_without_requisites(client, doc_token):
    """Без реквизитов документ не выдаём: бумага с прочерками бесполезна."""
    token, _ = _employer_with_debt(client)
    r = client.get("/billing/invoice.pdf", params={"token": doc_token(client, token)})
    assert r.status_code == 503
    assert "Реквизиты" in r.json()["detail"]


def test_no_invoice_without_debt(client, requisites, doc_token):
    """Нечего выставлять — честный 404, а не пустой документ."""
    emp = client.post("/auth/telegram",
                      json={"init_data": "", "role": "employer"}).json()
    r = client.get("/billing/invoice.pdf",
                   params={"token": doc_token(client, emp["access_token"])})
    assert r.status_code == 404


def test_seeker_cannot_get_an_invoice(client, requisites, doc_token):
    seek = client.post("/auth/telegram",
                       json={"init_data": "", "role": "seeker"}).json()
    r = client.get("/billing/invoice.pdf",
                   params={"token": doc_token(client, seek["access_token"])})
    assert r.status_code == 403


def test_invoice_requires_a_token(client, requisites, doc_token):
    assert client.get("/billing/invoice.pdf").status_code == 401
    assert client.get("/billing/invoice.pdf",
                      params={"token": "мусор"}).status_code == 401
    # И обычный, «полный» токен теперь тоже не годится: документ открывает
    # только короткий (POST /auth/doc-token).
    full, _eid = _employer_with_debt(client)
    assert client.get("/billing/invoice.pdf",
                      params={"token": full}).status_code == 401


def test_act_is_issued_for_paid_commission_too(client, requisites, doc_token):
    """Заведение с балансом получает акт.

    Комиссия у такого заведения списывается сразу и помечается оплаченной.
    Сначала акт собирался из тех же НЕоплаченных начислений, что и счёт, —
    и получалось наоборот: тот, кто заплатил, акт получить не мог, хотя
    именно ему он и нужен для расходов.
    """
    from app.db import SessionLocal
    from app.models import Commission

    token, eid = _employer_with_debt(client)
    db = SessionLocal()
    try:
        for c in db.query(Commission).filter(Commission.employer_id == eid):
            c.status = "paid"
        db.commit()
    finally:
        db.close()

    # Счёт выставлять не за что — всё оплачено.
    assert client.get("/billing/invoice.pdf",
                      params={"token": doc_token(client, token)}).status_code == 404
    # А акт обязан быть.
    r = client.get("/billing/act.pdf", params={"token": doc_token(client, token)})
    assert r.status_code == 200, "акт не выдан заведению, которое заплатило"


def test_act_period_must_be_valid(client, requisites, doc_token):
    token, _ = _employer_with_debt(client)
    r = client.get("/billing/act.pdf",
                   params={"token": doc_token(client, token), "period": "август"})
    assert r.status_code == 400


def test_act_for_a_month_without_shifts_is_404(client, requisites, doc_token):
    token, _ = _employer_with_debt(client)
    r = client.get("/billing/act.pdf",
                   params={"token": doc_token(client, token), "period": "2020-01"})
    assert r.status_code == 404


def test_document_link_is_short_lived_and_useless_elsewhere(
    client, requisites, doc_token,
):
    """Токен из адреса документа не открывает больше ничего.

    PDF браузер тянет по прямой ссылке и заголовков не шлёт, поэтому токен
    приходится класть в адрес — а адрес оседает в истории браузера и в логах
    сервера. Раньше туда клался обычный токен: он живёт днями и открывает всё,
    и одной строки из лога хватало, чтобы войти в чужой аккаунт.

    Теперь для документа выдаётся отдельный токен. Проверяем оба свойства:
    документ он открывает, а обычные ручки — нет.
    """
    token, _eid = _employer_with_debt(client)
    short = doc_token(client, token)
    assert short != token, "для документа выдаётся отдельный токен"

    # Документ — открывает.
    assert client.get(
        "/billing/invoice.pdf", params={"token": short}
    ).status_code == 200

    # А обычные ручки — нет, даже свои собственные.
    head = {"Authorization": f"Bearer {short}"}
    assert client.get("/me", headers=head).status_code == 401
    assert client.get("/matches", headers=head).status_code == 401
    assert client.post("/auth/doc-token", headers=head).status_code == 401, (
        "и новый токен по нему не выписать — иначе срок жизни продлевался бы "
        "бесконечно"
    )


def test_full_token_no_longer_opens_documents(client, requisites, doc_token):
    """Обычный токен в адресе документа больше не принимается.

    Иначе смысл короткого теряется: старые ссылки продолжали бы работать.
    """
    token, _eid = _employer_with_debt(client)
    r = client.get("/billing/invoice.pdf", params={"token": token})
    assert r.status_code == 401
    assert "устарел" in r.json()["detail"].lower()
