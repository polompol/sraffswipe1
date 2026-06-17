"""Точка входа FastAPI-приложения StaffSwipe."""
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routers import (
    acts,
    analytics,
    auth,
    billing,
    candidates,
    chat,
    dadata,
    employer,
    matches,
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

# Наблюдаемость: Sentry подключается только если задан DSN и установлен SDK.
if settings.sentry_dsn:
    try:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.1)
        logger.info("Sentry инициализирован")
    except Exception:  # noqa: BLE001
        logger.warning("sentry_sdk не установлен — пропускаю Sentry")


@asynccontextmanager
async def lifespan(app: FastAPI):
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


@app.middleware("http")
async def request_logger(request: Request, call_next):
    """Структурные логи + сквозной X-Request-ID (заготовка под прод-логи)."""
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = rid
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
app.include_router(dadata.router)
app.include_router(employer.router)
app.include_router(uploads.router)
app.include_router(analytics.router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
