"""Телеграм-бот StaffSwipe (aiogram 3).

Запускается отдельным процессом от API.
- /start — кнопка запуска Mini App.
- Уведомления (мэтч, сообщение, смена) шлёт API напрямую (app/notify.py).

Зависимости: см. bot/requirements.txt. Не импортируется приложением API.
"""
import asyncio
import os

from aiogram import Bot, Dispatcher
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
MINI_APP_URL = os.environ.get("MINI_APP_URL", "https://example.com")
# «Печатающий» эффект: индикатор «печатает…» + плавное раскрытие текста.
# ВЫКЛЮЧЕН по умолчанию: ради анимации бот правит одно сообщение десять раз
# подряд. Человек ждёт несколько секунд, чтобы прочитать /start, а при росте
# числа пользователей это ещё и лишний риск упереться в ограничение частоты
# запросов у Telegram. Включается BOT_TYPEWRITER=1.
TYPEWRITER = os.environ.get("BOT_TYPEWRITER", "0") == "1"

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


def _open_app_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🔥 Открыть StaffSwipe",
                    web_app=WebAppInfo(url=MINI_APP_URL),
                )
            ]
        ]
    )


@dp.message(CommandStart())
async def start(message: Message) -> None:
    await send_typed(
        message,
        "StaffSwipe — смены в общепите за один свайп.\n"
        "Нажмите кнопку ниже, чтобы начать.",
        reply_markup=_open_app_kb(),
    )


@dp.message(Command("help"))
async def help_cmd(message: Message) -> None:
    await send_typed(
        message,
        "Как это работает:\n"
        "1. Откройте приложение кнопкой в /start.\n"
        "2. Листайте смены: вправо — «хочу», влево — мимо.\n"
        "3. Ответили взаимно — открывается чат, там и договариваетесь.\n"
        "4. На смене попросите у администратора код прихода и впишите его\n"
        "   в приложении: с ним вам не запишут неявку.\n"
        "5. Платит заведение напрямую. Способ и срок — в карточке смены.\n\n"
        "Сюда будем присылать ответы заведений и напоминания о сменах.\n"
        "Что-то пошло не так — /support.",
    )


@dp.message(Command("support"))
async def support_cmd(message: Message) -> None:
    await send_typed(
        message,
        "Поддержка StaffSwipe.\n"
        # Раньше здесь было обещание, что оператор «увидит твой аккаунт и
        # историю смены»: тикетов с привязкой к смене в сервисе нет, оператор
        # читает обычное сообщение. Просим сразу то, что ему понадобится.
        "Опишите, что случилось, одним сообщением: название заведения и "
        "день смены.\n"
        "Потеряли доступ к старому Telegram? Напишите с нового — оператор "
        "перенесёт аккаунт вместе с рейтингом и историей.",
    )


# Любое другое сообщение. Люди пишут боту — «здравствуйте», «есть работа?»,
# «когда смена» — и до сих пор получали тишину: обработчиков не было вовсе.
# Молчащий бот читается как «сервис не работает».
#
# Без фильтра по типу: раньше стоял F.text, и на голосовое, стикер, фото или
# пересланное сообщение бот по-прежнему молчал — а именно ими чаще всего и
# отвечают («ок 👍», голосовое «когда смена?»).
@dp.message()
async def anything_else(message: Message) -> None:
    await message.answer(
        "Здесь я только присылаю новости: ответы заведений, подтверждения "
        "смен и напоминания. Сами смены — в приложении, откройте его кнопкой "
        "ниже.\n"
        "Как всё устроено — /help, что-то пошло не так — /support.",
        reply_markup=_open_app_kb(),
    )


async def setup(bot: Bot) -> None:
    """Разовая настройка бота при запуске.

    Обе вещи раньше приходилось делать руками в BotFather (и легко забыть):
    список команд в меню и постоянная кнопка «Открыть» слева от поля ввода.
    Кнопка важнее команд: это единственный способ вернуться в приложение,
    если человек закрыл его и пролистал переписку.
    """
    try:
        await bot.set_my_commands([
            BotCommand(command="start", description="Открыть приложение"),
            BotCommand(command="help", description="Как это работает"),
            BotCommand(command="support", description="Помощь и поддержка"),
        ])
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="Смены",
                web_app=WebAppInfo(url=MINI_APP_URL),
            )
        )
    except Exception as exc:  # noqa: BLE001 — настройка не должна ронять бота
        print(f"Не удалось настроить меню бота: {exc}")


async def main() -> None:
    if not BOT_TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN не задан")
    bot = Bot(BOT_TOKEN)
    await setup(bot)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
