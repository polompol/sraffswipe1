"""Удаление персональных данных по заявлению (152-ФЗ).

Политика обещает удалить данные по обращению — до этого в коде такой
операции не было вовсе, инструкция предлагала оператору выполнить
`DELETE FROM users` на боевой базе руками.
"""
from datetime import date, timedelta

from app.timeutil import local_today


def _d(days: int) -> str:
    """Дата смены относительно «сегодня» — по местному времени, как её
    видит человек: у сервера в UTC с 21:00 уже другая дата."""
    return (date.fromisoformat(local_today()) + timedelta(days=days)).isoformat()


def _auth(client, role):
    t = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()["access_token"]
    return {"Authorization": f"Bearer {t}"}


def _admin(client):
    # В тестах insecure-логин даёт tg_id=0, а ADMIN_TG_IDS="0".
    return _auth(client, "seeker")


def _set_tg_id(owner_id: str, tg_id: int | None) -> None:
    """Развести tg_id участников.

    В тестах insecure-логин выдаёт всем tg_id=0, а ADMIN_TG_IDS="0" — то есть
    администратором оказывается каждый. В бою так не бывает, поэтому для
    проверок прав явно проставляем разные id.
    """
    from app.db import SessionLocal
    from app.models import Employer, User

    db = SessionLocal()
    try:
        target = db.get(User, owner_id) or db.get(Employer, owner_id)
        target.tg_id = tg_id
        # Телефон-заглушка идёт в паре с tg_id, иначе следующий вход по
        # tg_id=0 упрётся в UNIQUE на телефоне tg:0.
        if (target.phone or "").startswith("tg:"):
            target.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _pair_with_history(client):
    """Заведение и соискатель, между которыми есть смена, чат и отзыв."""
    emp = _auth(client, "employer")
    v = client.post("/vacancies", headers=emp, json={
        "role": "barista", "date": _d(1), "start_time": 600, "end_time": 1080,
        "rate": 350, "rate_type": "perHour", "lat": 55.75, "lng": 37.61,
        "address": "Тверская, 1",
    }).json()
    seeker = _auth(client, "seeker")
    r = client.put("/me", headers=seeker, json={
        "name": "Анна Петрова", "birth_date": "1998-09-03", "city": "Москва",
        "about": "Три года в кофейне", "inn": "770123456789",
    })
    assert r.status_code == 200, r.text
    client.post("/swipes", headers=seeker, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    me = client.get("/me", headers=seeker).json()
    sw = client.post("/swipes", headers=emp, json={
        "target_id": me["id"], "target_type": "user", "direction": "like"}).json()
    mid = sw["match_id"]
    client.post(f"/matches/{mid}/messages", headers=seeker,
                json={"text": "Буду в 10, мой телефон +7 900 111-22-33"})
    # Соискатель — обычный человек, а не оператор (см. _set_tg_id).
    _set_tg_id(me["id"], 555001)
    return emp, seeker, me["id"], v["id"], mid


def test_erase_wipes_profile_but_keeps_shift_history(client):
    """Из профиля исчезает всё личное, а смена и её история остаются:
    на них ссылается начисленная комиссия и разбор споров."""
    emp, seeker, uid, vid, mid = _pair_with_history(client)
    ah = _admin(client)

    r = client.post(f"/admin/users/{uid}/erase", headers=ah)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True and body["kind"] == "user"

    from app.db import SessionLocal
    from app.models import Match, Message, User

    db = SessionLocal()
    try:
        u = db.get(User, uid)
        assert u is not None                      # строка на месте — на неё ссылаются
        assert u.name == "Профиль удалён"
        assert u.birth_date == "" and u.city == "" and u.about == ""
        assert u.inn is None
        assert u.tg_id is None                    # войти в аккаунт больше нельзя
        assert not u.phone.startswith("tg:")
        assert u.blocked is True

        assert db.get(Match, mid) is not None     # смена сохранилась
        texts = [m.text for m in db.query(Message).filter(
            Message.match_id == mid, Message.is_system.is_(False))]
        # Телефон из переписки не должен пережить удаление.
        assert not any("900 111-22-33" in t for t in texts)
    finally:
        db.close()


def test_erased_person_disappears_from_feed(client):
    """Стёртый профиль не показывается заведениям."""
    emp, seeker, uid, vid, mid = _pair_with_history(client)
    ah = _admin(client)
    client.post(f"/admin/users/{uid}/erase", headers=ah)

    feed = client.get("/candidates", headers=emp).json()
    assert uid not in {c["id"] for c in feed}


def test_erase_employer_removes_shifts_from_feed(client):
    """Смены удалённого заведения уходят из ленты: откликаться некому."""
    emp = _auth(client, "employer")
    v = client.post("/vacancies", headers=emp, json={
        "role": "cook", "date": _d(2), "start_time": 600, "end_time": 1080,
        "rate": 400, "rate_type": "perHour", "lat": 55.75, "lng": 37.61,
        "address": "Арбат, 5",
    }).json()
    eid = client.get("/me", headers=emp).json()["id"]
    _set_tg_id(eid, 555002)
    assert v["id"] in {x["id"] for x in client.get("/vacancies").json()}

    ah = _admin(client)
    r = client.post(f"/admin/users/{eid}/erase", headers=ah)
    assert r.status_code == 200 and r.json()["kind"] == "employer"
    assert v["id"] not in {x["id"] for x in client.get("/vacancies").json()}


def test_erase_is_idempotent(client):
    """Оператор нажал дважды — ничего не сломалось."""
    emp, seeker, uid, vid, mid = _pair_with_history(client)
    ah = _admin(client)
    assert client.post(f"/admin/users/{uid}/erase", headers=ah).status_code == 200
    assert client.post(f"/admin/users/{uid}/erase", headers=ah).status_code == 200


def test_erase_requires_admin(client):
    """Обычный пользователь не может стереть чужой аккаунт."""
    emp, seeker, uid, vid, mid = _pair_with_history(client)
    eid = client.get("/me", headers=emp).json()["id"]
    _set_tg_id(eid, 555003)          # заведение — не оператор
    r = client.post(f"/admin/users/{uid}/erase", headers=emp)
    assert r.status_code == 403


def test_cannot_erase_admin_account(client):
    """Стереть аккаунт оператора нельзя: доступ к админке идёт по tg_id,
    и мы бы его как раз сняли — остались бы без админки навсегда."""
    ah = _admin(client)
    admin_id = client.get("/me", headers=ah).json()["id"]
    r = client.post(f"/admin/users/{admin_id}/erase", headers=ah)
    assert r.status_code == 400
    assert "администратора" in r.json()["detail"]


def test_erase_unknown_account_is_404(client):
    ah = _admin(client)
    assert client.post("/admin/users/нет-такого/erase",
                       headers=ah).status_code == 404


def test_erased_account_frees_telegram_for_a_fresh_start(client):
    """Человек передумал и зашёл заново — он должен получить чистый профиль,
    а не воскресить стёртый (tg_id со старой строки снят)."""
    emp, seeker, uid, vid, mid = _pair_with_history(client)
    ah = _admin(client)
    client.post(f"/admin/users/{uid}/erase", headers=ah)

    again = _auth(client, "seeker")
    me = client.get("/me", headers=again).json()
    assert me["id"] != uid
    assert me["name"] != "Профиль удалён"
