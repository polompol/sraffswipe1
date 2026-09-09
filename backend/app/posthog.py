"""Privacy-safe, non-blocking PostHog transport.

Product analytics is deliberately server-side for StaffSwipe. The Telegram Mini
App talks only to our API, while this module forwards a small allowlisted view
of events to PostHog. Analytics must never be able to break auth, matching,
shifts, or money flows.
"""
from __future__ import annotations

import logging
import queue
import re
import threading
from typing import Any

import httpx

from .config import settings

_log = logging.getLogger("staffswipe.posthog")

# Keys that must never leave StaffSwipe. Matching is substring-based on the
# normalized key so variants such as contact_phone/payment_method are covered.
# Generic "id" is intentionally NOT forbidden: internal StaffSwipe UUIDs are
# useful for deduplication and are not Telegram IDs or payment identifiers.
_SENSITIVE_KEY_PARTS = (
    "init_data",
    "initdata",
    "authorization",
    "jwt",
    "access_token",
    "refresh_token",
    "telegram_bot_token",
    "tg_id",
    "telegram_id",
    "phone",
    "email",
    "inn",
    "ogrn",
    "passport",
    "document",
    "address",
    "latitude",
    "longitude",
    "payment_method",
    "provider_charge",
    "card",
    "message",
    "chat_text",
    "reason_text",
    "photo_url",
)
_ALLOWED_DOLLAR_KEYS = {"$anon_distinct_id", "$process_person_profile"}
_MAX_STRING = 256
_MAX_ITEMS = 20
_MAX_DEPTH = 3
_ANON_RX = re.compile(r"^[A-Za-z0-9_.:-]{8,128}$")

_QUEUE: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=2000)
_WORKER_STARTED = False
_WORKER_LOCK = threading.Lock()


def _normalized_key(key: str) -> str:
    return key.strip().lower().replace("-", "_")


def _sensitive_key(key: str) -> bool:
    normalized = _normalized_key(key)
    if normalized in _ALLOWED_DOLLAR_KEYS:
        return False
    return any(part in normalized for part in _SENSITIVE_KEY_PARTS)


def _safe_value(value: Any, depth: int) -> Any:
    if depth > _MAX_DEPTH:
        return None
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value[:_MAX_STRING]
    if isinstance(value, (list, tuple)):
        out = []
        for item in value[:_MAX_ITEMS]:
            safe = _safe_value(item, depth + 1)
            if safe is not None:
                out.append(safe)
        return out
    if isinstance(value, dict):
        return sanitize_properties(value, depth=depth + 1)
    # Datetimes, model instances and arbitrary objects are not analytics data.
    return None


def sanitize_properties(
    props: dict[str, Any] | None,
    *,
    depth: int = 0,
) -> dict[str, Any]:
    """Return a bounded, PII-safe copy suitable for a third-party service."""
    if not props or depth > _MAX_DEPTH:
        return {}
    out: dict[str, Any] = {}
    for raw_key, raw_value in list(props.items())[:100]:
        key = str(raw_key)[:80]
        if not key or _sensitive_key(key):
            continue
        safe = _safe_value(raw_value, depth)
        if safe is not None:
            out[key] = safe
    return out


def safe_anonymous_id(value: str | None) -> str:
    """Accept only the random client identifier format, never arbitrary text."""
    candidate = (value or "").strip()[:128]
    return candidate if _ANON_RX.fullmatch(candidate) else ""


def _post(payload: dict[str, Any]) -> None:
    try:
        url = f"{settings.posthog_host.rstrip('/')}/i/v0/e/"
        with httpx.Client(timeout=2.0) as client:
            response = client.post(url, json=payload)
            response.raise_for_status()
    except Exception as exc:  # noqa: BLE001 - analytics never breaks product flows
        _log.warning("PostHog event delivery failed: %s", exc)


def _worker() -> None:
    while True:
        payload = _QUEUE.get()
        try:
            _post(payload)
        finally:
            _QUEUE.task_done()


def _ensure_worker() -> None:
    global _WORKER_STARTED
    if _WORKER_STARTED:
        return
    with _WORKER_LOCK:
        if _WORKER_STARTED:
            return
        threading.Thread(
            target=_worker,
            name="staffswipe-posthog",
            daemon=True,
        ).start()
        _WORKER_STARTED = True


def capture_event(
    event: str,
    distinct_id: str,
    properties: dict[str, Any] | None = None,
) -> bool:
    """Queue one event without blocking or raising into business logic."""
    if not settings.posthog_ready:
        return False
    name = (event or "").strip()[:120]
    identity = (distinct_id or "").strip()[:128]
    if not name or not identity:
        return False

    safe = sanitize_properties(properties)
    safe["distinct_id"] = identity
    # Explicitly create person profiles only for known StaffSwipe accounts.
    safe["$process_person_profile"] = not identity.startswith("anon:")
    payload = {
        "api_key": settings.posthog_project_key,
        "event": name,
        "properties": safe,
    }
    try:
        _ensure_worker()
        _QUEUE.put_nowait(payload)
        return True
    except queue.Full:
        _log.warning("PostHog queue full; dropping event %s", name)
        return False
    except Exception as exc:  # noqa: BLE001
        _log.warning("PostHog queue failed: %s", exc)
        return False


def identify_user(distinct_id: str, anonymous_id: str | None, role: str) -> None:
    """Merge a pre-auth anonymous journey into the internal StaffSwipe UUID."""
    anon = safe_anonymous_id(anonymous_id)
    if anon:
        capture_event(
            "$identify",
            distinct_id,
            {"$anon_distinct_id": f"anon:{anon}", "role": role},
        )
    capture_event("user_authenticated", distinct_id, {"role": role})
