# Прод-образ backend StaffSwipe.
FROM python:3.12-slim

# WEB_CONCURRENCY=1: in-memory WS-чат и рейт-лимит живут в процессе, поэтому до
# подключения Redis держим один воркер (иначе сообщения чата не доходят между
# воркерами). Async-воркер тянет сотни одновременных пользователей пилота.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    WEB_CONCURRENCY=1

WORKDIR /app

# Зависимости отдельным слоем для кэша.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Непривилегированный пользователь.
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# healthcheck бьёт в /health.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

# Несколько воркеров uvicorn (число — через WEB_CONCURRENCY).
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY}"]
