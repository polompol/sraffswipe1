"""Сокет чата: поток кадров и их размер.

Живое приложение в сокет вообще не пишет — оно только слушает. Значит всё,
что приходит с той стороны, пришло не из приложения, и меру надо знать здесь.
"""
import json

from app.db import SessionLocal
from app.models import Employer, User
from app.timeutil import local_today


def _tomorrow():
    from datetime import date, timedelta

    return (date.fromisoformat(local_today()) + timedelta(days=1)).isoformat()


def _detach(owner_id, tg_id):
    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        o.tg_id = tg_id
        o.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _matched_pair(client):
    """Пара с мэтчем и токен работника."""
    emp = client.post("/auth/telegram",
                      json={"init_data": "", "role": "employer"}).json()
    emp_h = {"Authorization": f"Bearer {emp['access_token']}"}
    v = client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": _tomorrow(), "start_time": 600,
        "end_time": 1080, "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    }).json()
    _detach(emp["user_id"], 991001)
    see = client.post("/auth/telegram",
                      json={"init_data": "", "role": "seeker"}).json()
    see_h = {"Authorization": f"Bearer {see['access_token']}"}
    client.post("/swipes", headers=emp_h, json={
        "target_id": see["user_id"], "target_type": "user", "direction": "like"})
    mid = client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy",
        "direction": "like"}).json()["match_id"]
    return mid, see["access_token"]


def test_empty_frames_count_against_the_limit(client):
    """Пустые кадры тоже считаются.

    Лимит стоял ПОСЛЕ проверки «текст не пустой», поэтому поток {"text": ""}
    шёл мимо него совсем: соединение крутилось на полной скорости сети и
    занимало процесс, а в базе не появлялось ни строки — то есть и заметить
    это было не по чему.
    """
    mid, token = _matched_pair(client)
    with client.websocket_connect(f"/ws/chat/{mid}?token={token}") as ws:
        for _ in range(30):
            ws.send_text(json.dumps({"text": ""}))
        # Тридцать пустых кадров уже выбрали минутную норму, поэтому на
        # настоящее сообщение приходит отказ. Ответ приходит в любом случае —
        # либо отказ, либо само сообщение, — поэтому тест не может зависнуть.
        ws.send_text(json.dumps({"text": "Буду к десяти"}))
        answer = ws.receive_json()
    assert "error" in answer, (
        "пустые кадры не посчитали: норму можно выбирать бесконечно"
    )


def test_a_huge_frame_closes_the_socket(client):
    """Кадр больше потолка не принимаем.

    Текст мы и раньше резали до 2000 символов, но резали уже после того, как
    приняли кадр целиком: один кадр на сотню мегабайт занимал столько же
    памяти на сервере.
    """
    from starlette.websockets import WebSocketDisconnect

    mid, token = _matched_pair(client)
    with client.websocket_connect(f"/ws/chat/{mid}?token={token}") as ws:
        ws.send_text(json.dumps({"text": "я" * 20_000}))
        try:
            ws.receive_json()
            raise AssertionError("сокет должен был закрыться")
        except WebSocketDisconnect as exc:
            assert exc.code == 1009, "закрытие с кодом «слишком большое сообщение»"


def test_a_normal_message_still_goes_through(client):
    """И при всём этом обычное сообщение доходит до собеседника."""
    mid, token = _matched_pair(client)
    with client.websocket_connect(f"/ws/chat/{mid}?token={token}") as ws:
        ws.send_text(json.dumps({"text": "Буду к десяти"}))
        got = ws.receive_json()
    assert got["text"] == "Буду к десяти"
