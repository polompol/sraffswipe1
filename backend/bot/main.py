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

dp = Dispatcher()


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
    await message.answer(
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
            json={
                "owner_id": owner_id,
                "sku": sku,
                "provider": "stars",
                "charge_id": sp.telegram_payment_charge_id,
            },
        )
    await message.answer("Оплата прошла ✅ Права начислены. Возвращайтесь в приложение.")


async def notify(bot: Bot, tg_id: int, text: str) -> None:
    """Отправка уведомления пользователю (мэтч/сообщение/смена)."""
    try:
        await bot.send_message(tg_id, text)
    except Exception:  # noqa: BLE001
        pass


async def main() -> None:
    if not BOT_TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN не задан")
    bot = Bot(BOT_TOKEN)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
