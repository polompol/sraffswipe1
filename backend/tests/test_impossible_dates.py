r"""Смены на несуществующую дату не должно существовать.

Регулярка ^\d{4}-\d{2}-\d{2}$ пропускала 31 ноября, 30 февраля и 13-й месяц.
Найдено сквозной пробой, а не рассуждением. Вот что получалось ДО правки со
сменой на 2026-11-31:

    ПУБЛИКАЦИЯ смены на 31 ноября: 201
      видна в ленте: True
      мэтч создан: True
      отмена заведением: 409 «Не получилось разобрать время смены…»
      «смены не было»:   409 «Не получилось разобрать время смены…»
      settle_shifts закрыл: 0
      статус смены: matched

Запись залипала навсегда: закрыть нельзя, отменить нельзя, расчёт её не видит,
место на смене занято, комиссии не будет никогда. Работник упирается в стену
из 409 и сделать ничего не может.

Отдельно стоит заметить, ПОЧЕМУ это стало тупиком только теперь. Раньше на
неразобранной дате защита молча пропускала операцию (fail-open); её починили,
и теперь она честно отказывает. Правильный отказ обнажил вход, который
пропускал заведомо невозможную дату: чинить надо на входе.
"""
from app.db import SessionLocal
from app.models import Match

BAD = ["2026-11-31", "2026-02-30", "2026-13-01", "2026-00-10", "2026-01-32"]


def _auth(client, role):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _publish(client, headers, date):
    return client.post("/vacancies", headers=headers, json={
        "role": "waiter", "date": date, "start_time": 600, "end_time": 1080,
        "rate": 400, "rate_type": "perHour", "lat": 55.75, "lng": 37.61,
        "address": "Никольская, 10", "city": "Москва",
    })


def test_shift_on_a_day_that_does_not_exist_is_refused(client):
    """Каждая невозможная дата отвергается на входе, а не залипает в базе."""
    emp, _ = _auth(client, "employer")
    for date in BAD:
        r = _publish(client, emp, date)
        assert r.status_code == 422, (
            f"дата {date} принята: {r.status_code} {r.text[:200]}"
        )


def test_a_real_date_still_publishes(client):
    """Обратная половина: настоящая дата по-прежнему проходит.

    Без неё проверка выше доказывала бы лишь то, что публикация сломана.
    """
    emp, _ = _auth(client, "employer")
    r = _publish(client, emp, "2030-02-28")
    assert r.status_code in (200, 201), r.text
    assert r.json()["date"] == "2030-02-28"


def test_reschedule_cannot_move_a_shift_into_a_nonexistent_day(client):
    """Перенос — вторая дверь к той же беде, и она тоже закрыта."""
    emp, _ = _auth(client, "employer")
    v = _publish(client, emp, "2030-03-10").json()
    see, sid = _auth(client, "seeker")
    client.post("/swipes", headers=see, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    mid = client.post("/swipes", headers=emp, json={
        "target_id": sid, "target_type": "user", "direction": "like",
        "vacancy_id": v["id"]}).json()["match_id"]

    r = client.post(f"/matches/{mid}/reschedule", headers=emp, json={
        "date": "2030-02-31", "start_time": 600, "end_time": 1080})
    assert r.status_code == 422, f"перенос на 31 февраля принят: {r.text[:200]}"

    db = SessionLocal()
    try:
        assert db.get(Match, mid).reschedule_date == "", (
            "предложение переноса не должно было сохраниться"
        )
    finally:
        db.close()


def test_birth_date_was_already_protected(client):
    """Дата рождения — тот же класс входа, но чинить там было нечего.

    Сначала я и её перевёл на проверенный тип. Мутация показала, что тест на
    неё проходит и БЕЗ моей правки, — то есть проверял он не её. Разбор
    объяснил почему: update_me зовёт _age_from_iso, а тот разбирает дату через
    date.fromisoformat, который «1998-02-30» отвергает сам. Возрастной ценз
    18+ закрыл этот вход раньше и лучше.

    Правку я откатил: менять работающий код без доказанной нужды нельзя.
    Проверка осталась — она закрепляет уже существующую защиту, и названа так,
    чтобы никто не решил, будто её обеспечивает IsoDate.
    """
    see, _ = _auth(client, "seeker")
    bad = client.put("/me", headers=see, json={"birth_date": "1998-02-30"})
    assert bad.status_code == 422, bad.text
    assert "дата рождения" in bad.json()["detail"].lower()
    ok = client.put("/me", headers=see, json={"birth_date": "1998-02-28"})
    assert ok.status_code == 200, ok.text
