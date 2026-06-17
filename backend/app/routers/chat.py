"""Чат: REST для истории + WebSocket для real-time (в проде — Redis pub/sub)."""
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..models import Match, Message
from ..notify import notify_owner
from ..ratelimit import rate_limit
from ..schemas import MessageIn, MessageOut
from ..security import current_principal, decode_token

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


@router.get("/matches/{match_id}/messages", response_model=list[MessageOut])
def history(
    match_id: str,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    _require_participant(db, match_id, principal)
    rows = (
        db.query(Message)
        .filter(Message.match_id == match_id)
        .order_by(Message.created_at)
        .all()
    )
    return [_to_out(m) for m in rows]


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
    notify_owner(db, other, f"💬 Новое сообщение: {body.text[:60]}")
    return out


class ConnectionManager:
    """Простой in-memory брокер WebSocket-комнат по match_id."""

    def __init__(self) -> None:
        self._rooms: dict[str, list[WebSocket]] = {}

    async def connect(self, match_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._rooms.setdefault(match_id, []).append(ws)

    def disconnect(self, match_id: str, ws: WebSocket) -> None:
        self._rooms.get(match_id, []).remove(ws)

    async def broadcast(self, match_id: str, data: dict) -> None:
        for ws in list(self._rooms.get(match_id, [])):
            await ws.send_json(data)


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
            match.user_id,
            match.employer_id,
        ):
            await websocket.close(code=4403)
            return
    finally:
        db.close()

    sender = principal["id"]
    await manager.connect(match_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            text = data.get("text", "")
            if not text:
                continue
            db = SessionLocal()
            try:
                msg = Message(match_id=match_id, sender_id=sender, text=text)
                db.add(msg)
                db.commit()
                db.refresh(msg)
                payload = _to_out(msg).model_dump()
            finally:
                db.close()
            await manager.broadcast(match_id, payload)
    except WebSocketDisconnect:
        manager.disconnect(match_id, websocket)
