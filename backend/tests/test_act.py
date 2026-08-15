"""Акт выполненных работ: номер, расчёт суммы и сумма прописью.

Зачем: акт — единственный документ, который человек уносит из сервиса в
свою бухгалтерию. Раньше на него не было ни одного содержательного теста —
проверялись только права доступа.
"""
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

from app.routers.acts import act_number
from app.rubles import plural, rubles_in_words
from app.timeutil import local_today


def _d(days: int) -> str:
    """Дата смены относительно «сегодня» — по местному времени, как её
    видит человек: у сервера в UTC с 21:00 уже другая дата."""
    return (date.fromisoformat(local_today()) + timedelta(days=days)).isoformat()


def test_act_number_is_the_same_forever():
    """Номер акта не меняется между запусками сервера.

    Раньше он считался через hash(): в Python хеш строк солится случайно при
    старте процесса, и один и тот же акт скачивался под разными номерами.
    Проверяем именно в отдельном процессе — в текущем соль уже зафиксирована.
    """
    mine = act_number("match-abc-123")
    other = subprocess.run(
        [sys.executable, "-c",
         "from app.routers.acts import act_number; print(act_number('match-abc-123'))"],
        cwd=Path(__file__).resolve().parent.parent,  # backend/ — там пакет app
        capture_output=True, text=True, timeout=60,
    )
    assert other.returncode == 0, other.stderr
    assert other.stdout.strip() == mine
    assert len(mine) == 5 and mine.isdigit()


def test_different_shifts_get_different_numbers():
    assert act_number("match-1") != act_number("match-2")


@pytest.mark.parametrize(("amount", "words"), [
    (0, "Ноль рублей 00 копеек"),
    (1, "Один рубль 00 копеек"),
    (2, "Два рубля 00 копеек"),
    (11, "Одиннадцать рублей 00 копеек"),
    (21, "Двадцать один рубль 00 копеек"),
    (100, "Сто рублей 00 копеек"),
    (1000, "Одна тысяча рублей 00 копеек"),
    (2800, "Две тысячи восемьсот рублей 00 копеек"),
    (5000, "Пять тысяч рублей 00 копеек"),
    (11000, "Одиннадцать тысяч рублей 00 копеек"),
    (999999, "Девятьсот девяносто девять тысяч девятьсот девяносто девять "
             "рублей 00 копеек"),
])
def test_sum_in_words(amount, words):
    assert rubles_in_words(amount) == words


def test_words_reject_impossible_amounts():
    with pytest.raises(ValueError):
        rubles_in_words(-1)


def test_big_sums_do_not_break_the_document():
    """Раньше от миллиона функция бросала исключение — и акт отвечал 500-й.

    Миллион достижим штатно: ставка до 1 000 000 ₽ разрешена схемой, да и долг
    заведения за месяц столько набрать может. Документ важнее красоты прописи.
    """
    text = rubles_in_words(1_600_000)
    assert "1 600 000" in text and "рублей" in text


def test_plural_forms():
    assert plural(1, "час", "часа", "часов") == "час"
    assert plural(3, "час", "часа", "часов") == "часа"
    assert plural(5, "час", "часа", "часов") == "часов"
    assert plural(12, "час", "часа", "часов") == "часов"
    assert plural(22, "час", "часа", "часов") == "часа"


def _confirmed_match(client):
    """Пара с подтверждённой сменой: 10:00–18:00 по 350 ₽/час = 2800 ₽."""
    emp = client.post("/auth/telegram",
                      json={"init_data": "", "role": "employer"}).json()
    eh = {"Authorization": f"Bearer {emp['access_token']}"}
    v = client.post("/vacancies", headers=eh, json={
        "role": "barista", "date": _d(0), "start_time": 600, "end_time": 1080,
        "rate": 350, "rate_type": "perHour", "lat": 55.75, "lng": 37.61,
        "address": "Москва, Тверская, 12", "city": "Москва",
    }).json()
    seek = client.post("/auth/telegram",
                       json={"init_data": "", "role": "seeker"}).json()
    sh = {"Authorization": f"Bearer {seek['access_token']}"}
    client.post("/swipes", headers=sh, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    me = client.get("/me", headers=sh).json()
    sw = client.post("/swipes", headers=eh, json={
        "target_id": me["id"], "target_type": "user", "direction": "like"}).json()
    mid = sw["match_id"]
    client.post(f"/matches/{mid}/confirm", headers=sh)
    client.post(f"/matches/{mid}/confirm", headers=eh)

    # Доводим смену до закрытия: акт — документ о ВЫПОЛНЕННОЙ работе.
    from app.db import SessionLocal
    from app.models import Match, Vacancy

    from .shifttime import age_shift

    age_shift(mid)
    db = SessionLocal()
    try:
        shift_date = db.get(Vacancy, db.get(Match, mid).vacancy_id).date
    finally:
        db.close()
    code = [m for m in client.get("/matches", headers=eh).json()
            if m["id"] == mid][0]["checkin_code"]
    client.post(f"/matches/{mid}/checkin", headers=sh, json={"code": code})
    client.post(f"/matches/{mid}/attendance", headers=eh, json={"attended": True})
    return mid, seek["access_token"], shift_date


def test_act_contains_calculation_and_signatures(client):
    """В акте видно, откуда взялась сумма, и есть где расписаться."""
    pypdf = pytest.importorskip("pypdf")
    mid, token, shift_date = _confirmed_match(client)

    r = client.get(f"/matches/{mid}/act.pdf", params={"token": token})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"

    import io
    text = pypdf.PdfReader(io.BytesIO(r.content)).pages[0].extract_text()
    text = " ".join(text.split())  # переносы строк в PDF нам не важны

    assert f"Акт № {act_number(mid)}" in text
    assert "350" in text and "2800" in text          # ставка и итог
    assert "8 часов" in text                          # из чего сумма
    assert "Две тысячи восемьсот рублей" in text      # прописью
    assert "Заказчик:" in text and "Исполнитель:" in text
    assert "подпись" in text
    # Дата по-русски, а не в ISO — и именно дата смены, а не «вчера»
    # по часам сервера: сервер живёт в UTC, а смена — по Москве.
    assert date.fromisoformat(shift_date).strftime("%d.%m.%Y") in text
