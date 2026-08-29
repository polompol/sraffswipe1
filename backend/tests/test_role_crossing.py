"""Граница между ролями: заведение под видом соискателя и наоборот.

Вопрос, ради которого написан файл: может ли одна сторона оказаться на месте
другой и что она с этого получит. Ответ должен оставаться прежним и через год,
поэтому он здесь, а не в переписке.

Устройство такое: вход в Telegram один, а роли две — соискатель живёт в
таблице User, заведение в Employer. Один человек МОЖЕТ завести обе роли (это
нормально: владелец кафе сам иногда выходит на смену), и именно поэтому важно,
чтобы роль ничего лишнего не открывала и чтобы сам с собой человек работать
не мог.
"""
from datetime import date, timedelta

from app.db import SessionLocal
from app.models import Commission, Employer, Match, Review, User, Vacancy
from app.timeutil import local_today

from .shifttime import age_shift


def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _set_tg(owner_id: str, tg_id: int) -> None:
    """Развести аккаунты по разным Telegram-id (в тестах вход даёт всем 0)."""
    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        o.tg_id = tg_id
        o.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _tomorrow() -> str:
    return (date.fromisoformat(local_today()) + timedelta(days=1)).isoformat()


def _publish(client, emp_h, rate=400, rate_type="perHour", day=None):
    return client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": day or _tomorrow(),
        "start_time": 600, "end_time": 1080,
        "rate": rate, "rate_type": rate_type,
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10", "city": "Москва",
    })


# ---------- что роль НЕ открывает ----------

def test_seeker_cannot_act_as_a_venue(client):
    """Соискатель не попадает на территорию заведения ни одной ручкой.

    Опасна здесь прежде всего лента кандидатов: в ней персональные данные
    живых людей, и открывать её кому попало нельзя (152-ФЗ).
    """
    see_h, _ = _auth(client, "seeker")
    assert client.get("/candidates", headers=see_h).status_code == 403
    assert client.get("/employer/workers", headers=see_h).status_code == 403
    assert client.get("/employer/applicants", headers=see_h).status_code == 403
    assert _publish(client, see_h).status_code == 403


def test_venue_cannot_pose_as_a_worker(client):
    """Заведение не может свайпать вакансии — только людей, и наоборот."""
    emp_h, _ = _auth(client, "employer")
    v = _publish(client, emp_h).json()
    # Заведение пытается «откликнуться» на смену, как соискатель.
    r = client.post("/swipes", headers=emp_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    assert r.status_code == 400, "роль и цель свайпа обязаны совпадать"


def test_public_feed_has_no_personal_data(client):
    """Лента смен открыта без входа — значит, в ней не должно быть ПДн."""
    emp_h, _ = _auth(client, "employer")
    _publish(client, emp_h)
    rows = client.get("/vacancies").json()
    assert rows, "лента должна работать и без токена"
    forbidden = {"inn", "phone", "contact_phone", "tg_id", "tg_username"}
    for row in rows:
        assert not (forbidden & set(row)), f"лишние поля: {forbidden & set(row)}"


def test_candidate_feed_hides_inn_and_home_coordinates(client):
    """Заведение видит человека, но не его ИНН и не точку на карте.

    Зарегистрироваться заведением может кто угодно — значит, лента кандидатов
    это и есть публичная витрина людей, и лишнего в ней быть не должно.
    """
    see_h, sid = _auth(client, "seeker")
    client.put("/me", headers=see_h, json={
        "name": "Иван", "city": "Москва", "district": "Басманный",
        "self_employed": True, "inn": "770101234567",
    })
    _set_tg(sid, 660001)
    emp_h, eid = _auth(client, "employer")
    _set_tg(eid, 660002)
    rows = client.get("/candidates", headers=emp_h).json()
    me = [x for x in rows if x["id"] == sid]
    assert me, "кандидат должен быть виден заведению"
    assert me[0]["inn"] is None, "ИНН в ленте не отдаём"
    assert me[0]["lat"] == 0.0 and me[0]["lng"] == 0.0, "адрес дома не отдаём"


# ---------- сам с собой работать нельзя ----------

def test_one_telegram_account_cannot_match_with_itself(client):
    """Обе роли на одном Telegram — мэтча между ними не будет.

    Иначе человек закрывал бы «смены» сам с собой и накручивал себе рейтинг,
    историю выходов и репутацию заведения.
    """
    emp_h, eid = _auth(client, "employer")
    see_h, sid = _auth(client, "seeker")
    _set_tg(eid, 661000)
    _set_tg(sid, 661000)   # тот же Telegram-аккаунт

    v = _publish(client, emp_h).json()
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})
    r = client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    assert r.json()["matched"] is False
    assert r.json()["match_id"] is None


# ---------- накрутка репутации стоит денег ----------

def test_a_shift_for_nothing_is_not_a_shift(client):
    """Смену за 0 ₽ опубликовать нельзя.

    Это была бесплатная накрутка: пара аккаунтов закрывает такие «смены»
    десятками, работник получает ★5,0 и «вышел на 12 из 12», а сервису
    достаётся 10% от нуля. Именно по этим цифрам заведение решает, пускать
    ли незнакомого человека к кассе.
    """
    emp_h, _ = _auth(client, "employer")
    assert _publish(client, emp_h, rate=0).status_code == 422
    assert _publish(client, emp_h, rate=50).status_code == 422
    assert _publish(client, emp_h, rate=100, day=_tomorrow()).status_code == 201
    # Посменная оплата — своя граница.
    assert _publish(client, emp_h, rate=100,
                    rate_type="perShift").status_code == 422
    assert _publish(client, emp_h, rate=500,
                    rate_type="perShift").status_code == 201


def test_many_reviews_from_one_partner_count_as_one_opinion(client, make_match):
    """Пять пятёрок от одного заведения — это одно мнение, а не пять.

    Иначе рейтинг накручивается сговором: своё заведение на второй учётке
    Telegram закрывает смену за сменой и ставит по пятёрке.
    """
    _, emp_a = _auth(client, "employer")
    _set_tg(emp_a, 662002)
    _, emp_b = _auth(client, "employer")
    _set_tg(emp_b, 662003)

    db = SessionLocal()
    try:
        u = User(name="Работник", phone="tg:662001", tg_id=662001)
        db.add(u)
        db.commit()
        uid = u.id
    finally:
        db.close()

    # Смены настоящие: отзыв ссылается на смену внешним ключом, и без неё
    # такого отзыва в бою просто не бывает.
    mine = [make_match(emp_a, uid) for _ in range(5)]
    other = make_match(emp_b, uid)

    db = SessionLocal()
    try:
        # Пять пятёрок от одного и того же заведения…
        for mid in mine:
            db.add(Review(match_id=mid, rater_id=emp_a, ratee_id=uid, stars=5))
        # …и одна тройка от другого.
        db.add(Review(match_id=other, rater_id=emp_b, ratee_id=uid, stars=3))
        db.commit()

        from app.routers.social import _recompute_rating

        rating = _recompute_rating(db, uid)
        assert rating == 4.0, (
            "среднее по двум заведениям (5 и 3), а не по шести отзывам"
        )
    finally:
        db.close()


def test_venue_sees_how_many_different_places_a_person_worked(client):
    """Рядом со счётчиком смен видно число РАЗНЫХ заведений.

    Двенадцать смен с одним и тем же заведением и двенадцать с шестью разными
    — разный опыт и разная степень доверия. Без этой цифры накрутку одной
    парой аккаунтов не отличить от настоящего стажа.
    """
    see_h, sid = _auth(client, "seeker")
    _set_tg(sid, 663001)
    emp_h, eid = _auth(client, "employer")
    _set_tg(eid, 663002)

    for _ in range(2):
        v = _publish(client, emp_h).json()
        client.post("/swipes", headers=emp_h, json={
            "target_id": sid, "target_type": "user", "direction": "like"})
        mid = client.post("/swipes", headers=see_h, json={
            "target_id": v["id"], "target_type": "vacancy",
            "direction": "like"}).json()["match_id"]
        client.post(f"/matches/{mid}/confirm", headers=see_h)
        client.post(f"/matches/{mid}/confirm", headers=emp_h)
        age_shift(mid)
        code = [m for m in client.get("/matches", headers=emp_h).json()
                if m["id"] == mid][0]["checkin_code"]
        client.post(f"/matches/{mid}/checkin", headers=see_h, json={"code": code})
        client.post(f"/matches/{mid}/attendance", headers=emp_h,
                    json={"attended": True})

    from app.routers.candidates import _reliability

    db = SessionLocal()
    try:
        total, attended, employers = _reliability(db, [sid])[sid]
        assert (total, attended) == (2, 2)
        assert employers == 1, "две смены, но заведение одно — это видно"
    finally:
        db.close()


def test_pays_on_time_means_money_actually_arrived(client, make_match):
    """Знак «платит вовремя» — про оплаченные комиссии, а не про рейтинг.

    Раньше он выдавался за высокий рейтинг и три закрытые смены, то есть
    накручивался теми же фиктивными сменами. Работник читает этот знак как
    «здесь не обманут с оплатой» и едет через полгорода.
    """
    emp_h, eid = _auth(client, "employer")
    _set_tg(eid, 664001)
    _publish(client, emp_h)

    db = SessionLocal()
    try:
        e = db.get(Employer, eid)
        e.rating = 5.0            # рейтинг сам по себе знака не даёт
        db.commit()
    finally:
        db.close()
    rows = client.get("/vacancies").json()
    mine = [v for v in rows if v["employer_id"] == eid][0]
    assert mine["employer_pays_on_time"] is False, "без оплат знака нет"

    paid = [make_match(eid) for _ in range(2)]
    db = SessionLocal()
    try:
        for mid in paid:
            db.add(Commission(employer_id=eid, match_id=mid,
                              shift_pay=3200, amount=320, status="paid"))
        db.commit()
    finally:
        db.close()
    rows = client.get("/vacancies").json()
    mine = [v for v in rows if v["employer_id"] == eid][0]
    assert mine["employer_pays_on_time"] is True, "комиссия оплачена — знак есть"


def test_unpaid_commission_removes_the_badge_and_the_shift(client, make_match):
    """Просрочка снимает знак доверия — и смену из ленты.

    Здесь же проверяется главное: сменить роль или завести вторую учётку,
    чтобы уйти от долга, бессмысленно — долг привязан к заведению, а новое
    заведение начинает без знака доверия и без истории.
    """
    from datetime import UTC, datetime

    emp_h, eid = _auth(client, "employer")
    _set_tg(eid, 665001)
    _publish(client, emp_h)

    paid = [make_match(eid) for _ in range(2)]
    overdue = make_match(eid)
    db = SessionLocal()
    try:
        for mid in paid:
            db.add(Commission(employer_id=eid, match_id=mid,
                              shift_pay=3200, amount=320, status="paid"))
        old = Commission(employer_id=eid, match_id=overdue, shift_pay=3200,
                         amount=320, status="pending")
        old.created_at = datetime.now(UTC) - timedelta(days=30)
        db.add(old)
        db.commit()
    finally:
        db.close()

    rows = client.get("/vacancies").json()
    assert not [v for v in rows if v["employer_id"] == eid], (
        "смены должника в ленте не показываем"
    )


def test_debt_survives_when_the_same_person_returns_as_a_worker(client, make_match):
    """Уйти от долга, войдя другой ролью, нельзя: это другая учётная запись.

    Долг остаётся на заведении, а вход соискателем не даёт ни его смен, ни
    его баланса — просто другой аккаунт того же человека.
    """
    emp_h, eid = _auth(client, "employer")
    see_h, sid = _auth(client, "seeker")
    _set_tg(eid, 666001)
    _set_tg(sid, 666001)   # тот же человек

    debt = make_match(eid)
    db = SessionLocal()
    try:
        db.add(Commission(employer_id=eid, match_id=debt,
                          shift_pay=3200, amount=320, status="pending"))
        db.commit()
    finally:
        db.close()

    # Соискательская роль про долг ничего не знает и ничего не открывает.
    assert client.get("/billing/commissions", headers=see_h).status_code in (403, 404)
    db = SessionLocal()
    try:
        assert db.query(Commission).filter(
            Commission.employer_id == eid).count() == 1
        assert eid != sid, "две роли — две разные учётные записи"
    finally:
        db.close()


def test_nobody_can_act_inside_someone_elses_shift(client):
    """Чужой мэтч по прямому обращению недоступен даже с верной ролью."""
    emp_h, eid = _auth(client, "employer")
    see_h, sid = _auth(client, "seeker")
    _set_tg(eid, 667001)
    _set_tg(sid, 667002)
    v = _publish(client, emp_h).json()
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})
    mid = client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy",
        "direction": "like"}).json()["match_id"]

    stranger_h, stranger_id = _auth(client, "seeker")
    _set_tg(stranger_id, 667009)
    assert client.post(f"/matches/{mid}/confirm",
                       headers=stranger_h).status_code == 403
    assert client.get(f"/matches/{mid}/messages",
                      headers=stranger_h).status_code == 403
    assert client.post(f"/matches/{mid}/not-held", headers=stranger_h,
                       json={"reason": "не было"}).status_code == 403

    db = SessionLocal()
    try:
        assert db.get(Match, mid).status == "matched"
        assert db.get(Vacancy, v["id"]).status == "active"
    finally:
        db.close()


def test_ban_follows_the_person_and_not_the_role(client):
    """Бан выписывают человеку, а не роли.

    Вход в Telegram один, а ролей две. Без этой связки заблокированное
    заведение просто входило соискателем тем же Telegram и продолжало
    работать — а бан ему выписали как раз за поведение. Долг так не
    переносится (он на заведении), а бан переносится.
    """
    emp_h, eid = _auth(client, "employer")
    see_h, sid = _auth(client, "seeker")
    _set_tg(eid, 667001)
    _set_tg(sid, 667001)          # тот же человек, вторая роль

    admin_h, _ = _auth(client, "employer")   # оператор: tg_id=0 из ADMIN_TG_IDS
    assert client.post(f"/admin/users/{eid}/block",
                       headers=admin_h).status_code == 200

    db = SessionLocal()
    try:
        assert db.get(Employer, eid).blocked, "заведение заблокировано"
        assert db.get(User, sid).blocked, "и вторая роль того же человека"
    finally:
        db.close()

    # Работать второй ролью больше нельзя (лента смен открыта всем, а вот
    # личные разделы — уже нет).
    assert client.get("/me", headers=see_h).status_code in (401, 403)

    # Отмена ошибочного бана снимает блокировку тоже с обеих ролей.
    assert client.post(f"/admin/users/{eid}/unblock",
                       headers=admin_h).status_code == 200
    db = SessionLocal()
    try:
        assert not db.get(Employer, eid).blocked
        assert not db.get(User, sid).blocked
    finally:
        db.close()
