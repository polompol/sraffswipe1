"""Чат: REST для истории + WebSocket для real-time.

Между процессами сообщения расходятся через Redis (см. ConnectionManager);
без Redis — раздача внутри процесса, как раньше.
"""
import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from .. import redisclient
from ..db import SessionLocal, get_db
from ..models import Match, Message
from ..notify import notify_owner
from ..ratelimit import hit, rate_limit
from ..schemas import MessageIn, MessageOut
from ..security import (
    current_principal,
    decode_token,
    ensure_token_usable,
)

_log = logging.getLogger("staffswipe")

router = APIRouter(tags=["chat"])


def _require_participant(db: Session, match_id: str, principal: dict) -> Match:
    """Мэтч существует и принципал — его участник, иначе 404/403."""
    match = db.get(Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["id"] not in (match.user_id, match.employer_id):
        raise HTTPException(status_code=403, detail="Нет доступа к чату")
    return match


def _to_out(m: Message) -> MessageOut:
    return MessageOut(
        id=m.id,
        match_id=m.match_id,
        sender_id=m.sender_id,
        text=m.text,
        is_system=m.is_system,
    )


# Сколько сообщений отдаём за раз. Раньше отдавались ВСЕ сообщения чата
# сразу — и на каждое открытие экрана, и на каждое переподключение. У живого
# заведения переписка по смене копится месяцами: это лишние мегабайты по
# мобильному интернету и заметная пауза перед тем, как чат покажется.
_PAGE = 100
_PAGE_MAX = 200

# Потолок одного кадра в сокете. Текст мы всё равно режем до 2000 символов,
# так что с запасом: 8 КБ хватает любому живому сообщению.
_WS_FRAME_MAX = 8192


@router.get("/matches/{match_id}/messages", response_model=list[MessageOut])
def history(
    match_id: str,
    before: str = "",
    limit: int = _PAGE,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Последние сообщения чата (по возрастанию времени).

    `before` — id сообщения, ДО которого нужна предыдущая порция: так экран
    догружает старую переписку кнопкой «Показать более ранние».
    """
    _require_participant(db, match_id, principal)
    limit = max(1, min(limit, _PAGE_MAX))
    q = db.query(Message).filter(Message.match_id == match_id)
    if before:
        anchor = db.get(Message, before)
        # Чужой id молча игнорируем: это не попытка взлома, а старая вкладка.
        if anchor is not None and anchor.match_id == match_id:
            # Сравниваем и по id тоже: у нескольких сообщений может совпасть
            # время до микросекунды (системные сообщения пишутся пачкой), и
            # тогда порция зациклилась бы на одном и том же месте.
            q = q.filter(
                or_(
                    Message.created_at < anchor.created_at,
                    and_(
                        Message.created_at == anchor.created_at,
                        Message.id < anchor.id,
                    ),
                )
            )
    rows = (
        q.order_by(Message.created_at.desc(), Message.id.desc())
        .limit(limit)
        .all()
    )
    # В базе брали с конца (последние), а показываем по-человечески — сверху
    # старые, снизу свежие.
    return [_to_out(m) for m in reversed(rows)]


@router.post(
    "/matches/{match_id}/messages",
    response_model=MessageOut,
    dependencies=[Depends(rate_limit("msg", 30, 60))],
)
async def send(
    match_id: str,
    body: MessageIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    match = _require_participant(db, match_id, principal)
    msg = Message(match_id=match_id, sender_id=principal["id"], text=body.text)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    out = _to_out(msg)
    await manager.broadcast(match_id, out.model_dump())
    # Уведомляем второго участника мэтча в Telegram.
    other = (
        match.employer_id
        if principal["id"] == match.user_id
        else match.user_id
    )
    # Открываем ИМЕННО этот разговор, а не общий список мэтчей: раньше на
    # каждое сообщение человек попадал в список и искал нужный чат сам. Именно
    # из-за такой мелочи переписку уводят в личку — а там мы её не видим.
    notify_owner(
        db, other, f"💬 Новое сообщение: {body.text[:60]}",
        open_app="Ответить", screen="chat", ident=match_id,
    )
    # Авто-модерация чата: «переведи предоплату» и т.п. → флаг админу.
    from ..moderation import auto_flag

    auto_flag(db, "match", match_id, body.text)
    return out


class ConnectionManager:
    """Комнаты чата по match_id.

    Сокеты живут в памяти того процесса, который их держит, — иначе никак.
    А вот РАЗДАЧА сообщения идёт через Redis: процесс публикует сообщение в
    общий канал, и каждый процесс отдаёт его своим сокетам. Без этого два
    человека в одном чате, попавшие на разные процессы, не видели бы друг
    друга — поэтому до сих пор и стояло ограничение «один воркер».

    Без Redis всё работает как раньше: раздача внутри процесса.
    """

    CHANNEL = "chat:broadcast"

    def __init__(self) -> None:
        self._rooms: dict[str, list[WebSocket]] = {}
        self._listener = None       # задача-подписчик, одна на процесс

    async def _ensure_listener(self) -> None:
        """Подписчик на общий канал. Поднимается лениво — при первом чате."""
        if self._listener is not None:
            return
        client = await redisclient.async_client()
        if client is None:
            return
        self._listener = asyncio.create_task(self._listen(client))

    async def _listen(self, client) -> None:
        try:
            pubsub = client.pubsub(ignore_subscribe_messages=True)
            await pubsub.subscribe(self.CHANNEL)
            async for msg in pubsub.listen():
                try:
                    payload = json.loads(msg["data"])
                    await self._deliver_local(payload["match_id"], payload["data"])
                except Exception:  # noqa: BLE001 — битое сообщение не рвёт подписку
                    continue
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            _log.warning("Подписка чата на Redis прервалась: %s", exc)
            self._listener = None   # следующий чат попробует подписаться заново

    async def connect(self, match_id: str, ws: WebSocket) -> None:
        await ws.accept()
        await self._ensure_listener()
        self._rooms.setdefault(match_id, []).append(ws)

    def disconnect(self, match_id: str, ws: WebSocket) -> None:
        room = self._rooms.get(match_id)
        if not room:
            return
        if ws in room:
            room.remove(ws)
        if not room:
            self._rooms.pop(match_id, None)

    async def _deliver_local(self, match_id: str, data: dict) -> None:
        """Отдать сообщение сокетам ЭТОГО процесса."""
        dead: list[WebSocket] = []
        for ws in list(self._rooms.get(match_id, [])):
            try:
                await ws.send_json(data)
            except Exception:  # noqa: BLE001 — сокет умер: помечаем на удаление
                dead.append(ws)
        for ws in dead:
            self.disconnect(match_id, ws)

    async def broadcast(self, match_id: str, data: dict) -> None:
        client = await redisclient.async_client()
        if client is None:
            await self._deliver_local(match_id, data)
            return
        try:
            # Публикуем всем процессам, включая себя: свои сокеты получат
            # сообщение через подписку, дубля не будет.
            await client.publish(
                self.CHANNEL,
                json.dumps({"match_id": match_id, "data": data},
                           ensure_ascii=False),
            )
        except Exception as exc:  # noqa: BLE001 — Redis упал: отдаём хотя бы своим
            _log.warning("Не удалось разослать сообщение через Redis: %s", exc)
            await self._deliver_local(match_id, data)


manager = ConnectionManager()


@router.websocket("/ws/chat/{match_id}")
async def ws_chat(websocket: WebSocket, match_id: str, token: str = ""):
    # Аутентификация по query-токену; sender_id берём из токена, не от клиента.
    principal = decode_token(token)
    if principal is None:
        await websocket.close(code=4401)
        return
    db = SessionLocal()
    try:
        match = db.get(Match, match_id)
        if match is None or principal["id"] not in (
            match.user_id, match.employer_id
        ):
            await websocket.close(code=4403)
            return
        try:
            # Забаненный или разлогиненный не висит в чужом чате.
            ensure_token_usable(db, principal)
        except HTTPException:
            await websocket.close(code=4403)
            return
    finally:
        db.close()

    sender = principal["id"]
    await manager.connect(match_id, websocket)
    try:
        while True:
            frame = await websocket.receive_text()
            # Считаем КАЖДЫЙ кадр, а не только тот, что дошёл до сохранения.
            # Лимит стоял после проверок «пусто» и «не строка», поэтому поток
            # пустых кадров {"text":""} проходил мимо него совсем: соединение
            # крутилось на полной скорости сети и занимало процесс.
            try:
                hit(f"msg:{sender}", 30, 60)
            except HTTPException:
                await websocket.send_json(
                    {"error": "Слишком часто. Подождите немного."}
                )
                continue
            # Размер кадра ограничиваем ДО разбора. Длину текста мы и раньше
            # резали до 2000, но резали уже после того, как приняли кадр
            # целиком: один кадр на сотню мегабайт занимал столько же памяти
            # на сервере, и никакой лимит частоты этого не отменял.
            if len(frame) > _WS_FRAME_MAX:
                await websocket.close(code=1009)  # message too big
                break
            try:
                data = json.loads(frame)
            except ValueError:
                continue
            if not isinstance(data, dict):
                continue
            # Тот же контроль, что и на REST-пути: обрезаем длину (анти-раздувание
            # БД) и молча пропускаем пустое. Без этого WS был обходом лимита 2000.
            raw = data.get("text", "")
            text = raw.strip()[:2000] if isinstance(raw, str) else ""
            if not text:
                continue
            db = SessionLocal()
            try:
                # Проверяем на каждое сообщение: за долгий коннект человека
                # могли заблокировать или разлогинить.
                try:
                    ensure_token_usable(db, principal)
                except HTTPException:
                    await websocket.close(code=4403)
                    break
                msg = Message(match_id=match_id, sender_id=sender, text=text)
                db.add(msg)
                db.commit()
                db.refresh(msg)
                payload = _to_out(msg).model_dump()
                # Авто-модерация подозрительных фраз (как на REST-пути).
                from ..moderation import auto_flag
                auto_flag(db, "message", msg.id, text)
            finally:
                db.close()
            await manager.broadcast(match_id, payload)
    except WebSocketDisconnect:
        pass
    finally:
        # Отписываем сокет ЛЮБЫМ путём выхода, а не только по обрыву связи.
        # Раньше выход по ошибке (битый JSON, закрытие с нашей стороны)
        # оставлял мёртвый сокет в комнате навсегда, и каждое следующее
        # сообщение в этом чате пыталось в него писать.
        manager.disconnect(match_id, websocket)
