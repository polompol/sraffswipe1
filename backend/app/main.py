"""Точка входа FastAPI-приложения StaffSwipe."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routers import (
    acts,
    auth,
    billing,
    candidates,
    chat,
    matches,
    swipes,
    telegram_auth,
    vacancies,
)


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

app.include_router(auth.router)
app.include_router(telegram_auth.router)
app.include_router(vacancies.router)
app.include_router(candidates.router)
app.include_router(swipes.router)
app.include_router(matches.router)
app.include_router(chat.router)
app.include_router(acts.router)
app.include_router(billing.router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
