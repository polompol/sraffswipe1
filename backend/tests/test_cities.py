"""Другие города: время смены и «кто кого видит».

Пока город один, всё это незаметно. Стоит появиться второму — и ломается
молча, без ошибок в логах, поэтому проверяем явно.

Две разные беды:
1. ВРЕМЯ. Смена «10:00–18:00» во Владивостоке заканчивается на семь часов
   раньше, чем думает московский сервер. От этого едет всё: когда смена
   закрывается, когда начисляется комиссия, можно ли ещё отменить, можно ли
   опубликовать смену «на сегодня».
2. КТО КОГО ВИДИТ. Город был свободным текстом: «Санкт-Петербург», «СПб» и
   «Питер» — три разных города, и люди из одного города друг друга не
   находили. А лента кандидатов не фильтровалась по городу вовсе: кафе в
   Казани листало москвичей.
"""
from datetime import UTC, datetime, timedelta

from app.cities import CITIES, city_tz, normalize, same_city
from app.db import SessionLocal
from app.models import Employer, User
from app.timeutil import local_today, shift_end_utc, shift_start_utc

# ---------- справочник ----------

def test_every_city_has_a_real_timezone():
    """Пояс каждого города должен существовать в базе часовых поясов.

    Опечатка в названии пояса не видна никак: код молча берёт запасной
    вариант, и смены в этом городе считаются по Москве.
    """
    from zoneinfo import ZoneInfo

    for name, tz in CITIES:
        assert ZoneInfo(tz), f"{name}: неизвестный пояс {tz}"
    assert len({n for n, _ in CITIES}) == len(CITIES), "город не должен дублироваться"


def test_the_same_city_written_differently_is_one_city():
    """«Питер», «СПб» и «санкт-петербург» — один город, а не три."""
    for written in ("Санкт-Петербург", "СПб", "спб", "Питер", "санкт петербург"):
        assert normalize(written) == "Санкт-Петербург", written
    assert same_city("Питер", "Санкт-Петербург")
    assert same_city("ростов на дону", "Ростов-на-Дону")
    assert not same_city("Москва", "Казань")


def test_an_unknown_town_is_not_forbidden():
    """Маленький город работает как есть — просто по поясу по умолчанию."""
    assert normalize("Урюпинск") == "Урюпинск"
    assert city_tz("Урюпинск") == ""


# ---------- время ----------

def test_shift_ends_by_its_own_city_clock():
    """Одна и та же смена в разных городах кончается в разное время.

    Это главная проверка всей многогородности: от конца смены считаются и
    закрытие, и комиссия, и «уже поздно отменять».
    """
    msk = shift_end_utc("2026-08-20", 600, 1080, "Москва")
    vlv = shift_end_utc("2026-08-20", 600, 1080, "Владивосток")
    assert (msk - vlv) == timedelta(hours=7), "Владивосток на 7 часов впереди Москвы"

    ekb = shift_end_utc("2026-08-20", 600, 1080, "Екатеринбург")
    assert (msk - ekb) == timedelta(hours=2)

    kgd = shift_end_utc("2026-08-20", 600, 1080, "Калининград")
    assert (kgd - msk) == timedelta(hours=1), "Калининград на час позади Москвы"


def test_night_shift_still_crosses_midnight_in_any_city():
    """Ночная смена 20:00→04:00 кончается наутро — и в Москве, и во Владивостоке."""
    for city in ("Москва", "Владивосток", "Калининград"):
        start = shift_start_utc("2026-08-20", 1200, city)
        end = shift_end_utc("2026-08-20", 1200, 240, city)
        assert end - start == timedelta(hours=8), city


def test_unknown_city_falls_back_instead_of_breaking():
    """Незнакомый город считается по поясу по умолчанию, а не ломает расчёт."""
    assert shift_end_utc("2026-08-20", 600, 1080, "Урюпинск") == shift_end_utc(
        "2026-08-20", 600, 1080, ""
    )


def test_today_differs_across_the_country():
    """«Сегодня» в Москве и во Владивостоке — не всегда один день."""
    today_msk = local_today("Москва")
    today_vlv = local_today("Владивосток")
    assert today_vlv >= today_msk, "восточный город не может отставать"


# ---------- кто кого видит ----------

def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _set_city(owner_id: str, city: str, tg_id: int) -> None:
    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        o.city = city
        o.tg_id = tg_id
        o.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def test_venue_sees_candidates_of_its_own_city_only(client):
    """Кафе в Казани не должно листать москвичей.

    Фильтра по городу в ленте кандидатов не было вообще. С одним городом это
    незаметно, со вторым главный экран заведения перестаёт работать.
    """
    kazan_h, kazan_id = _auth(client, "seeker")
    client.put("/me", headers=kazan_h, json={"name": "Ильдар", "city": "Казань"})
    _set_city(kazan_id, "Казань", 940001)

    msk_h, msk_id = _auth(client, "seeker")
    client.put("/me", headers=msk_h, json={"name": "Пётр", "city": "Москва"})
    _set_city(msk_id, "Москва", 940002)

    emp_h, emp_id = _auth(client, "employer")
    _set_city(emp_id, "Казань", 940003)

    rows = client.get("/candidates", headers=emp_h).json()
    ids = {r["id"] for r in rows}
    assert kazan_id in ids, "своего горожанина заведение обязано видеть"
    assert msk_id not in ids, "чужой город в ленте не нужен"

    # Явный выбор города перекрывает город заведения.
    rows = client.get("/candidates?city=Москва", headers=emp_h).json()
    assert msk_id in {r["id"] for r in rows}


def test_a_city_written_differently_still_matches(client):
    """Человек написал «Питер», заведение выбрало «Санкт-Петербург» — увидятся."""
    see_h, see_id = _auth(client, "seeker")
    client.put("/me", headers=see_h, json={"name": "Аня", "city": "Питер"})
    _set_city(see_id, normalize("Питер"), 940010)

    emp_h, emp_id = _auth(client, "employer")
    _set_city(emp_id, "Санкт-Петербург", 940011)

    ids = {r["id"] for r in client.get("/candidates", headers=emp_h).json()}
    assert see_id in ids


def test_profile_city_is_normalized_on_save(client):
    """Город из анкеты сохраняется каноническим написанием."""
    see_h, see_id = _auth(client, "seeker")
    r = client.put("/me", headers=see_h, json={"name": "Аня", "city": "спб"})
    assert r.status_code == 200
    db = SessionLocal()
    try:
        assert db.get(User, see_id).city == "Санкт-Петербург"
    finally:
        db.close()


def test_vacancy_city_is_normalized_on_publish(client):
    """И город смены тоже — иначе она не попадёт в ленту своего города."""
    emp_h, emp_id = _auth(client, "employer")
    _set_city(emp_id, "Санкт-Петербург", 940020)
    tomorrow = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    v = client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": tomorrow, "start_time": 600, "end_time": 1080,
        "rate": 400, "rate_type": "perHour", "city": "питер",
        "lat": 59.93, "lng": 30.33, "address": "Невский, 1",
    }).json()
    assert v["city"] == "Санкт-Петербург"


def test_the_city_list_is_served_to_the_app(client):
    """Список городов приложение берёт с сервера, а не держит свою копию.

    Две копии неизбежно разъезжаются, а разъехавшийся город — это снова
    пустая лента, которую невозможно объяснить.
    """
    rows = client.get("/cities").json()
    assert len(rows) >= 20
    names = {r["name"] for r in rows}
    assert {"Москва", "Санкт-Петербург", "Владивосток"} <= names
    by_name = {r["name"]: r["tz"] for r in rows}
    assert by_name["Владивосток"] == "Asia/Vladivostok"
