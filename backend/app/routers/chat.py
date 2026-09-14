"""Чат: REST для истории + WebSocket для real-time.

Между процессами сообщения расходятся через Redis (см. ConnectionManager);
без Redis — раздача внутри процесса, как раньше.
"""
import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import redisclient
from ..db import SessionLocal, get_db
from ..models import Employer, Match, Message, User
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
        client_message_id=m.client_message_id,
        match_id=m.match_id,
        sender_id=m.sender_id,
        text=m.text,
        is_system=m.is_system,
        created_at=m.created_at,
    )


def _find_client_message(
    db: Session, match_id: str, sender_id: str, client_id: str | None,
) -> Message | None:
    if client_id is None:
        return None
    return db.query(Message).filter(
        Message.match_id == match_id, Message.sender_id == sender_id,
        Message.client_message_id == client_id,
    ).first()


def _same_message(existing: Message, text: str) -> tuple[Message, bool]:
    if existing.text != text:
        raise HTTPException(
            status_code=409,
            detail="Этот идентификатор уже использован для другого сообщения",
        )
    return existing, False


def _save_message(
    db: Session, match_id: str, sender_id: str, body: MessageIn,
) -> tuple[Message, bool]:
    """Квитанция запроса общая для REST и WS, включая параллельную вставку."""
    client_id = str(body.client_message_id) if body.client_message_id else None
    existing = _find_client_message(db, match_id, sender_id, client_id)
    if existing is not None:
        return _same_message(existing, body.text)
    msg = Message(
        match_id=match_id, sender_id=sender_id, text=body.text,
        client_message_id=client_id,
    )
    try:
        with db.begin_nested():
            db.add(msg)
            db.flush()
    except IntegrityError:
        # SAVEPOINT оставляет сессию пригодной для чтения победившей записи.
        existing = _find_client_message(db, match_id, sender_id, client_id)
        if existing is None:
            raise
        return _same_message(existing, body.text)
    db.commit()
    db.refresh(msg)
    return msg, True


def _notify_new_message(db: Session, match: Match, msg: Message) -> None:
    """Повторы не создают ещё одно уведомление или флаг модерации."""
    from ..moderation import auto_flag

    auto_flag(db, "match", match.id, msg.text)
    other = (
        match.employer_id if msg.sender_id == match.user_id else match.user_id
    )
    receiver = db.get(User, other) or db.get(Employer, other)
    if receiver is not None and not receiver.blocked:
        notify_owner(
            db, other, f"💬 Новое сообщение: {msg.text[:60]}",
            open_app="Ответить", screen="chat", ident=match.id,
        )


def _socket_access(match_id: str, token: str) -> tuple[dict | None, int | None]:
    principal = decode_token(token)
    if principal is None or principal.get("scope"):
        return None, 4401
    with SessionLocal() as db:
        try:
            ensure_token_usable(db, principal)
            _require_participant(db, match_id, principal)
        except HTTPException:
            return None, 4403
    return principal, None


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
    msg, created = _save_message(db, match_id, principal["id"], body)
    out = _to_out(msg)
    if created:
        _notify_new_message(db, match, msg)
        await manager.broadcast(match_id, out.model_dump(mode="json"))
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
        self._tokens: dict[int, str] = {}
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

    async def connect(
        self, match_id: str, ws: WebSocket, *, token: str = "",
    ) -> None:
        await ws.accept()
        await self._ensure_listener()
        self._tokens[id(ws)] = token
        self._rooms.setdefault(match_id, []).append(ws)

    def disconnect(self, match_id: str, ws: WebSocket) -> None:
        self._tokens.pop(id(ws), None)
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
                # Проверяем получателя, даже если он ничего не отправляет.
                _, code = _socket_access(match_id, self._tokens.get(id(ws), ""))
                if code is not None:
                    await ws.close(code=code)
                    dead.append(ws)
                    continue
                await ws.send_json(data)
            except Exception:  # noqa: BLE001 — при сбое закрываем доступ
                dead.append(ws)
                try:
                    await ws.close(code=1011)
                except Exception:  # noqa: BLE001 — сокет уже закрыт
                    pass
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
    principal, code = _socket_access(match_id, token)
    if code is not None:
        await websocket.close(code=code)
        return
    sender = principal["id"]
    await manager.connect(match_id, websocket, token=token)
    try:
        while True:
            try:
                frame = await asyncio.wait_for(
                    websocket.receive_text(), timeout=30,
                )
            except TimeoutError:
                # Бездействующее соединение тоже не живёт после отзыва.
                _, code = _socket_access(match_id, token)
                if code is not None:
                    await websocket.close(code=code)
                    break
                continue
            if decode_token(token) is None:
                await websocket.close(code=4401)
                break
            try:
                # Пустые/битые кадры тоже расходуют лимит.
                hit(f"msg:{sender}", 30, 60)
            except HTTPException:
                await websocket.send_json(
                    {"error": "Слишком часто. Подождите немного."}
                )
                continue
            if len(frame.encode("utf-8")) > _WS_FRAME_MAX:
                await websocket.close(code=1009)
                break
            try:
                data = json.loads(frame)
            except ValueError:
                continue
            if not isinstance(data, dict):
                continue
            raw = data.get("text", "")
            text = raw.strip()[:2000] if isinstance(raw, str) else ""
            if not text:
                continue
            try:
                body = MessageIn(
                    text=text, client_message_id=data.get("client_message_id"),
                )
            except ValidationError:
                await websocket.send_json(
                    {"error": "Некорректный идентификатор сообщения"}
                )
                continue
            _, code = _socket_access(match_id, token)
            if code is not None:
                await websocket.close(code=code)
                break
            with SessionLocal() as db:
                try:
                    match = _require_participant(db, match_id, principal)
                    msg, created = _save_message(db, match_id, sender, body)
                except HTTPException as exc:
                    await websocket.send_json({"error": exc.detail})
                    continue
                payload = _to_out(msg).model_dump(mode="json")
                if created:
                    _notify_new_message(db, match, msg)
            if created:
                await manager.broadcast(match_id, payload)
            else:
                # Повтор подтверждаем только отправителю, без нового broadcast.
                await websocket.send_json(payload)
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(match_id, websocket)
