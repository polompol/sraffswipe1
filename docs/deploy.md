# Деплой StaffSwipe (РФ)

Три компонента: **backend** (FastAPI), **bot** (aiogram), **tma** (статика React).
Рекомендуемый хостинг — РФ: Yandex Cloud / VK Cloud / Selectel / Timeweb.

## 0. Что подготовить
- Домен + HTTPS (Telegram Mini App требует https). Например, `api.example.ru`,
  `app.example.ru`.
- Бот в **@BotFather** → токен. В *Bot Settings → Configure Mini App* указать
  URL `https://app.example.ru`.
- Ключи: `TELEGRAM_BOT_TOKEN`, `YOOKASSA_SHOP_ID`/`YOOKASSA_SECRET_KEY`,
  `DADATA_TOKEN`, случайные `JWT_SECRET` и `INTERNAL_API_SECRET`.

## 1. Backend + bot (docker-compose)
```bash
cd backend
cp .env.example .env   # заполнить значения; ALLOW_INSECURE_TELEGRAM_AUTH=false
docker compose up -d db redis api bot
```
- В проде смените SQLite на PostgreSQL/PostGIS (`DATABASE_URL=postgresql+psycopg://...`).
- `ALLOWED_ORIGINS=https://app.example.ru`.
- За API поставьте reverse-proxy (nginx/Caddy) с TLS на `https://api.example.ru`.

## 2. TMA (статика)
```bash
cd tma
echo "VITE_API_BASE_URL=https://api.example.ru" > .env
echo "VITE_USE_BACKEND=true" >> .env
npm ci && npm run build      # dist/ → раздать через nginx/CDN/Pages
```
Либо образом: `docker build -t staffswipe-tma ./tma` (nginx со статикой).

## 3. Платежи
- **ЮKassa**: в ЛК укажите вебхук `https://api.example.ru/billing/yookassa/webhook?secret=<INTERNAL_API_SECRET>`
  на событие `payment.succeeded`. Бэкенд создаёт платёж с `metadata={owner_id,sku}`
  и начисляет права по вебхуку.
- **Telegram Stars**: инвойсы создаёт бэкенд (`createInvoiceLink`), бот ловит
  `successful_payment` и зовёт `/billing/fulfill` с `X-Internal-Token`.

## 4. Наблюдаемость
- Логи: structured-логи с `X-Request-ID` (см. `app/main.py`).
- Ошибки: задайте `SENTRY_DSN` (backend) и `VITE_SENTRY_DSN` (TMA), установите
  `sentry-sdk` / `@sentry/react`.
- Healthcheck: `GET /health` (используется в Dockerfile/compose).

## 5. Чеклист перед запуском
- [ ] `ALLOW_INSECURE_TELEGRAM_AUTH=false`, секреты не дефолтные
- [ ] `ALLOWED_ORIGINS` = домен Mini App
- [ ] PostgreSQL вместо SQLite; бэкапы
- [ ] HTTPS на api и app; вебхук ЮKassa добавлен
- [ ] BotFather: Mini App URL установлен
- [ ] Юр-документы (`docs/legal/`) опубликованы и ссылки в согласии актуальны
