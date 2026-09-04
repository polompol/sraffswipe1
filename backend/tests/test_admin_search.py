"""Поиск в админке: находит всех и ничего не пишет в базу.

Поиск был устроен так: взять 300 последних людей и 300 последних заведений и
отсеять лишнее уже в Python. Две беды сразу.

1. Старый аккаунт не находился ВООБЩЕ — а поддержка ищет как раз старые:
   «человек зарегистрировался весной, потерял доступ».
2. На каждую из шестисот строк создавалась и сохранялась запись кошелька.
   Обычный поиск делал шестьсот записей в базу — при том, что это чтение.
"""
from app.db import SessionLocal
from app.models import Entitlement, User


def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _admin(client):
    # tg_id=0 в тестах — админ (см. conftest: ADMIN_TG_IDS=0).
    h, _ = _auth(client, "seeker")
    return h


def _bulk_users(count: int, name: str = "Массовка") -> None:
    db = SessionLocal()
    try:
        for i in range(count):
            db.add(User(name=f"{name} {i}", phone=f"tg:{500000 + i}",
                        tg_id=500000 + i))
        db.commit()
    finally:
        db.close()


def test_an_old_account_is_still_found(client):
    """Человек, зарегистрировавшийся раньше трёхсот последних, обязан находиться."""
    ah = _admin(client)
    db = SessionLocal()
    try:
        db.add(User(name="Пелагея Старожилова", phone="tg:400001", tg_id=400001))
        db.commit()
    finally:
        db.close()
    _bulk_users(400)  # 400 более свежих регистраций «поверх»

    rows = client.get("/admin/users", headers=ah,
                      params={"q": "Старожилова"}).json()
    assert [r["name"] for r in rows] == ["Пелагея Старожилова"]


def test_search_ignores_letter_case(client):
    """«иван» должен находить «Иван» — и в тестах, и в проде одинаково."""
    ah = _admin(client)
    db = SessionLocal()
    try:
        db.add(User(name="Иван Петров", phone="tg:400002", tg_id=400002))
        db.commit()
    finally:
        db.close()
    rows = client.get("/admin/users", headers=ah, params={"q": "иван"}).json()
    assert "Иван Петров" in {r["name"] for r in rows}


def test_search_does_not_write_to_the_database(client):
    """Чтение остаётся чтением: кошельки при поиске не создаются."""
    ah = _admin(client)
    _bulk_users(50)
    db = SessionLocal()
    try:
        before = db.query(Entitlement).count()
    finally:
        db.close()

    client.get("/admin/users", headers=ah, params={"q": "Массовка"})

    db = SessionLocal()
    try:
        assert db.query(Entitlement).count() == before
    finally:
        db.close()


def test_percent_sign_does_not_match_everyone(client):
    """Служебный символ поиска — обычный символ, а не «показать всех»."""
    ah = _admin(client)
    _bulk_users(5)
    rows = client.get("/admin/users", headers=ah, params={"q": "%"}).json()
    assert rows == []


def test_the_answer_is_capped(client):
    """Ответ ограничен по размеру — иначе поиск выгружает всю базу."""
    ah = _admin(client)
    _bulk_users(120)
    rows = client.get("/admin/users", headers=ah, params={"q": "Массовка"}).json()
    assert len(rows) <= 30
