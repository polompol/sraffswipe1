# StaffSwipe — Telegram Mini App

Фронтенд Mini App на актуальном стеке: **React + TypeScript + Vite +
@tma.js/sdk-react**. Серверное состояние — TanStack Query, клиентское —
Zustand, свайп — `@use-gesture/react` + `@react-spring/web`.

## Запуск

```bash
npm ci
cp .env.example .env      # настройте VITE_API_BASE_URL / VITE_USE_BACKEND
npm run dev               # vite dev-сервер
npm run build             # tsc + production-сборка в dist/
```

Без `VITE_USE_BACKEND=true` приложение работает на встроенных демо-данных и
открывается в обычном браузере без сервера. Выбор роли помечен как демо;
смены и профили вымышлены. С настоящим сервером вход требует Telegram.

## Подключение к Telegram

1. Создайте бота в **@BotFather**, получите токен.
2. Задеплойте `dist/` на HTTPS-хостинг.
3. В BotFather → *Bot Settings → Menu Button / Web App* укажите URL Mini App.
4. Backend валидирует `initData` (HMAC по токену бота) — `POST /auth/telegram`.

## Структура

| Путь в `src/` | Назначение |
| --- | --- |
| `telegram/sdk.ts` | Обёртка над Telegram SDK: запуск, отклик на касание, навигация |
| `api/` | Fetch + JWT, единый повторный вход, API и демо-данные |
| `store/session.ts` | Сессия Zustand; очистка личных данных при выходе и смене аккаунта |
| `lib/queryClient.ts` | Общий кэш TanStack Query |
| `types/domain.ts` | Доменные типы, согласованные с сервером |
| `lib/format.ts` | Календарные даты, время, ставки и суммы |
| `features/` | Регистрация, лента, смены, чат, профиль, админка и поддержка |

## Монетизация

Одна цифра и один платёж:

- **Комиссия 10%** с закрытой смены — списывается с баланса заведения;
- **пополнение баланса** картой через ЮKassa (`/billing/wallet/topup`).

Отдельного экрана с тарифами нет намеренно: платит только заведение и только
за состоявшуюся смену, поэтому всё живёт в карточке комиссии в профиле.
