# StaffSwipe Backend (FastAPI)

Бэкенд по варианту 2 спецификации: **FastAPI + SQLAlchemy + JWT**, с гео-поиском
вакансий, свайпами/мэтчами, чатом (REST + WebSocket) и генерацией PDF-акта.

Работает «из коробки» на SQLite (без внешних зависимостей). Для прода —
PostgreSQL/PostGIS (см. `docker-compose.yml`).

## Запуск (локально, SQLite)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed          # демо-данные (опционально)
uvicorn app.main:app --reload
```

Swagger UI: http://localhost:8000/docs

## Запуск в Docker (PostGIS + Redis)

```bash
cd backend
docker compose up --build
```

## Тесты и линт

```bash
pip install ruff pytest
ruff check .
pytest -q
```

## Эндпоинты

| Метод | Путь | Назначение |
| --- | --- | --- |
| POST | `/auth/request-code` | Запрос SMS-кода (в dev возвращает `dev_code`) |
| POST | `/auth/verify` | Проверка кода → JWT |
| GET | `/vacancies?lat&lng&radius_km` | Лента вакансий с гео-фильтром |
| POST | `/vacancies` | Создание вакансии (работодатель) |
| POST | `/swipes` | Свайп + детект мэтча |
| GET | `/matches` | Мэтчи текущего пользователя |
| POST | `/matches/{id}/confirm` | Подтверждение смены |
| GET/POST | `/matches/{id}/messages` | История/отправка сообщений |
| WS | `/ws/chat/{match_id}` | Real-time чат |
| GET | `/matches/{id}/act.pdf` | PDF-акт для самозанятого |
| GET | `/health` | Проверка живости |

## Авторизация

JWT в заголовке: `Authorization: Bearer <token>`. Роль (`seeker`/`employer`)
зашита в токене и выбирается на этапе `/auth/verify` (поле `role`).

## Интеграции (точки расширения)

- **SMS** — `app/sms.py` (МТС Exolve / SMS.RU / SMSC.ru), включается `SMS_PROVIDER`.
- **DaData** — проверка ИНН/ОГРН, токены в `.env`.
- **Гео** — сейчас гаверсинус в Python (`app/geo.py`); на масштабе заменить на
  PostGIS `ST_DWithin` + GiST-индексы.
- **Чат** — in-memory брокер; для нескольких инстансов вынести в Redis pub/sub.

## Подключение клиента (Telegram Mini App)

В `tma/.env` укажите адрес backend и включите реальный режим:

```bash
VITE_API_BASE_URL=http://localhost:8000
VITE_USE_BACKEND=true
```

Без `VITE_USE_BACKEND=true` Mini App работает на mock-данных (демо без сервера).
