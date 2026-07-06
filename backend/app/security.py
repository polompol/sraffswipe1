"""JWT-аутентификация (свои токены, как в варианте 2 спецификации)."""
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db

bearer = HTTPBearer(auto_error=False)


def _is_blocked(db: Session, principal: dict) -> bool:
    """Забанен ли владелец токена. Проверяется на КАЖДОМ запросе, а не только
    при логине — иначе бан админа не действует до истечения токена (30 дней)."""
    from .models import Employer, User

    owner = (
        db.get(Employer, principal["id"])
        if principal.get("role") == "employer"
        else db.get(User, principal["id"])
    )
    return bool(owner is not None and owner.blocked)


def create_token(subject_id: str, role: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": subject_id,
        "role": role,  # seeker|employer
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_ttl_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)


def decode_token(token: str) -> dict | None:
    """Декодирует JWT в принципала {id, role} или None. Без исключений —
    удобно для query-токена (PDF, WebSocket)."""
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_alg]
        )
    except jwt.PyJWTError:
        return None
    return {"id": payload["sub"], "role": payload.get("role", "seeker")}


def current_principal(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> dict:
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Нет токена"
        )
    principal = decode_token(creds.credentials)
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Невалидный токен"
        )
    if _is_blocked(db, principal):
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
    return principal


def optional_principal(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict | None:
    """Принципал, если токен есть и валиден; иначе None (без ошибки)."""
    if creds is None:
        return None
    return decode_token(creds.credentials)
