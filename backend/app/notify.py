"""Уведомления пользователям через Telegram-бота (best-effort).

Backend шлёт sendMessage напрямую (есть токен бота). Без токена/без tg_id —
тихий no-op, чтобы не ломать основной поток. Отправка уходит в фон, поэтому
медленный или недоступный Telegram не тормозит запрос человека и не
блокирует event-loop в async-ручках.

Фон — это ОЧЕРЕДЬ с несколькими постоянными работниками, а не поток на
каждое сообщение. Раньше на каждое уведомление создавался новый поток. При
обычной работе это незаметно, но рассылки идут пачками: «срочный зов» бьёт
по сотне человек сразу, вечерние напоминания — по всей базе. Сотни потоков
одновременно — это память, забитый процессор и почти гарантированный ответ
Telegram «слишком часто» (429), после которого сообщения просто пропадают.

Поэтому здесь три вещи:
1. Постоянные работники (`_WORKERS`) разбирают общую очередь.
2. Общий темп не выше `_MAX_PER_SEC` — предел Telegram около 30 сообщений в
   секунду, идём чуть ниже.
3. Очередь ограничена. Если она переполнена, лишнее отбрасывается с записью
   в лог: лучше потерять часть уведомлений, чем положить сервис.
"""
import json
import logging
import queue
import threading
import time
import urllib.request

from sqlalchemy.orm import Session

from .config import settings
from .models import Employer, User

logger = logging.getLogger("staffswipe.notify")

# Сколько сообщений отправляем одновременно. Больше не нужно: узкое место —
# не наш процессор, а лимит Telegram.
_WORKERS = 4
# Предел Telegram — около 30 сообщений в секунду на бота. Держимся ниже:
# упереться в лимит значит получить 429 и потерять сообщения.
_MAX_PER_SEC = 20.0
# Потолок очереди. Больше — значит Telegram лежит совсем, и копить смысла нет.
_QUEUE_LIMIT = 5000

_queue: "queue.Queue[tuple]" = queue.Queue(maxsize=_QUEUE_LIMIT)
_start_lock = threading.Lock()
_started = False
_pace_lock = threading.Lock()
_last_sent = 0.0
_dropped = 0


def _pace() -> None:
    """Не быстрее `_MAX_PER_SEC` сообщений в секунду на всех работников сразу."""
    global _last_sent
    gap = 1.0 / _MAX_PER_SEC
    with _pace_lock:
        wait = _last_sent + gap - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_sent = time.monotonic()


def _worker() -> None:
    while True:
        job = _queue.get()
        try:
            _pace()
            _send(*job)
        except Exception:  # noqa: BLE001 — работник не должен умирать молча
            logger.exception("не удалось отправить уведомление")
        finally:
            _queue.task_done()


def _ensure_workers() -> None:
    global _started
    if _started:
        return
    with _start_lock:
        if _started:
            return
        for i in range(_WORKERS):
            threading.Thread(
                target=_worker, name=f"notify-{i}", daemon=True
            ).start()
        _started = True


def _enqueue(job: tuple) -> None:
    global _dropped
    _ensure_workers()
    try:
        _queue.put_nowait(job)
    except queue.Full:
        _dropped += 1
        # Пишем не каждый раз, а редко: при завале лог сам станет проблемой.
        if _dropped % 100 == 1:
            logger.warning(
                "очередь уведомлений переполнена, потеряно всего: %s", _dropped
            )


def _tg_id(db: Session, owner_id: str) -> int | None:
    u = db.get(User, owner_id)
    if u is not None:
        return u.tg_id
    e = db.get(Employer, owner_id)
    return e.tg_id if e is not None else None


def webapp_url(screen: str = "", ident: str = "") -> str:
    """Ссылка на Mini App с указанием экрана, который надо открыть.

    Экран передаём query-параметром, а НЕ через #/путь: Telegram кладёт
    initData в фрагмент URL (#tgWebAppData=...), и наш собственный хэш там
    просто затрётся. Приложение читает ?go= при старте и переходит куда надо.

    Без этого кнопка в уведомлении открывала корень: человеку приходило
    «отметьтесь на смене», он жал кнопку и попадал в ленту вакансий — искать
    нужный экран самому.

    `ident` — на какую именно запись открыть экран. Нужен чату: уведомление
    «Новое сообщение» вело в общий список мэтчей, и человеку приходилось
    искать нужный разговор самому — на каждое сообщение. Ради этого люди и
    уходят переписываться в личку.
    """
    base = settings.mini_app_url
    if not base or not screen:
        return base
    sep = "&" if "?" in base else "?"
    url = f"{base}{sep}go={screen}"
    if ident:
        url += f"&id={ident}"
    return url


def _send(
    token: str,
    tg: int,
    text: str,
    open_app: str | None = None,
    screen: str = "",
    ident: str = "",
) -> None:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    body: dict = {"chat_id": tg, "text": text}
    # Кнопка «открыть приложение» прямо в сообщении: человек отмечается на
    # смене в один тап из бота, а не ищет приложение и нужный экран.
    # web_app открывает Mini App внутри Telegram — вход по обычному initData,
    # отдельного доверенного канала для бота не появляется.
    if open_app and settings.mini_app_url:
        body["reply_markup"] = {
            "inline_keyboard": [[{
                "text": open_app,
                "web_app": {"url": webapp_url(screen, ident)},
            }]]
        }
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=5)  # noqa: S310
    except Exception:  # noqa: BLE001
        pass


def notify_owner(
    db: Session,
    owner_id: str,
    text: str,
    open_app: str | None = None,
    screen: str = "",
    ident: str = "",
) -> None:
    """Отправить текст пользователю/работодателю по его tg_id (не блокируя).

    `open_app` — подпись кнопки, открывающей Mini App прямо из сообщения;
    `screen` — какой экран открыть (`shifts`, `matches`, `chat`…);
    `ident` — на какую запись (для чата — id мэтча).
    """
    token = settings.telegram_bot_token
    if not token:
        return
    tg = _tg_id(db, owner_id)
    if not tg:
        return
    _enqueue((token, tg, text, open_app, screen, ident))


def notify_admins(text: str) -> None:
    """Уведомить администраторов (ADMIN_TG_IDS) — напрямую по их tg_id."""
    token = settings.telegram_bot_token
    if not token:
        return
    for raw in settings.admin_tg_ids.split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            tg = int(raw)
        except ValueError:
            continue
        _enqueue((token, tg, text, None, "", ""))
