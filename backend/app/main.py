"""Точка входа FastAPI-приложения StaffSwipe."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .routers import acts, auth, chat, matches, swipes, vacancies


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(vacancies.router)
app.include_router(swipes.router)
app.include_router(matches.router)
app.include_router(chat.router)
app.include_router(acts.router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
