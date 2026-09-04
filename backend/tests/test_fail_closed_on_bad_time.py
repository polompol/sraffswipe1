"""Не смогли посчитать время смены — значит НЕЛЬЗЯ.

Каждая денежная защита в matches.py стоит на одном вопросе: смена уже
началась? уже закончилась? Ответ даёт разбор даты и минут вакансии. Разбор
может не удаться, и раньше на этот случай везде стояло
`except (ValueError, TypeError): pass`.

Выглядело безобидно: HTTPException такой except не ловит (она не ValueError),
значит отказы работают. Но глоталось САМО ВЫЧИСЛЕНИЕ, а вместе с ним молча
исчезала вся защита ниже. Одной вакансии с неразобранной датой хватало, чтобы
разом открыть:

  • «смены не было» — до того, как смена прошла;
  • «уточнить часы» — заранее, срезав объявленные часы вдвое, то есть выдав
    себе скидку 50% на комиссию;
  • перенос уже начавшейся смены — отработанное уезжает в будущее и уходит
    из-под расчёта;
  • отмену начавшейся смены — та самая универсальная кнопка «не платить».

Тесты ниже требуют ОТКАЗА на каждом из этих путей. Отказ здесь безопаснее
разрешения: он бьёт по действию, которое всё равно нельзя посчитать честно, и
ведёт человека к оператору. Разрешение бьёт по чужим деньгам.
"""
from app.db import SessionLocal
from app.models import Match, Vacancy
from app.shift_rules import shift_is_over
from app.timeutil import local_today


def _auth(client, role):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _future_match(client):
    """Договорённость о смене, которая ещё НЕ начиналась."""
    emp_h, _ = _auth(client, "employer")
    v = client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": local_today(), "start_time": 600,
        "end_time": 1080, "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    }).json()
    seeker_h, sid = _auth(client, "seeker")
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})
    mid = client.post("/swipes", headers=seeker_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like",
    }).json()["match_id"]
    return emp_h, seeker_h, mid


def _confirm(client, emp_h, seeker_h, mid):
    """Обе стороны подтвердили выход. Часть проверок доступна только отсюда:
    статус смены сверяется РАНЬШЕ времени, и без подтверждения тест упёрся бы
    в «смена не в статусе подтверждённой», ничего не проверив по существу."""
    client.post(f"/matches/{mid}/confirm", headers=seeker_h)
    client.post(f"/matches/{mid}/confirm", headers=emp_h)


def _unreadable_time(match_id: str) -> None:
    """Сделать время смены неразбираемым — так же, как это выглядело бы в бою.

    Не выдумка ради теста: пустая дата и отсутствующие минуты — обычная форма
    порчи данных (недокачанная миграция, ручная правка в базе, импорт извне).
    Важно не то, откуда она возьмётся, а что защита обязана вести себя
    предсказуемо, когда возьмётся.
    """
    db = SessionLocal()
    try:
        m = db.get(Match, match_id)
        v = db.get(Vacancy, m.vacancy_id)
        v.date = "не дата"
        db.commit()
    finally:
        db.close()


def test_venue_cannot_say_the_shift_never_happened(client):
    """«Смены не было» — только после смены. Иначе это отказ платить заранее."""
    emp_h, _, mid = _future_match(client)
    _unreadable_time(mid)
    r = client.post(f"/matches/{mid}/not-held", headers=emp_h, json={"reason": ""})
    assert r.status_code == 409, r.text
    assert "оператору" in r.json()["detail"]


def test_hours_cannot_be_cut_before_the_shift(client):
    """Скидка 50% на комиссию: срезать объявленные часы вдвое ДО смены."""
    emp_h, seeker_h, mid = _future_match(client)
    _confirm(client, emp_h, seeker_h, mid)
    _unreadable_time(mid)
    # 480 объявленных минут → 240: ровно вдвое, то есть в пределах допуска
    # «не больше чем вдвое». Отказать должно НЕ из-за величины, а из-за того,
    # что мы не знаем, прошла ли смена.
    r = client.post(f"/matches/{mid}/hours", headers=emp_h, json={"minutes": 240})
    assert r.status_code == 409, r.text
    assert "оператору" in r.json()["detail"]


def test_started_shift_cannot_be_pushed_into_the_future(client):
    """Перенос уводит отработанную смену из-под расчёта — навсегда."""
    emp_h, _, mid = _future_match(client)
    _unreadable_time(mid)
    r = client.post(f"/matches/{mid}/reschedule", headers=emp_h, json={
        "date": "2030-01-01", "start_time": 600, "end_time": 1080,
    })
    assert r.status_code == 409, r.text
    assert "оператору" in r.json()["detail"]


def test_worker_cannot_accept_a_reschedule_we_cannot_time(client):
    """Согласие работника — вторая половина того же обхода, и она была открыта."""
    emp_h, seeker_h, mid = _future_match(client)
    ok = client.post(f"/matches/{mid}/reschedule", headers=emp_h, json={
        "date": "2030-01-01", "start_time": 600, "end_time": 1080,
    })
    assert ok.status_code == 200, ok.text
    _unreadable_time(mid)
    r = client.post(f"/matches/{mid}/reschedule/accept", headers=seeker_h)
    assert r.status_code == 409, r.text
    assert "оператору" in r.json()["detail"]


def test_cancel_is_not_a_free_do_not_pay_button(client):
    """Отмена начавшейся смены — это и была кнопка «не платить», двумя тапами."""
    emp_h, _, mid = _future_match(client)
    _unreadable_time(mid)
    r = client.post(f"/matches/{mid}/cancel", headers=emp_h, json={"reason": ""})
    assert r.status_code == 409, r.text
    assert "оператору" in r.json()["detail"]


def test_shift_with_unreadable_time_counts_as_not_over(client):
    """Ворота `shift_is_over` закрыты, а не открыты.

    Отдельно от эндпоинтов: на этой функции держатся и автозакрытие смены с
    начислением комиссии, и запрет отмечать неявку до смены. Стояло `return
    True` с оговоркой «битая дата — не мешаем людям работать»: одна фраза,
    открывавшая и ложную неявку, и комиссию за неотработанное, и акт «услуги
    оказаны полностью и в срок» на работу, которой не было.
    """
    _, _, mid = _future_match(client)
    _unreadable_time(mid)
    db = SessionLocal()
    try:
        assert shift_is_over(db, db.get(Match, mid)) is False
    finally:
        db.close()


def test_no_show_cannot_be_marked_before_the_shift(client):
    """Та же дыра с другой стороны: неявка работнику за неизвестно когда."""
    emp_h, seeker_h, mid = _future_match(client)
    _confirm(client, emp_h, seeker_h, mid)
    _unreadable_time(mid)
    r = client.post(f"/matches/{mid}/attendance", headers=emp_h,
                    json={"attended": False})
    assert r.status_code == 409, r.text
