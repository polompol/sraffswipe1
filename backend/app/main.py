"""Точка входа FastAPI-приложения StaffSwipe."""
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import init_db
from .routers import (
    acts,
    admin,
    analytics,
    auth,
    billing,
    candidates,
    chat,
    dadata,
    employer,
    favorites,
    matches,
    meta,
    reports,
    saved_searches,
    social,
    swipes,
    telegram_auth,
    uploads,
    vacancies,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("staffswipe")

# Наблюдаемость: Sentry подключается только если задан DSN (SDK в requirements).
# Ошибки логируем РАЗДЕЛЬНО: «нет пакета» и «плохой DSN» — это разные проблемы,
# и владельцу проекта важно видеть настоящую причину, а не общую заглушку.
if settings.sentry_dsn:
    try:
        import sentry_sdk
    except ImportError:
        logger.warning("sentry_sdk не установлен — пропускаю Sentry")
    else:
        try:
            sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.1)
            logger.info("Sentry инициализирован")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Sentry не запустился (проверьте SENTRY_DSN): %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail-fast: в прод-режиме не стартуем с дефолтными секретами.
    settings.assert_production_safe()
    # Не ошибка, но и не мелочь: без списка админов в сервисе нет оператора —
    # споры по сменам разбирать некому, админ-панель не откроется ни у кого.
    # Ронять из-за этого сервер не за что, а в логе видно должно быть сразу.
    if not settings.dev_mode and not settings.admin_tg_ids.strip():
        logger.warning(
            "ADMIN_TG_IDS пуст — админ-панель недоступна никому, "
            "споры по сменам разбирать будет некому"
        )
    init_db()
    yield


app = FastAPI(
    title="StaffSwipe API",
    version="0.1.0",
    description="Backend для StaffSwipe — Tinder для подработок в общепите.",
    lifespan=lifespan,
)

def _cors_origins() -> list[str]:
    explicit = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
    if explicit:
        return explicit
    if settings.dev_mode:
        return ["*"]
    return [u for u in [settings.mini_app_url] if u]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


# Заголовки, которые должны быть на КАЖДОМ ответе, включая аварийный 500.
def _base_headers(request: Request, rid: str) -> dict[str, str]:
    headers = {
        "X-Request-ID": rid,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    }
    # CORS на 500 тоже нужен: обработчик ошибок стоит ВЫШЕ middleware, и без
    # этого приложение вместо понятного «Внутренняя ошибка сервера» получало
    # глухую ошибку доступа — человеку показывалось «нет связи», а в поддержку
    # нести было нечего.
    origin = request.headers.get("origin")
    if origin and origin in _cors_origins():
        headers["Access-Control-Allow-Origin"] = origin
        headers["Vary"] = "Origin"
    elif "*" in _cors_origins():
        headers["Access-Control-Allow-Origin"] = "*"
    return headers


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    """Любая необработанная ошибка → чистый 500 без утечки трейсбека наружу.
    Полная ошибка пишется в лог (и в Sentry, если подключён)."""
    # Свой номер запроса, а не «-»: обработчик ошибок вызывается ДО middleware,
    # где номер генерировался, и в теле ответа всегда стояло «-» — спросить у
    # человека было нечего.
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    logger.exception("Необработанная ошибка rid=%s %s %s", rid, request.method,
                     request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Внутренняя ошибка сервера", "request_id": rid},
        headers=_base_headers(request, rid),
    )


@app.middleware("http")
async def request_logger(request: Request, call_next):
    """Структурные логи + сквозной X-Request-ID (заготовка под прод-логи)."""
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = rid
    # Базовые security-заголовки (defense-in-depth).
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
    )
    logger.info(
        "%s %s -> %s %.1fms rid=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        rid,
    )
    return response

app.include_router(auth.router)
app.include_router(telegram_auth.router)
app.include_router(vacancies.router)
app.include_router(candidates.router)
app.include_router(swipes.router)
app.include_router(matches.router)
app.include_router(chat.router)
app.include_router(acts.router)
app.include_router(billing.router)
app.include_router(social.router)
app.include_router(saved_searches.router)
app.include_router(reports.router)
app.include_router(dadata.router)
app.include_router(employer.router)
app.include_router(uploads.router)
app.include_router(analytics.router)
app.include_router(admin.router)
app.include_router(favorites.router)
app.include_router(meta.router)


# HEAD, а не только GET: внешние «сторожа» (UptimeRobot и подобные) по
# умолчанию шлют HEAD, а FastAPI, в отличие от Starlette, сам его не добавляет.
# Сервис отвечал таким проверкам 405 — сторож считал сайт упавшим и слал
# ложную тревогу, а на настоящее падение владелец уже не реагировал.
@app.api_route("/health", methods=["GET", "HEAD"], tags=["meta"])
def health():
    return {"status": "ok"}


@app.api_route("/health/ready", methods=["GET", "HEAD"], tags=["meta"])
def ready():
    """Готовность к работе: приложение живо И база отвечает.

    `/health` говорит только «процесс запущен». Если база умерла, он всё равно
    отвечает «ok» — docker считает контейнер здоровым, сторож молчит, а люди
    видят ошибки на каждом экране. Здесь делается самый дешёвый запрос к базе:
    отвечает — значит сервис действительно работает.
    """
    from sqlalchemy import text

    from .db import SessionLocal

    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 — причина в логе, наружу только статус
        logger.exception("проверка готовности: база не отвечает")
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "detail": "База не отвечает"},
        )
    finally:
        db.close()
    return {"status": "ok", "db": "ok"}
