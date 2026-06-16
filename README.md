# StaffSwipe — Tinder для подработок в общепите 🇷🇺

Сервис, где соискатели (официант, бариста, повар, посудомой, хостес, бармен) и
работодатели (кафе, бар, ресторан, кофейня) свайпают карточки. При взаимном
лайке — **мэтч → чат → подтверждение смены** → смены и **PDF-акт** для самозанятого.

## Из чего состоит проект

| Компонент | Стек | Статус |
| --- | --- | --- |
| **`tma/`** — Telegram Mini App | React + TS + Vite + @telegram-apps/sdk-react | **Основной клиент** |
| **`backend/`** — API + бот | FastAPI + SQLAlchemy + aiogram | Основной backend |
| **`lib/`** — Flutter-приложение | Flutter + Riverpod + go_router | Вторичный (RuStore/сторы) |

Оба фронтенда используют один backend и одни доменные модели. Развитие идёт в
TMA; Flutter сохраняется как путь публикации в магазины приложений.

## 🚀 Telegram Mini App (основной продукт) — `tma/`

Помимо Flutter-приложения, проект включает **Telegram Mini App** на актуальном
стеке: **React + TypeScript + Vite + @telegram-apps/sdk-react**. Это основной
канал запуска: вход через Telegram (без SMS), нативные кнопки/хаптика, оплата
внутри Telegram. См. [`tma/README.md`](tma/README.md).

```bash
cd tma && npm install && npm run build   # tsc + vite build (зелёные)
npm run dev                              # локальный запуск
```

### Монетизация (гибридная модель)

| Источник | Что | Платёж |
| --- | --- | --- |
| Подписки работодателей | Free / Pro (1 990 ₽/мес) / Business (4 990 ₽/мес) | ЮKassa |
| Boost вакансии | поднятие в топ ленты на 24ч/3д | Telegram Stars |
| Супер-лайки «Срочно» | пакеты 5/20/50 | Telegram Stars |
| Premium соискателя | «кто меня лайкнул», приоритет | Telegram Stars |
| Верификация заведения | бейдж «Проверен» (DaData) | ЮKassa |

Правило: цифровые микро-фичи внутри Telegram — через **Stars** (требование
Telegram), B2B-подписки/верификация — через **ЮKassa** (рубли). Backend ведёт
права (`entitlements`), начисление — идемпотентно через `/billing/fulfill`.
Бот (`backend/bot/`, aiogram 3) открывает Mini App и обрабатывает оплату Stars.

### ⚠️ Прод-конфиг (обязательно перед публикацией)

Дефолты в `backend/app/config.py` безопасны для прода, но требуют значений env:

| Переменная | Зачем |
| --- | --- |
| `JWT_SECRET` | подпись токенов (сменить с дефолта) |
| `TELEGRAM_BOT_TOKEN` | валидация initData и инвойсы Stars |
| `ALLOW_INSECURE_TELEGRAM_AUTH=false` | **запретить** вход без подписи initData |
| `INTERNAL_API_SECRET` | защита `/billing/fulfill` (бот/вебхук); без него — 401 |
| `ALLOWED_ORIGINS` | CORS: URL Mini App вместо `*` |
| `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY` | приём рублёвых платежей |
| `DADATA_TOKEN` | верификация ИНН/ОГРН |

Безопасность (уже в коде): `/billing/fulfill` — только по `X-Internal-Token`;
PDF-акт и WebSocket-чат проверяют участие в мэтче; супер-лайки/boost списываются
с баланса; лимит вакансий на тарифе Free; рейт-лимит на запись; согласие 18+/152-ФЗ.

📦 Полная инструкция по запуску в прод — **[`docs/deploy.md`](docs/deploy.md)**
(хостинг РФ, BotFather, HTTPS, вебхук ЮKassa, Sentry, чеклист).

## Что реализовано

| Раздел | Файлы |
| --- | --- |
| Дизайн-система (тёмная тема, оранжево-красные акценты, Inter, радиус 16dp) | `lib/core/theme/` |
| Авторизация по телефону + SMS-код + VK ID/Telegram (заглушки) | `lib/features/auth/` |
| Выбор роли (соискатель / работодатель) | `lib/features/auth/role_screen.dart` |
| **Свайп-лента** (`flutter_card_swiper`): лайк/супер-лайк/пропуск, штампы, кнопки | `lib/features/feed/` |
| Анимация мэтча (салют + рукопожатие на `flutter_animate`) | `lib/features/feed/widgets/match_overlay.dart` |
| Мэтчи и **чат** с кнопкой «Подтвердить смену» | `lib/features/matches/`, `lib/features/chat/` |
| Создание вакансии за 2 минуты | `lib/features/vacancy/` |
| Профиль (роли, медкнижка, доступность, ИНН/самозанятость) | `lib/features/profile/` |
| **Мои смены + генерация PDF-акта** (`pdf` + `printing`) | `lib/features/shifts/` |
| Состояние на **Riverpod**, навигация на **go_router** | `lib/state/`, `lib/core/router/` |

## Структура проекта

```
lib/
├── main.dart                 # точка входа (ProviderScope, локаль ru)
├── app.dart                  # MaterialApp.router + темы
├── core/
│   ├── theme/                # AppColors, AppTheme (shadcn-inspired)
│   └── router/app_router.dart
├── data/
│   ├── models/               # Seeker, Employer, Vacancy, Match, Message, enums, geo
│   └── mock/mock_data.dart   # тестовые данные (структура из спеки, раздел 5)
├── state/                    # Riverpod-провайдеры (session, feed, matches, employer)
├── widgets/                  # переиспользуемые виджеты
└── features/
    ├── auth/  feed/  matches/  chat/  vacancy/  profile/  shifts/  shell/
```

## Запуск

Репозиторий хранит только `lib/` + `pubspec.yaml`. Платформенные папки
(`android/`, `ios/`, `web/`) сгенерируйте один раз командой `flutter create`:

```bash
flutter create . --project-name staffswipe --org ru.staffswipe   # создаст android/ios/web
flutter pub get
flutter run            # выберите устройство/эмулятор
flutter test           # юнит- и виджет-тесты
```

Демо-подсказки: на экране кода введите **любые 4 цифры**; после авторизации
выберите роль. Свайп вправо/вверх по вакансии → мэтч → чат → «Подтвердить
смену» → раздел «Смены» → «Сформировать акт (PDF)».

### С реальным backend

Поднимите сервер (`backend/`, см. `backend/README.md`) и запустите клиент с
флагами:

```bash
flutter run \
  --dart-define=USE_BACKEND=true \
  --dart-define=API_BASE_URL=http://10.0.2.2:8000
```

Слой интеграции: `lib/core/config/app_config.dart`, `lib/data/api/` (dio + JWT в
`flutter_secure_storage`). Без флагов приложение работает на mock-данных.

## Переход на production-стек (по спецификации)

Ключевые пакеты уже в `pubspec.yaml`. Интеграции, требующие ключей/платформенной
настройки, перечислены там же закомментированными — включайте по мере подключения:

- **Backend**: FastAPI + PostgreSQL (PostGIS для гео) + Redis (WebSocket-чат),
  хостинг в РФ (Яндекс.Облако / VK Cloud / Selectel / Timeweb).
- **Авторизация**: свои JWT + SMS через МТС Exolve / SMSC.ru, вход через
  `vkid_flutter`.
- **Хранилище фото**: Yandex Object Storage (S3) через `minio`.
- **Карты/гео**: `yandex_mapkit` + `geolocator` (сейчас — формула гаверсинуса в
  `data/models/geo.dart`).
- **Проверка ИНН/ОГРН и адресов**: DaData API.
- **UI-кит**: проект использует собственную shadcn-вдохновлённую тему; для замены
  на пакет `shadcn_ui` достаточно обернуть `MaterialApp` в `ShadApp`.
- **Платежи** (монетизация): ЮKassa / CloudPayments.
- **Push**: FCM / RuStore SDK.
- **Публикация**: RuStore (обязательно), App Store, Google Play.

## Модель данных

Соответствует разделу 5 спецификации: `users`, `employers`, `vacancies`,
`swipes`, `matches`, `chats`, `messages`, `sessions`. См. `lib/data/models/`.
