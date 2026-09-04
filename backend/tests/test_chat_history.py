"""Переписка отдаётся порциями, а не вся сразу.

Раньше на каждое открытие чата (и на каждое переподключение после метро или
лифта) сервер отдавал ВСЮ переписку по смене. У заведения, которое работает с
одними и теми же людьми, это растёт месяцами: лишние мегабайты по мобильному
интернету и пауза перед тем, как чат вообще появится на экране.
"""
from app.db import SessionLocal
from app.models import Message


def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _matched(client):
    from datetime import UTC, datetime, timedelta

    emp_h, _ = _auth(client, "employer")
    day = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    v = client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": day, "start_time": 600, "end_time": 1080,
        "rate": 400, "rate_type": "perHour", "lat": 55.75, "lng": 37.61,
    }).json()
    seeker_h, sid = _auth(client, "seeker")
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})
    sw = client.post("/swipes", headers=seeker_h, json={
        "target_id": v["id"], "target_type": "vacancy",
        "direction": "like"}).json()
    return emp_h, seeker_h, sw["match_id"]


def _fill(match_id: str, count: int) -> None:
    """Быстро набить историю прямо в базе — через API это 250 запросов."""
    db = SessionLocal()
    try:
        for i in range(count):
            db.add(Message(match_id=match_id, sender_id="system",
                           text=f"сообщение {i}", is_system=True))
        db.commit()
    finally:
        db.close()


def test_only_the_last_hundred_come_back(client):
    emp_h, _, mid = _matched(client)
    _fill(mid, 250)

    rows = client.get(f"/matches/{mid}/messages", headers=emp_h).json()
    assert len(rows) == 100, "порция — сто сообщений"
    # Самые свежие, и по возрастанию времени: снизу — последнее.
    assert rows[-1]["text"] == "сообщение 249"


def test_older_messages_load_by_the_button(client):
    """«Показать более ранние» отдаёт следующую порцию — без пропусков и дублей."""
    emp_h, _, mid = _matched(client)
    _fill(mid, 250)

    first = client.get(f"/matches/{mid}/messages", headers=emp_h).json()
    older = client.get(
        f"/matches/{mid}/messages", headers=emp_h,
        params={"before": first[0]["id"]},
    ).json()
    assert len(older) == 100
    ids = {m["id"] for m in first} & {m["id"] for m in older}
    assert not ids, "порции не должны пересекаться"
    # Стык без дырки: последнее из старой порции идёт прямо перед первым новым.
    assert older[-1]["text"] == "сообщение 149"
    assert first[0]["text"] == "сообщение 150"


def test_the_beginning_of_the_chat_ends_the_list(client):
    emp_h, _, mid = _matched(client)
    _fill(mid, 20)

    rows = client.get(f"/matches/{mid}/messages", headers=emp_h).json()
    older = client.get(
        f"/matches/{mid}/messages", headers=emp_h,
        params={"before": rows[0]["id"]},
    ).json()
    assert older == [], "раньше первого сообщения ничего нет"


def test_a_stranger_still_gets_nothing(client):
    """Порции не должны стать лазейкой в чужой чат."""
    from app.models import User

    _, _, mid = _matched(client)
    # Разводим участника и постороннего по разным Telegram-аккаунтам: в тестах
    # вход без init_data выдаёт одного и того же человека, пока tg_id совпадает.
    db = SessionLocal()
    try:
        for u in db.query(User).all():
            u.tg_id = 970000 + int(u.tg_id or 0)
            u.phone = f"tg:{u.tg_id}"
        db.commit()
    finally:
        db.close()

    other_h, _ = _auth(client, "seeker")
    r = client.get(f"/matches/{mid}/messages", headers=other_h)
    assert r.status_code == 403


def test_a_huge_limit_is_capped(client):
    """«Отдай миллион» не должно превращаться в выгрузку всей переписки."""
    emp_h, _, mid = _matched(client)
    _fill(mid, 250)
    rows = client.get(f"/matches/{mid}/messages", headers=emp_h,
                      params={"limit": 100000}).json()
    assert len(rows) == 200
