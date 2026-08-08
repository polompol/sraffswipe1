"""«Кто откликнулся» у заведения и приглашение «позвать снова».

У работника экран «Тебя зовут» был всегда, у заведения зеркального не было:
в профиле висел счётчик откликов, а нажатие вело в общую ленту кандидатов,
где откликнувшиеся ничем не отличались от остальных.
"""
from app.db import SessionLocal
from app.models import Employer, User
from app.timeutil import local_today


def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


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


def _shift(client, emp_h, role="waiter"):
    return client.post("/vacancies", headers=emp_h, json={
        "role": role, "date": local_today(), "start_time": 600,
        "end_time": 1080, "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    }).json()


def _applicants(client, emp_h):
    r = client.get("/employer/applicants", headers=emp_h)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- кто откликнулся ----------

def test_employer_sees_who_applied(client):
    """Главный вопрос заведения: кто уже хочет ко мне."""
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
    seeker_h, sid = _auth(client, "seeker")
    client.put("/me", headers=seeker_h, json={
        "name": "Алексей", "birth_date": "1998-04-12", "roles": ["waiter"]})
    client.post("/swipes", headers=seeker_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    _detach(eid, 890001)
    _detach(sid, 890002)

    rows = _applicants(client, emp_h)
    assert len(rows) == 1
    assert rows[0]["id"] == sid
    assert rows[0]["name"] == "Алексей"
    # Видно, на какую именно смену откликнулись: смен обычно несколько.
    assert rows[0]["vacancy_id"] == v["id"]
    assert rows[0]["vacancy_role"] == "waiter"


def test_answered_applicant_leaves_the_list(client):
    """Ответили человеку — он уходит из списка ожидающих."""
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
    seeker_h, sid = _auth(client, "seeker")
    client.post("/swipes", headers=seeker_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    _detach(eid, 890010)
    _detach(sid, 890011)
    assert len(_applicants(client, emp_h)) == 1

    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})
    assert _applicants(client, emp_h) == []


def test_refused_applicant_does_not_come_back(client):
    """Отказ — тоже ответ: человек не должен всплывать в списке снова."""
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
    seeker_h, sid = _auth(client, "seeker")
    client.post("/swipes", headers=seeker_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    _detach(eid, 890020)
    _detach(sid, 890021)
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "dislike"})
    assert _applicants(client, emp_h) == []


def test_no_shifts_means_no_applicants(client):
    emp_h, eid = _auth(client, "employer")
    _detach(eid, 890030)
    assert _applicants(client, emp_h) == []


def test_applicants_are_only_for_employer(client):
    seeker_h, sid = _auth(client, "seeker")
    _detach(sid, 890040)
    assert client.get("/employer/applicants",
                      headers=seeker_h).status_code == 403


def test_applicants_hide_exact_birth_date(client):
    """В список уходит возраст числом, а не дата рождения (минимизация ПДн)."""
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
    seeker_h, sid = _auth(client, "seeker")
    client.put("/me", headers=seeker_h, json={"birth_date": "1998-04-12"})
    client.post("/swipes", headers=seeker_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    _detach(eid, 890050)
    _detach(sid, 890051)
    row = _applicants(client, emp_h)[0]
    assert "birth_date" not in row
    assert row["age"] and 18 <= row["age"] <= 100


# ---------- «позвать снова» ----------

def test_invite_needs_a_published_shift(client):
    """Приглашение без смены — обманутое ожидание: человеку некуда выйти."""
    emp_h, eid = _auth(client, "employer")
    seeker_h, sid = _auth(client, "seeker")
    _detach(eid, 890060)
    _detach(sid, 890061)
    r = client.post(f"/employer/invite/{sid}", headers=emp_h)
    assert r.status_code == 409
    assert "опубликуйте смену" in r.json()["detail"].lower()


def test_invite_tells_when_the_person_was_already_called(client):
    """Второе нажатие не шлёт сообщение — и честно об этом говорит."""
    emp_h, eid = _auth(client, "employer")
    _shift(client, emp_h)
    seeker_h, sid = _auth(client, "seeker")
    _detach(eid, 890070)
    _detach(sid, 890071)

    first = client.post(f"/employer/invite/{sid}", headers=emp_h).json()
    assert first["notified"] is True
    second = client.post(f"/employer/invite/{sid}", headers=emp_h).json()
    assert second["notified"] is False
