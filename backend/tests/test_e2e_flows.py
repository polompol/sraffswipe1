"""СКВОЗНЫЕ ПУТИ: от регистрации до денег.

Остальные четыре сотни тестов проверяют куски по отдельности: свайп, мэтч,
комиссию, чат. Куски работали, а связка между ними — нет: то мэтч создавался
на соседнюю смену, то счётчик откликов врал, то «Мои смены» приходили без
названия заведения. Каждый раз отдельный тест был зелёным.

Здесь проверяется ровно то, чего не видно поштучно: человек проходит весь
путь целиком, и на каждом шаге у него на экране должно быть то, что нужно для
следующего шага.

Два пути:

  1. Человек нашёл смену сам — откликнулся, заведение согласилось.
  2. Заведение позвало первым — человек согласился.

Оба доводятся до конца: смена состоялась, комиссия начислена, деньги списаны.
Отдельно проверяется главное правило сервиса: МОЛЧАНИЕ = СМЕНА СОСТОЯЛАСЬ.
"""
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models import Commission, Employer, Match, User

# Ставка и часы демо-смены: 400 ₽/час × 8 часов = 3200 ₽ за смену.
# Комиссия 10% = 320 ₽. Числа выбраны так, чтобы делиться нацело: тест про
# деньги не должен спорить с округлением, у округления есть свои тесты.
RATE = 400
START = 10 * 60
END = 18 * 60
SHIFT_PAY = RATE * 8
FEE = SHIFT_PAY // 10


def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _detach(owner_id, tg_id):
    """Отвязать аккаунт от tg_id=0.

    В тестах вход без подписи выдаёт всем tg_id=0, а нулевой tg_id — это
    оператор (ADMIN_TG_IDS=0 в conftest). Без отвязки второй вход находил бы
    тот же аккаунт, и обе стороны сквозного пути оказались бы одним человеком.
    """
    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        o.tg_id = tg_id
        if (o.phone or "").startswith("tg:"):
            o.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _seeker(client, tg_id, name="Мария"):
    """Соискатель с заполненной анкетой — как после онбординга."""
    h, uid = _auth(client, "seeker")
    _detach(uid, tg_id)
    r = client.put("/me", headers=h, json={
        "name": name,
        "city": "Москва",
        "district": "Басманный",
        "roles": ["barista", "waiter"],
        "birth_date": "1998-04-12",
        "med_book": "yes",
        "about": "Опыт в кофейне, знаю Rancilio.",
    })
    assert r.status_code == 200, r.text
    return h, uid


def _employer(client, tg_id, company="Кофейня «Дрова»"):
    h, eid = _auth(client, "employer")
    _detach(eid, tg_id)
    r = client.put("/me", headers=h, json={
        "company_name": company,
        "city": "Москва",
        "address": "ул. Льва Толстого, 16",
        "contact_phone": "+79990000000",
    })
    assert r.status_code == 200, r.text
    return h, eid


def _publish(client, emp_h, days=2, role="barista"):
    day = (datetime.now(UTC) + timedelta(days=days)).date().isoformat()
    r = client.post("/vacancies", headers=emp_h, json={
        "role": role, "date": day, "start_time": START, "end_time": END,
        "rate": RATE, "rate_type": "perHour", "city": "Москва",
        "address": "ул. Льва Толстого, 16",
        "lat": 55.75, "lng": 37.61,
        "pay_method": "card", "tips": "shared",
        "description": "Нужен бариста на утро. Дресс-код: чёрный верх.",
    })
    assert r.status_code == 201, r.text
    return r.json()


def _like_shift(client, see_h, vacancy_id):
    return client.post("/swipes", headers=see_h, json={
        "target_id": vacancy_id, "target_type": "vacancy", "direction": "like",
    }).json()


def _invite(client, emp_h, seeker_id, vacancy_id=None):
    body = {"target_id": seeker_id, "target_type": "user", "direction": "like"}
    if vacancy_id:
        body["vacancy_id"] = vacancy_id
    return client.post("/swipes", headers=emp_h, json=body).json()


def _admin(client):
    """Оператор: единственный, у кого остался tg_id=0."""
    h, _ = _auth(client, "seeker")
    return h


def _commission_rows(match_id):
    db = SessionLocal()
    try:
        return [
            {"amount": c.amount, "status": c.status, "shift_pay": c.shift_pay}
            for c in db.query(Commission).filter(
                Commission.match_id == match_id).all()
        ]
    finally:
        db.close()


def _match_status(match_id):
    db = SessionLocal()
    try:
        m = db.get(Match, match_id)
        return m.status, m.no_show
    finally:
        db.close()


# ---------------------------------------------------------------- путь № 1


def test_seeker_finds_a_shift_and_gets_paid(client, age_shift):
    """Человек нашёл смену сам: лента → отклик → мэтч → чат → смена → деньги.

    Шаги идут ровно в том порядке, в каком их проходит живой человек, и на
    каждом проверяется то, что он реально видит на экране.
    """
    # 1. Заведение зарегистрировалось и опубликовало смену.
    emp_h, eid = _employer(client, 970001)
    vac = _publish(client, emp_h)

    # 2. Соискатель зарегистрировался, заполнил анкету и включил «готов сегодня».
    see_h, sid = _seeker(client, 970002)
    assert client.post("/me/available", headers=see_h,
                       json={"available": True}).json()["availableToday"] is True

    # 3. Смена видна в ленте — со всем, что нужно для решения.
    feed = client.get("/vacancies?city=Москва", headers=see_h).json()
    mine = next(v for v in feed if v["id"] == vac["id"])
    assert mine["company_name"] == "Кофейня «Дрова»"
    assert mine["rate"] == RATE and mine["rate_type"] == "perHour"
    assert mine["address"] == "ул. Льва Толстого, 16"
    assert mine["pay_method"] == "card"
    assert mine["slots_left"] == 1

    # 4. Откликнулся. Мэтча ещё нет — заведение не отвечало.
    first = _like_shift(client, see_h, vac["id"])
    assert first["recorded"] is True and first["matched"] is False
    assert client.get("/matches", headers=see_h).json() == []

    # 5. Заведение видит отклик: счётчик и список сходятся, смена названа.
    assert client.get("/me", headers=emp_h).json()["incomingLikes"] == 1
    applicants = client.get("/employer/applicants", headers=emp_h).json()
    assert len(applicants) == 1
    who = applicants[0]
    assert who["id"] == sid
    assert who["name"] == "Мария"
    assert who["vacancy_id"] == vac["id"], "видно, на какую смену откликнулись"
    assert who["vacancy_role"] == "barista"
    # ПДн в этом списке быть не должно: телефона и ИНН нет даже до мэтча.
    assert "phone" not in who and "inn" not in who

    # 6. Заведение зовёт именно на эту смену → мэтч.
    out = _invite(client, emp_h, sid, vac["id"])
    assert out["matched"] is True
    mid = out["match_id"]
    assert out["vacancy_id"] == vac["id"]
    assert out["shift_date"] == vac["date"]

    # Ответив, заведение убрало человека из «кто откликнулся».
    assert client.get("/me", headers=emp_h).json()["incomingLikes"] == 0
    assert client.get("/employer/applicants", headers=emp_h).json() == []

    # 7. Смена видна обеим сторонам — и каждая видит ВТОРУЮ сторону.
    mine_shifts = client.get("/matches", headers=see_h).json()
    assert [m["id"] for m in mine_shifts] == [mid]
    assert mine_shifts[0]["company_name"] == "Кофейня «Дрова»"
    assert mine_shifts[0]["role"] == "barista"
    assert mine_shifts[0]["shift_pay"] == SHIFT_PAY

    their_shifts = client.get("/matches", headers=emp_h).json()
    assert their_shifts[0]["seeker_name"] == "Мария"
    # Код прихода видит только заведение — оно его называет на месте.
    assert their_shifts[0]["checkin_code"] is None, "до подтверждения кода нет"
    assert mine_shifts[0]["checkin_code"] is None

    # 8. Договариваются в чате. Оба видят одну переписку.
    assert client.post(f"/matches/{mid}/messages", headers=emp_h,
                       json={"text": "Здравствуйте! Придёте к 10?"}
                       ).status_code in (200, 201)
    assert client.post(f"/matches/{mid}/messages", headers=see_h,
                       json={"text": "Да, буду."}).status_code in (200, 201)
    chat = client.get(f"/matches/{mid}/messages", headers=see_h).json()
    texts = [m["text"] for m in chat]
    assert "Здравствуйте! Придёте к 10?" in texts
    assert "Да, буду." in texts
    assert client.get(f"/matches/{mid}/messages", headers=emp_h).json()

    # 9. Соискатель подтверждает выход — теперь заведению виден код прихода.
    assert client.post(f"/matches/{mid}/confirm",
                       headers=see_h).status_code == 200
    assert client.post(f"/matches/{mid}/confirm",
                       headers=emp_h).status_code == 200
    code = client.get("/matches", headers=emp_h).json()[0]["checkin_code"]
    assert code and len(code) == 6 and code.isdigit()
    assert client.get("/matches", headers=see_h).json()[0]["checkin_code"] is None

    # 10. Смена прошла. Работник называет код — это его доказательство.
    age_shift(mid, 0)
    bad = client.post(f"/matches/{mid}/checkin", headers=see_h,
                      json={"code": "000000"})
    assert bad.status_code == 400, "чужой код не проходит"
    ok = client.post(f"/matches/{mid}/checkin", headers=see_h,
                     json={"code": code})
    assert ok.status_code == 200, ok.text
    assert ok.json()["seeker_checked_in"] is True

    # 11. Заведение подтверждает выход — смена закрывается сразу.
    assert client.post(f"/matches/{mid}/attendance", headers=emp_h,
                       json={"attended": True}).status_code == 200
    assert _match_status(mid) == ("completed", False)

    # 12. Деньги: одна комиссия, ровно 10% от суммы смены.
    rows = _commission_rows(mid)
    assert len(rows) == 1, "комиссия начисляется один раз за смену"
    assert rows[0]["shift_pay"] == SHIFT_PAY
    assert rows[0]["amount"] == FEE
    bill = client.get("/billing/commission", headers=emp_h).json()
    assert bill["pendingShifts"] == 1
    assert bill["pendingRub"] == FEE
    assert bill["overdue"] is False

    # 13. Надёжность работника выросла — её увидит следующее заведение.
    other_h, oid = _employer(client, 970003, "Бар «Полночь»")
    seen = client.get("/candidates?city=Москва", headers=other_h).json()
    card = next(c for c in seen if c["id"] == sid)
    assert card["shifts_total"] == 1 and card["shifts_attended"] == 1
    assert card["employers_total"] == 1
    # Точных координат дома и ИНН в общей ленте нет — только город и район.
    assert card["lat"] == 0.0 and card["lng"] == 0.0 and card["inn"] is None


# ---------------------------------------------------------------- путь № 2


def test_venue_invites_first_and_pays_from_balance(client, age_shift):
    """Заведение позвало первым, а комиссия списалась с аванса.

    И главное правило сервиса: после смены никто ничего не нажимал — значит
    смена состоялась. Обратное правило («закрываем только по кнопкам обеих
    сторон») было дырой: заведению было выгодно молчать.
    """
    emp_h, eid = _employer(client, 970010, "Ресторан «Грядка»")
    vac = _publish(client, emp_h, days=2, role="waiter")

    see_h, sid = _seeker(client, 970011, "Иван")
    client.post("/me/available", headers=see_h, json={"available": True})

    # Оператор принял перевод и зачислил аванс на баланс заведения.
    admin_h = _admin(client)
    credited = client.post(f"/admin/wallet/{eid}/credit", headers=admin_h,
                           json={"amount_rub": 1000, "note": "СБП"})
    assert credited.status_code == 200, credited.text
    assert client.get("/billing/commission",
                      headers=emp_h).json()["balanceRub"] == 1000

    # 1. Заведение листает кандидатов и видит человека, готового сегодня.
    cands = client.get("/candidates?city=Москва&available_today=true",
                       headers=emp_h).json()
    him = next(c for c in cands if c["id"] == sid)
    assert him["name"] == "Иван"
    assert him["available_today"] is True
    assert "waiter" in him["roles"]

    # 2. Зовёт. Мэтча нет: человек ещё не соглашался.
    out = _invite(client, emp_h, sid)
    assert out["matched"] is False, "звать — не значит договориться"
    assert client.get("/matches", headers=emp_h).json() == []

    # 3. Человек видит смену в ленте и откликается → мэтч.
    feed = client.get("/vacancies?city=Москва", headers=see_h).json()
    assert any(v["id"] == vac["id"] for v in feed)
    answer = _like_shift(client, see_h, vac["id"])
    assert answer["matched"] is True
    mid = answer["match_id"]

    # 4. Договорились в чате и подтвердили выход.
    client.post(f"/matches/{mid}/messages", headers=see_h,
                json={"text": "Приду к 10:00"})
    client.post(f"/matches/{mid}/confirm", headers=see_h)
    client.post(f"/matches/{mid}/confirm", headers=emp_h)

    # 5. Смена прошла. Никто ничего не нажал — расчёт закрывает её сам.
    age_shift(mid, 1)
    closed = client.post("/admin/shifts/auto-close", headers=admin_h).json()
    assert closed["closed"] >= 1
    assert _match_status(mid) == ("completed", False)

    # 6. Комиссия списана С БАЛАНСА, а не повисла счётом.
    rows = _commission_rows(mid)
    assert len(rows) == 1
    assert rows[0]["amount"] == FEE
    assert rows[0]["status"] == "paid", "есть аванс — списываем сразу"
    bill = client.get("/billing/commission", headers=emp_h).json()
    assert bill["balanceRub"] == 1000 - FEE
    assert bill["pendingRub"] == 0, "оплаченная комиссия в счёт не попадает"

    # 7. Повторный расчёт ничего не начисляет и не списывает второй раз.
    client.post("/admin/shifts/auto-close", headers=admin_h)
    assert len(_commission_rows(mid)) == 1
    assert client.get("/billing/commission",
                      headers=emp_h).json()["balanceRub"] == 1000 - FEE


# ------------------------------------------------- смена не состоялась


def _agree(client, emp_h, see_h, sid, vac_id):
    """Довести пару до подтверждённой смены — как перед выходом на работу."""
    _like_shift(client, see_h, vac_id)
    mid = _invite(client, emp_h, sid, vac_id)["match_id"]
    client.post(f"/matches/{mid}/confirm", headers=see_h)
    client.post(f"/matches/{mid}/confirm", headers=emp_h)
    return mid


def test_a_shift_that_did_not_happen_costs_nothing(client, age_shift):
    """Не платить можно только явно — кнопкой «Смена не состоялась».

    Это обратная сторона правила «молчание = смена состоялась»: у заведения
    остаётся честный способ не платить за смену, которой не было. Но способ
    этот не бесплатный: работнику записывается неявка, о ней ему приходит
    уведомление, и он может открыть спор. Иначе кнопка стала бы способом не
    платить за настоящую смену.
    """
    emp_h, eid = _employer(client, 970020, "Бар «Полночь»")
    vac = _publish(client, emp_h, days=2, role="bartender")
    see_h, sid = _seeker(client, 970021, "Пётр")
    mid = _agree(client, emp_h, see_h, sid, vac["id"])

    # До конца смены так сказать нельзя — на это есть отмена.
    early = client.post(f"/matches/{mid}/not-held", headers=emp_h,
                        json={"reason": "передумали"})
    assert early.status_code == 409, "смена ещё идёт — только отмена"

    age_shift(mid, 0)
    r = client.post(f"/matches/{mid}/not-held", headers=emp_h,
                    json={"reason": "Заведение закрыли на карантин"})
    assert r.status_code == 200, r.text

    # Расчёт такую смену не трогает: денег не берём ни с кого.
    admin_h = _admin(client)
    client.post("/admin/shifts/auto-close", headers=admin_h)
    assert _commission_rows(mid) == []
    assert client.get("/billing/commission",
                      headers=emp_h).json()["pendingRub"] == 0
    assert _match_status(mid) == ("expired", True), "заведение сказало — неявка"


def test_when_the_worker_says_it_did_not_happen_nobody_is_punished(client,
                                                                  age_shift):
    """О срыве сказал сам работник — наказывать его не за что.

    Это не симметрично нарочно: заведение, отменяющее смену, экономит 10%, а
    работник этой кнопкой не выигрывает ничего. Поэтому неявка ставится только
    когда о срыве говорит заведение.
    """
    emp_h, eid = _employer(client, 970040, "Ресторан «Грядка»")
    vac = _publish(client, emp_h, days=2, role="cook")
    see_h, sid = _seeker(client, 970041, "Ольга")
    mid = _agree(client, emp_h, see_h, sid, vac["id"])

    age_shift(mid, 0)
    r = client.post(f"/matches/{mid}/not-held", headers=see_h,
                    json={"reason": "Пришла — заведение закрыто"})
    assert r.status_code == 200, r.text
    assert _match_status(mid) == ("expired", False), "неявки на работнике нет"
    assert _commission_rows(mid) == []

    # В ленте у другого заведения статистика человека чистая.
    other_h, _ = _employer(client, 970042, "Кофейня «Дрова»")
    card = next(c for c in client.get("/candidates?city=Москва",
                                      headers=other_h).json()
                if c["id"] == sid)
    assert card["shifts_total"] == 0


def test_silence_after_a_denial_still_ends_in_a_dispute(client, age_shift):
    """Работник отметился кодом, а заведение говорит «не вышел» — это спор.

    Молчание закрывает смену само, но возражение против стороны, которая уже
    подтвердила выход, деньгами не решается: такие случаи разбирает оператор.
    """
    emp_h, eid = _employer(client, 970030, "Кофейня «Дрова»")
    vac = _publish(client, emp_h, days=2)
    see_h, sid = _seeker(client, 970031, "Анна")

    mid = _agree(client, emp_h, see_h, sid, vac["id"])
    code = client.get("/matches", headers=emp_h).json()[0]["checkin_code"]

    age_shift(mid, 0)
    assert client.post(f"/matches/{mid}/checkin", headers=see_h,
                       json={"code": code}).status_code == 200

    r = client.post(f"/matches/{mid}/attendance", headers=emp_h,
                    json={"attended": False})
    assert r.status_code == 200, r.text
    assert r.json()["disputed"] is True, "слово против слова — к оператору"

    db = SessionLocal()
    try:
        m = db.get(Match, mid)
        assert m.disputed is True
    finally:
        db.close()
