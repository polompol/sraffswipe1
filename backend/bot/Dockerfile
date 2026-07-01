# Прод-образ Telegram-бота StaffSwipe (aiogram 3).
# Отдельный процесс от API: /start с кнопкой Mini App, платежи Stars,
# уведомления (мэтч/сообщение/оплата). Никаких импортов из app — автономен.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /bot

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN adduser --disabled-password --gecos "" botuser && chown -R botuser /bot
USER botuser

CMD ["python", "main.py"]
