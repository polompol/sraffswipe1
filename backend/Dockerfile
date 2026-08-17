# Прод-образ backend StaffSwipe.
FROM python:3.12-slim

# WEB_CONCURRENCY=1 по умолчанию. Поднимать воркеры МОЖНО только когда задан
# REDIS_URL: счётчики частоты и раздача чата тогда общие для процессов. Без
# Redis второй воркер удвоил бы лимиты, а собеседники на разных воркерах не
# видели бы сообщений друг друга. Async-воркер и один тянет сотни человек.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    WEB_CONCURRENCY=1

WORKDIR /app

# Зависимости отдельным слоем для кэша.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./alembic.ini

# Непривилегированный пользователь.
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# Проверка живости бьёт в /health/ready — он спрашивает ещё и базу. Прежний
# /health отвечал «ок» и с мёртвой базой: контейнер считался здоровым, сторож
# молчал, а люди видели ошибку на каждом экране.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=90s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/ready').status==200 else 1)"

# Прогоняем миграции БД, затем стартуем uvicorn (число воркеров — WEB_CONCURRENCY).
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY}"]
