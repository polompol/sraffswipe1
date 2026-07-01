"""Телеграм-бот StaffSwipe (aiogram 3).

Запускается отдельным процессом от API.
- /start — кнопка запуска Mini App.
- Платежи Telegram Stars: pre_checkout → successful_payment → начисление прав
  через backend `/billing/fulfill`.
- Уведомления (мэтч, сообщение, оплата) отправляются функцией notify().

Зависимости: см. bot/requirements.txt. Не импортируется приложением API.
"""
import asyncio
import os

import httpx
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    PreCheckoutQuery,
    WebAppInfo,
)

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
MINI_APP_URL = os.environ.get("MINI_APP_URL", "https://example.com")
API_BASE = os.environ.get("API_BASE_URL", "http://localhost:8000")
INTERNAL_SECRET = os.environ.get("INTERNAL_API_SECRET", "")
# «Печатающий» эффект: индикатор «печатает…» + плавное раскрытие текста.
# Выключается BOT_TYPEWRITER=0 (тогда сообщения приходят сразу).
TYPEWRITER = os.environ.get("BOT_TYPEWRITER", "1") != "0"

dp = Dispatcher()


async def send_typed(message, text, reply_markup=None, steps=10, delay=0.4):
    """Отправляет текст «набирая» его.

    Настоящая печать по одной букве в Telegram невозможна: правка на каждый
    символ упирается во флуд-контроль (429). Поэтому: показываем родной
    индикатор «печатает…», затем раскрываем текст за ФИКСИРОВАННОЕ число шагов
    (длина сообщения не влияет на частоту правок — защита от флуда). Ошибки
    правок молча гасим, чтобы бот не падал из-за анимации.
    """
    try:
        await message.bot.send_chat_action(message.chat.id, "typing")
    except Exception:  # noqa: BLE001 — анимация не должна ронять доставку
        pass

    if not TYPEWRITER or len(text) <= 12:
        await asyncio.sleep(min(len(text) * 0.02, 1.0))
        return await message.answer(text, reply_markup=reply_markup)

    chunk = max(1, len(text) // steps)
    sent = await message.answer(text[:chunk] + " ▍")
    i = chunk
    while i < len(text):
        i = min(len(text), i + chunk)
        await asyncio.sleep(delay)
        caret = " ▍" if i < len(text) else ""
        try:
            await sent.edit_text(text[:i] + caret)
        except Exception:  # noqa: BLE001 — флуд/идентичный текст: прекращаем
            break
    # Финальный кадр: полный текст + кнопка (появляется, когда «допечатали»).
    if reply_markup is not None:
        try:
            await sent.edit_text(text, reply_markup=reply_markup)
        except Exception:  # noqa: BLE001
            await message.answer(text, reply_markup=reply_markup)
    return sent


@dp.message(CommandStart())
async def start(message: Message) -> None:
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🔥 Открыть StaffSwipe",
                    web_app=WebAppInfo(url=MINI_APP_URL),
                )
            ]
        ]
    )
    await send_typed(
        message,
        "StaffSwipe — смены в общепите за один свайп.\n"
        "Нажмите кнопку ниже, чтобы начать.",
        reply_markup=kb,
    )


@dp.pre_checkout_query()
async def pre_checkout(query: PreCheckoutQuery) -> None:
    # Подтверждаем все корректные инвойсы Stars.
    await query.answer(ok=True)


@dp.message(F.successful_payment)
async def on_paid(message: Message) -> None:
    sp = message.successful_payment
    if sp is None:
        return
    owner_id, _, sku = sp.invoice_payload.partition(":")
    async with httpx.AsyncClient(base_url=API_BASE, timeout=10) as client:
        await client.post(
            "/billing/fulfill",
            headers={"X-Internal-Token": INTERNAL_SECRET},
            json={
                "owner_id": owner_id,
                "sku": sku,
                "provider": "stars",
                "charge_id": sp.telegram_payment_charge_id,
            },
        )
    await send_typed(
        message,
        "Оплата прошла ✅ Права начислены. Возвращайтесь в приложение.",
    )


async def main() -> None:
    if not BOT_TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN не задан")
    bot = Bot(BOT_TOKEN)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
