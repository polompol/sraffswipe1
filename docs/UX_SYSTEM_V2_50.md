# StaffSwipe UX System V2 — 50 экранов

Цель: единая карта продукта для владельца, дизайна, frontend/backend и coding-agent (включая Astra). Любая реализация должна сверяться с работающим кодом, `CLAUDE.md`, `DESIGN_SYSTEM.md` и реальными API.

## Правила

- роли: `worker/seeker`, `employer`, `shared`;
- у worker нижняя навигация: `Лента → Мои смены → Профиль`;
- у employer: `Лента → Люди → Смены → Профиль`;
- главный цикл: onboarding → feed/swipe → mutual interest → chat → confirm → protected shift → check-in → in progress → actual hours → completion → settlement → review;
- комиссия сейчас 10% только после закрытой смены;
- код прихода — доказательство факта выхода, а не триггер списания;
- не придумывать поля API, рейтинги, документы, response-time, Pro/boosts как реализованные факты;
- sensitive data не показывать в публичной ленте;
- все money/status решения опираются на backend state, а не на визуальный таймер клиента.

## Карта экранов

| # | Экран | Роль | Route | Component | Состояние / данные |
|---:|---|---|---|---|---|
| 01 | Кого вы ищете? | `shared` | `/onboarding` | `Onboarding` | `entry` / local/session |
| 02 | Вход через Telegram | `shared` | `/onboarding` | `Onboarding` | `auth` / Telegram initData |
| 03 | Профиль сотрудника | `worker` | `/onboarding` | `Onboarding` | `onboarding-1` / profile draft |
| 04 | Навыки и документы | `worker` | `/onboarding` | `Onboarding` | `onboarding-2` / profile/documents |
| 05 | Профиль заведения | `employer` | `/onboarding` | `Onboarding` | `onboarding-1` / venue draft |
| 06 | Проверка заведения | `employer` | `/onboarding` | `Onboarding` | `onboarding-2` / venue verification |
| 07 | Разрешения | `shared` | `/onboarding` | `Onboarding` | `permissions` / Telegram/geolocation |
| 08 | Как работает StaffSwipe | `shared` | `/welcome` | `WelcomePage` | `first-run` / session role |
| 09 | Смены рядом | `worker` | `/feed` | `FeedPage` | `ready` / feed shifts |
| 10 | Быстрый просмотр смены | `worker` | `/feed` | `FeedPage` | `peek` / shift card |
| 11 | Детали смены | `worker` | `/feed` | `FeedPage` | `detail` / shift detail |
| 12 | Фильтры смен | `worker` | `/feed` | `FeedPage` | `filter` / filters |
| 13 | Сохранённый поиск | `worker` | `/feed` | `FeedPage` | `saved-search` / saved filters |
| 14 | Избранные смены | `worker` | `/favorites` | `FavoritesPage` | `list` / favorites |
| 15 | Взаимный интерес | `worker` | `/matches` | `MatchesPage` | `matched` / match |
| 16 | Рабочий чат | `worker` | `/chat/:matchId` | `ChatPage` | `chat` / match/messages |
| 17 | Подтверждение условий | `worker` | `/matches` | `MatchesPage` | `confirm` / match/terms |
| 18 | Мои смены | `worker` | `/matches` | `MatchesPage` | `list` / shift lifecycle |
| 19 | Смена скоро начнётся | `worker` | `/matches` | `MatchesPage` | `upcoming` / shift/checkin |
| 20 | Профиль и репутация | `worker` | `/profile` | `ProfilePage` | `profile` / profile/reviews |
| 21 | Кандидаты рядом | `employer` | `/feed` | `FeedPage` | `ready` / feed workers |
| 22 | Профиль кандидата | `employer` | `/workers` | `WorkersPage` | `detail` / worker profile |
| 23 | Фильтры кандидатов | `employer` | `/feed` | `FeedPage` | `filter` / worker filters |
| 24 | Создать смену: основное | `employer` | `/vacancy/new` | `CreateVacancyPage` | `step-1` / vacancy draft |
| 25 | Создать смену: условия | `employer` | `/vacancy/new` | `CreateVacancyPage` | `step-2` / vacancy draft |
| 26 | Предпросмотр смены | `employer` | `/vacancy/new` | `CreateVacancyPage` | `preview` / vacancy draft |
| 27 | Смена опубликована | `employer` | `/vacancy/my` | `MyVacanciesPage` | `published` / vacancy |
| 28 | Мои смены заведения | `employer` | `/vacancy/my` | `MyVacanciesPage` | `list` / vacancies |
| 29 | Управление сменой | `employer` | `/vacancy/my` | `MyVacanciesPage` | `manage` / vacancy/applicants |
| 30 | Отклики | `employer` | `/applicants` | `ApplicantsPage` | `list` / applicants |
| 31 | Карточка отклика | `employer` | `/applicants` | `ApplicantsPage` | `detail` / applicant |
| 32 | Приглашения | `employer` | `/invites` | `InvitesPage` | `list` / invites |
| 33 | Люди / договорённости | `employer` | `/matches` | `MatchesPage` | `list` / matches |
| 34 | Профиль заведения | `employer` | `/profile` | `ProfilePage` | `profile` / venue/reviews |
| 35 | Защищённая смена | `shared` | `/matches` | `MatchesPage` | `confirmed` / shift/protection |
| 36 | До начала смены | `shared` | `/matches` | `MatchesPage` | `countdown` / shift/checkin |
| 37 | Выход подтверждён | `shared` | `/matches` | `MatchesPage` | `checked-in` / shift/checkin |
| 38 | Смена идёт | `shared` | `/matches` | `MatchesPage` | `in-progress` / shift status |
| 39 | Фактические часы | `shared` | `/matches` | `MatchesPage` | `adjust-hours` / shift actual hours |
| 40 | Подтвердить завершение | `shared` | `/matches` | `MatchesPage` | `finish-confirm` / shift completion |
| 41 | Смена завершена | `shared` | `/matches` | `MatchesPage` | `completed` / settlement |
| 42 | Оценка и отзыв | `shared` | `/matches` | `MatchesPage` | `review` / review |
| 43 | Баланс заведения | `employer` | `/profile` | `ProfilePage` | `money` / balance |
| 44 | Пополнение баланса | `employer` | `/profile` | `ProfilePage` | `topup` / payment provider |
| 45 | История операций | `employer` | `/profile` | `ProfilePage` | `history` / transactions/docs |
| 46 | Сообщить о проблеме | `shared` | `/support` | `SupportPage` | `report` / support/dispute |
| 47 | Неявка / no-show | `shared` | `/support` | `SupportPage` | `no-show` / no-show |
| 48 | Центр поддержки | `shared` | `/support` | `SupportPage` | `support` / support |
| 49 | Настройки и приватность | `shared` | `/settings` | `SettingsPage` | `settings` / settings |
| 50 | Нет данных / ошибка сети | `shared` | `*` | `States` | `system` / loading/empty/error |

## Группы

- **01–08 Shared onboarding** — вход, Telegram auth, role split, worker/employer onboarding, permissions, first-run education.
- **09–20 Worker** — swipe смен, details, filters, favorites, match, chat, terms, мои смены, upcoming/check-in, профиль.
- **21–34 Employer** — swipe кандидатов, профиль работника, filters, vacancy creation, preview/publish, vacancies, applicants, invites, people, venue profile.
- **35–42 Shift lifecycle** — protected shift, countdown, check-in, in progress, actual hours, finish, settlement, review.
- **43–50 Money / Safety / System** — balance, top-up, transactions/docs, dispute, no-show, support, settings, loading/empty/error.

## Компонентные инварианты

1. `ShiftCard` и `WorkerCard` — центральные объекты feed; swipe механика должна оставаться в существующем `SwipeDeck`, не дублироваться.
2. Один filled primary CTA на экран; остальные secondary/ghost.
3. Touch target минимум 44 px, Telegram safe-area и haptic учитываются.
4. `loading`, `empty`, `error`, `offline`, `end-of-feed` — отдельные состояния, а не случайные тексты внутри feature-компонентов.
5. Любой экран оплаты/баланса отображает значения, полученные с сервера; клиент не является источником истины для settlement.
6. Match/shift UI не использует романтический язык; рабочие термины: «Откликнуться», «Пригласить», «Взаимный интерес», «Подтвердить условия».

## Как Astra должна использовать карту

Перед изменением экрана: найти ID ниже → открыть указанный route/component → проверить `tma/src/api/endpoints.ts` и типы → проверить backend endpoint/model → только потом менять JSX/CSS. Если экран концептуальный и backend-поля нет, сначала оформить backend/schema задачу, а не подставлять fake data.
