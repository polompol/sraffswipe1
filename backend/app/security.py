"""JWT-аутентификация (свои токены, как в варианте 2 спецификации)."""
import hmac
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db

bearer = HTTPBearer(auto_error=False)


def secure_equals(a: str, b: str) -> bool:
    """Сравнение строк, устойчивое и к таймингу, и к нелатинским символам.

    hmac.compare_digest на строках требует только ASCII и БРОСАЕТ TypeError на
    кириллице или эмодзи. То есть достаточно было прислать секрет с русской
    буквой, чтобы вместо честного «неверный токен» получить необработанную
    ошибку 500. Сравниваем байты — тогда на вход годится что угодно.
    """
    return hmac.compare_digest((a or "").encode("utf-8"), (b or "").encode("utf-8"))


def _owner(db: Session, principal: dict):
    """Владелец токена (соискатель или заведение) или None."""
    from .models import Employer, User

    return (
        db.get(Employer, principal["id"])
        if principal.get("role") == "employer"
        else db.get(User, principal["id"])
    )


def _is_blocked(db: Session, principal: dict) -> bool:
    """Забанен ли владелец токена. Проверяется на КАЖДОМ запросе, а не только
    при логине — иначе бан админа не действует до истечения токена."""
    return bool((o := _owner(db, principal)) is not None and o.blocked)


def _is_revoked(owner, principal: dict) -> bool:
    """Отозван ли токен: его поколение не совпадает с текущим у владельца.

    Срок жизни токена — дни, и до этого отозвать его было НЕЧЕМ: украли
    телефон разблокированным — доступ сохранялся до конца срока. Теперь у
    аккаунта есть номер поколения; «выйти на всех устройствах» увеличивает
    его, и все выданные раньше токены разом перестают подходить. То же при
    переносе аккаунта на новый Telegram — иначе у прежнего владельца доступ
    продолжал бы жить.

    Сравниваем номера, а не время: время в токене хранится с точностью до
    секунды, и вход в ту же секунду, что и отзыв, отличить было бы нельзя.
    """
    if owner is None:
        return False
    return int(principal.get("ver", 0)) != int(
        getattr(owner, "token_version", 0) or 0
    )


def create_token(subject_id: str, role: str, version: int = 0) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": subject_id,
        "role": role,  # seeker|employer
        "ver": version,  # поколение токенов владельца (см. _is_revoked)
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
    return {
        "id": payload["sub"],
        "role": payload.get("role", "seeker"),
        # Поколение токена — по нему отличаем отозванные (см. _is_revoked).
        "ver": payload.get("ver", 0),
    }


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
    ensure_token_usable(db, principal)
    return principal


def ensure_token_usable(db: Session, principal: dict) -> None:
    """Бан и отзыв — одной проверкой и одним походом в базу.

    Отдельная функция, потому что кроме обычных ручек токен принимают ещё два
    места, где нет привычной зависимости: скачивание акта (токен в адресе, его
    открывает браузер) и WebSocket чата. Раньше каждое проверяло бан само по
    себе, и любую новую проверку пришлось бы дописывать в трёх местах.
    """
    owner = _owner(db, principal)
    if owner is not None and owner.blocked:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
    if _is_revoked(owner, principal):
        raise HTTPException(
            status_code=401, detail="Сессия завершена — войдите заново"
        )


def optional_principal(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> dict | None:
    """Принципал, если токен есть и валиден; иначе None (без ошибки).

    Бан и отзыв проверяем и здесь. Без этого обещание «бан действует на каждом
    запросе» не выполнялось на ручках с необязательной авторизацией: лента
    смен и приём событий продолжали работать у заблокированного человека и по
    отозванному токену. Для таких ручек это не ошибка входа — просто считаем,
    что человек не представился.
    """
    if creds is None:
        return None
    principal = decode_token(creds.credentials)
    if principal is None:
        return None
    try:
        ensure_token_usable(db, principal)
    except HTTPException:
        return None
    return principal
