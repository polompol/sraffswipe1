# StaffSwipe — Telegram Mini App

Фронтенд Mini App на актуальном стеке: **React + TypeScript + Vite +
@telegram-apps/sdk-react**. Серверное состояние — TanStack Query, клиентское —
Zustand, свайп — `@use-gesture/react` + `@react-spring/web`.

## Запуск

```bash
npm install
cp .env.example .env      # настройте VITE_API_BASE_URL / VITE_USE_BACKEND
npm run dev               # vite dev-сервер
npm run build             # tsc + production-сборка в dist/
```

Без `VITE_USE_BACKEND=true` приложение работает на встроенных mock-данных —
открывается в Telegram без сервера.

## Подключение к Telegram

1. Создайте бота в **@BotFather**, получите токен.
2. Задеплойте `dist/` на HTTPS-хостинг.
3. В BotFather → *Bot Settings → Menu Button / Web App* укажите URL Mini App.
4. Backend валидирует `initData` (HMAC по токену бота) — `POST /auth/telegram`.

## Структура

```
src/
├── telegram/sdk.ts        # обёртка над @telegram-apps/sdk-react (init, haptics, back-button, Stars, share)
├── api/                   # axios + JWT, endpoints, mock-данные
├── store/session.ts       # zustand-сессия (jwt, роль)
├── types/domain.ts        # доменные типы (зеркало backend)
├── lib/format.ts          # форматирование дат/ставок
└── features/              # onboarding, auth(role), feed(свайп), matches, chat,
                           # profile, vacancy, shifts, billing(тарифы/Stars/ЮKassa)
```

## Монетизация

- **Подписки работодателей** (Free / Pro / Business) — ЮKassa, рубли.
- **Boost вакансии** и **супер-лайки «Срочно»** — Telegram Stars (XTR).
- **Верификация заведения** (DaData) — ЮKassa.
- **Premium соискателя** — Telegram Stars.

Экран — `src/features/billing/PricingPage.tsx`. Ссылки на оплату приходят с
backend (`/billing/stars/invoice`, `/billing/yookassa/payment`).
