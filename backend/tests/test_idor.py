"""Доступ по чужому идентификатору — сплошной обход всех ручек.

Идентификаторы в StaffSwipe — обычные строки в адресе запроса. Подставить
чужой может кто угодно: они видны в переписке, в ссылках, в логах браузера.
Единственное, что стоит между чужой сменой и посторонним, — проверка «а ты
вообще участник?» в каждой ручке по отдельности. Забыть её в одной из
двадцати легко, и заметить это по экрану нельзя: чтобы увидеть дыру, надо
специально подставить чужой id.

Поэтому здесь не выборочные примеры, а СПИСОК. Появится новая ручка с
идентификатором — добавляется строка, и посторонний по ней проверяется сразу.

Что считается правильным ответом: 403 (не твоё), 404 (не показываем даже
существование) или 401 (без токена). Всё остальное — дыра.
"""
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models import Employer, User

OK_DENIED = (401, 403, 404)


def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"], \
        r["access_token"]


def _detach(owner_id, tg_id):
    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        o.tg_id = tg_id
        if (o.phone or "").startswith("tg:"):
            o.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _scene(client):
    """Смена, мэтч и трое посторонних: чужой работник, чужое заведение, никто."""
    emp_h, eid, _ = _auth(client, "employer")
    day = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    vac = client.post("/vacancies", headers=emp_h, json={
        "role": "barista", "date": day, "start_time": 600, "end_time": 1080,
        "rate": 400, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61,
    }).json()
    _detach(eid, 940001)

    see_h, sid, _ = _auth(client, "seeker")
    _detach(sid, 940002)
    client.post("/swipes", headers=see_h, json={
        "target_id": vac["id"], "target_type": "vacancy", "direction": "like"})
    mid = client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like",
        "vacancy_id": vac["id"]}).json()["match_id"]

    other_see_h, other_sid, other_token = _auth(client, "seeker")
    _detach(other_sid, 940003)
    other_emp_h, other_eid, _ = _auth(client, "employer")
    _detach(other_eid, 940004)

    return {
        "vac": vac, "mid": mid, "emp_h": emp_h, "eid": eid,
        "see_h": see_h, "sid": sid,
        "strangers": {
            "чужой работник": other_see_h,
            "чужое заведение": other_emp_h,
        },
        "stranger_token": other_token,
    }


def test_a_stranger_cannot_touch_someone_elses_shift(client):
    """Все действия внутри чужого мэтча — закрыты, каждое проверено отдельно."""
    s = _scene(client)
    mid = s["mid"]
    calls = [
        ("get", f"/matches/{mid}/messages", None),
        ("post", f"/matches/{mid}/messages", {"text": "привет"}),
        ("post", f"/matches/{mid}/confirm", None),
        ("post", f"/matches/{mid}/cancel", {"reason": "не хочу"}),
        ("post", f"/matches/{mid}/not-held", {"reason": "не было"}),
        ("post", f"/matches/{mid}/attendance", {"attended": True}),
        ("post", f"/matches/{mid}/checkin", {"code": "123456"}),
        ("post", f"/matches/{mid}/dispute", {"note": "проблема"}),
        ("post", f"/matches/{mid}/hours", {"minutes": 60}),
        ("post", f"/matches/{mid}/reschedule",
         {"date": "2030-01-01", "start_time": 600, "end_time": 1080}),
        ("post", f"/matches/{mid}/reschedule/accept", None),
        ("post", f"/matches/{mid}/reschedule/decline", None),
        ("post", f"/matches/{mid}/review", {"stars": 5, "text": ""}),
        ("post", f"/matches/{mid}/resolve", {"outcome": "completed"}),
    ]
    for who, headers in s["strangers"].items():
        for method, url, body in calls:
            r = getattr(client, method)(
                url, headers=headers, **({"json": body} if body else {}))
            assert r.status_code in OK_DENIED, (
                f"{who} смог(ла) {method.upper()} {url} → {r.status_code}"
            )


def test_a_stranger_cannot_touch_someone_elses_shift_listing(client):
    """Чужую смену нельзя ни исправить, ни снять, ни разослать по ней «срочно»."""
    s = _scene(client)
    vid = s["vac"]["id"]
    day = (datetime.now(UTC) + timedelta(days=3)).date().isoformat()
    edit = {
        "role": "cook", "date": day, "start_time": 600, "end_time": 1080,
        "rate": 1000, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61,
    }
    for who, headers in s["strangers"].items():
        assert client.put(f"/vacancies/{vid}", headers=headers,
                          json=edit).status_code in OK_DENIED, who
        assert client.delete(f"/vacancies/{vid}",
                             headers=headers).status_code in OK_DENIED, who
        assert client.post(f"/vacancies/{vid}/urgent",
                           headers=headers).status_code in OK_DENIED, who

    # Смена осталась прежней: ни ставки, ни должности никто не поменял.
    mine = client.get("/vacancies?mine=1", headers=s["emp_h"]).json()
    same = next(v for v in mine if v["id"] == vid)
    assert same["rate"] == 400 and same["role"] == "barista"
    assert same["status"] == "active"


def test_admin_handles_are_closed_for_ordinary_accounts(client):
    """Ручки оператора — деньги, блокировки, стирание — обычному нельзя.

    Каждая из них меняет чужие данные или чужой баланс, поэтому проверяются
    все, а не одна для примера.
    """
    s = _scene(client)
    eid, sid = s["eid"], s["sid"]
    calls = [
        ("get", "/admin/overview", None),
        ("get", "/admin/revenue", None),
        ("get", "/admin/users", None),
        ("get", "/admin/commissions", None),
        ("get", "/admin/purchases", None),
        ("get", "/admin/blocked", None),
        ("get", "/admin/reports", None),
        ("post", f"/admin/wallet/{eid}/credit", {"amount_rub": 100000}),
        ("post", f"/admin/wallet/{eid}/refund", {"amount_rub": 100}),
        ("post", f"/admin/users/{sid}/block", {"reason": "просто так"}),
        ("post", f"/admin/users/{sid}/unblock", None),
        ("post", f"/admin/vacancies/{s['vac']['id']}/block", {"reason": "x"}),
        ("post", f"/admin/employers/{eid}/verify", None),
        ("post", f"/admin/users/{sid}/logout-all", None),
        ("post", f"/admin/users/{sid}/erase", None),
        ("post", f"/admin/commissions/{eid}/settle", None),
        ("post", f"/admin/commissions/{eid}/write-off", {"reason": "x"}),
        ("post", "/admin/shifts/auto-close", None),
        ("post", "/admin/relink", {"old_tg_id": 1, "new_tg_id": 2}),
        ("post", "/admin/payments/reconcile", None),
    ]
    for who, headers in {**s["strangers"], "участник смены": s["see_h"],
                         "само заведение": s["emp_h"]}.items():
        for method, url, body in calls:
            r = getattr(client, method)(
                url, headers=headers, **({"json": body} if body else {}))
            assert r.status_code in OK_DENIED, (
                f"{who} смог(ла) {method.upper()} {url} → {r.status_code}"
            )

    # И самое главное: баланс заведения не изменился ни на рубль.
    assert client.get("/billing/commission",
                      headers=s["emp_h"]).json()["balanceRub"] == 0


def test_documents_are_not_handed_out_by_a_stranger_token(client):
    """Акт и счёт открываются по токену в адресе — значит чужой не подходит."""
    s = _scene(client)
    stranger = s["stranger_token"]
    for url in ("/billing/act.pdf", "/billing/invoice.pdf"):
        # Токен работника вместо токена заведения.
        assert client.get(f"{url}?token={stranger}").status_code in OK_DENIED
        # Без токена — тоже нет.
        assert client.get(url).status_code in OK_DENIED
        # Выдуманный токен.
        assert client.get(f"{url}?token=nonsense").status_code in OK_DENIED


def test_nothing_answers_without_a_token_at_all(client):
    """Без токена личные ручки не отвечают ничем, кроме отказа."""
    s = _scene(client)
    urls = [
        "/me", "/matches", f"/matches/{s['mid']}/messages",
        "/candidates", "/employer/applicants",
        "/billing/commission", "/favorites", "/admin/overview",
    ]
    for url in urls:
        r = client.get(url)
        assert r.status_code in OK_DENIED, f"{url} ответил {r.status_code}"

    # Лента смен открыта нарочно — её листают до входа. Но «мои смены» без
    # входа обязаны быть ПУСТЫМИ: иначе это была бы выдача чужих смен всем.
    r = client.get("/vacancies?mine=1")
    assert r.status_code in OK_DENIED or r.json() == [], (
        "«мои смены» без токена не должны ничего показывать"
    )
