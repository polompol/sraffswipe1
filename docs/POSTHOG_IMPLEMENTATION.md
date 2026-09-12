# StaffSwipe × PostHog — план внедрения

Этот документ — конкретный план внедрения PostHog в текущий StaffSwipe. Он опирается на существующую архитектуру проекта и **не заменяет** уже работающую локальную аналитику `Event`/`/events` на первом этапе.

## 0. Главный принцип миграции

Сейчас в StaffSwipe уже есть:

- TMA `track(name, props)` в `tma/src/api/endpoints.ts`;
- POST `/events` в `backend/app/routers/analytics.py`;
- таблица `Event`;
- события `open`, `swipe`, `match`, `confirm`, `consent`, `vacancy_publish`, `client_error`;
- админская воронка, где `match`, `confirm`, `done` частично считаются по фактам из таблицы `Match`.

Поэтому внедряем PostHog через **dual-write**:

1. Сохраняем существующий `/events` и админскую аналитику.
2. Новый клиентский analytics-wrapper отправляет событие в PostHog и, где нужно для обратной совместимости, в `/events`.
3. Доменные факты — мэтч, подтверждение обеими сторонами, завершение смены, деньги, no-show, dispute — отправляет backend.
4. После 2–4 недель пилота сравниваем PostHog и текущую локальную статистику.
5. Только после сверки решаем, какие старые события можно убрать.

Нельзя сразу заменить локальную аналитику PostHog: текущий `/analytics/funnel` нужен админке и использует БД как источник правды для части шагов.

---

# 1. Целевая архитектура

```text
Telegram Mini App
        │
        ├── UX events ────────────────► PostHog
        │      app_opened
        │      feed_viewed
        │      shift_swiped
        │      chat_opened
        │      filter_changed
        │
        └── existing track() ─────────► POST /events ─► Event table

FastAPI
        │
        ├── domain transitions ───────► PostHog
        │      match_created
        │      shift_confirmed
        │      shift_completed
        │      no_show_recorded
        │      dispute_opened
        │      wallet_topup_succeeded
        │      commission_charged
        │
        └── existing DB state ────────► current admin analytics
```

## Почему именно так

- UI знает, **что хотел сделать пользователь**.
- Backend знает, **что реально произошло**.
- Деньги, trust/safety и статусы смен нельзя считать только по клиентским событиям.
- Если Telegram закрылся сразу после API-ответа, server-side событие всё равно должно попасть в аналитику.

---

# 2. Пакеты

## TMA

Файл: `tma/package.json`

Добавить:

```json
"posthog-js": "<current-compatible-version>"
```

Версию фиксировать через lockfile проекта. Перед merge прогнать `npm audit`, TMA tests/typecheck/build.

## Backend

Для первой версии **отдельный Python SDK не обязателен**, потому что `httpx` уже есть в `backend/requirements.txt`.

Рекомендуемый старт: отправлять server-side события в PostHog Capture API через существующий `httpx`, завернув его в один модуль. Это уменьшает число новых зависимостей.

Если позже понадобится server-side feature-flag evaluation — тогда отдельно оценить официальный Python SDK.

---

# 3. ENV

## `tma/.env.example`

Добавить:

```env
# PostHog product analytics. Публичный project key допустим в клиенте.
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=
```

`VITE_POSTHOG_HOST` задаётся по региону выбранного PostHog Cloud проекта.

## `backend/.env.example`

Добавить:

```env
# PostHog server-side analytics.
POSTHOG_KEY=
POSTHOG_HOST=
POSTHOG_ENABLED=false
```

## Корневой `.env.example`

Так как production compose читает корневой `.env`, те же server/client значения должны быть представлены и там и проброшены соответствующим контейнерам.

## Правила

- Не использовать PostHog personal API key для обычного capture.
- Никогда не коммитить реальные ключи.
- `POSTHOG_ENABLED=false` должен полностью отключать server-side отправку.
- Ошибка PostHog не должна ломать бизнес-операцию.

---

# 4. Frontend: новые файлы

## `tma/src/lib/analytics.ts`

Создать единый wrapper. Компоненты не должны импортировать `posthog-js` напрямую.

API модуля:

```ts
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export function initAnalytics(): void;
export function identifyAnalytics(userId: string, props?: AnalyticsProps): void;
export function resetAnalytics(): void;
export function capture(event: AnalyticsEvent, props?: AnalyticsProps): void;
export function setPersonProperties(props: AnalyticsProps): void;
export function isFeatureEnabled(key: FeatureFlag): boolean | undefined;
export function getFeatureFlag(key: FeatureFlag): boolean | string | undefined;
```

Обязательные свойства, которые wrapper может добавлять автоматически:

- `app_surface: "telegram_mini_app"`
- `app_version`
- `active_role`
- `telegram_platform` если доступно без передачи приватных данных
- `theme`

Wrapper должен:

- быть no-op без `VITE_POSTHOG_KEY`;
- никогда не бросать исключение в UI;
- не включать autocapture на первом этапе;
- не включать session replay на первом этапе;
- не передавать DOM-текст/поля автоматически;
- централизованно фильтровать запрещённые properties.

## `tma/src/lib/analyticsEvents.ts`

Создать typed contract, чтобы не появлялись `match`, `got_match`, `matched`, `match_made` одновременно.

Пример:

```ts
export const ANALYTICS = {
  APP_OPENED: "app_opened",
  ONBOARDING_STARTED: "onboarding_started",
  ROLE_SELECTED: "role_selected",
  ONBOARDING_COMPLETED: "onboarding_completed",
  WORKER_FEED_VIEWED: "worker_feed_viewed",
  VENUE_FEED_VIEWED: "candidate_feed_viewed",
  SHIFT_SWIPED: "shift_swiped",
  CANDIDATE_SWIPED: "candidate_swiped",
  CHAT_OPENED: "chat_opened",
  MESSAGE_SENT: "message_sent",
  SHIFT_CONFIRMATION_REQUESTED: "shift_confirmation_requested",
  SHIFT_CREATED: "shift_created",
  SHIFT_PUBLISHED: "shift_published",
  WALLET_TOPUP_INITIATED: "wallet_topup_initiated",
} as const;
```

Server-only names тоже можно держать в общем контракте документации, но клиент не должен эмитить бизнес-факт вместо сервера.

---

# 5. Frontend: изменения существующих файлов

## `tma/src/main.tsx`

Сейчас здесь один раз за session отправляется `track("open")`.

Изменить порядок:

1. `initAnalytics()` до render, но после базового safe init.
2. Существующий `track("open")` оставить на время dual-write.
3. В том же session guard отправить:

```ts
capture("app_opened", {
  entrypoint,
  theme,
  telegram_platform,
});
```

`entrypoint`:

- `bot_button`
- `deep_link`
- `notification`
- `direct`
- `browser`

Не отправлять сырой `initData`.

## `tma/src/store/session.ts`

Это центральное место identity lifecycle.

### `setAuth`

После успешного сохранения session:

```ts
identifyAnalytics(`user:${userId}`, {
  role_primary: role,
});
```

Лучше передавать внутренний StaffSwipe ID, а не Telegram ID.

### `setRole`

Обновлять person property / super-property активной роли.

### `logout`

После очистки локальной авторизации вызвать:

```ts
resetAnalytics();
```

Это обязательно, иначе на одном устройстве следующий аккаунт может наследовать предыдущий analytics distinct_id.

## `tma/src/features/auth/RolePage.tsx`

Сейчас есть `track("consent")`.

Добавить:

- `onboarding_started` при первом показе onboarding/role flow;
- `role_selected` **после успешного `authTelegram`**, а не только при tap;
- property `selected_role`;
- `auth_result: success` отдельным событием не нужен — ошибки уже идут через observability/Sentry.

Consent не должен включать содержание юридических данных; достаточно факта версии согласия, если это действительно нужно продуктовой аналитике.

## onboarding

Каталог: `tma/src/features/onboarding/`

Найти точку, где профиль становится пригоден для использования и пользователь уходит в основной продукт. Там отправлять:

```text
onboarding_completed
```

Properties:

- `role_primary`
- `has_avatar`
- `has_city`
- `medical_book_status` (enum, без данных документа)
- `self_employed_status` (enum)
- `time_to_complete_sec`

Не отправлять:

- телефон;
- ИНН;
- ФИО целиком;
- дату рождения;
- точный адрес;
- document/photo URLs.

## `tma/src/features/feed/useSwipeAction.ts`

Сейчас до API вызывается:

```ts
track("swipe", { dir });
```

и при клиентском результате мэтча:

```ts
track("match");
```

### Оставить временно

Старый `track("swipe")` — для старой воронки.

### Добавить PostHog UX event

Для seeker:

```text
shift_swiped
```

Для employer:

```text
candidate_swiped
```

Свойства:

- `direction`: like | pass
- `target_id`
- `feed_mode`: swipe | list
- `rank_position`, если доступно
- `decision_time_ms`, если измеряется
- `vacancy_id` для employer-context
- `role_requested` для вакансии
- `pay_bucket`, а не обязательно точная ставка в каждом impression event
- `verified` boolean

### Важно

`match_created` здесь **не отправлять как источник правды**. Клиент может показать match animation, но canonical `match_created` должен эмититься в backend в момент атомарного создания `Match`.

Старый `track("match")` можно оставить только ради legacy funnel до окончания dual-write периода.

## `tma/src/features/invites/InvitesPage.tsx`

Здесь сейчас тот же `swipe` + `match` legacy tracking.

Добавить те же canonical события, но property:

```text
feed_source: invite
```

Это позволит измерить, насколько экран «Кто меня зовёт» увеличивает match-rate.

## Feed page/list page

В точке успешной загрузки непустого или пустого feed отправлять один `*_feed_viewed` на meaningful view, не на каждый React render.

Worker:

```text
worker_feed_viewed
```

Venue:

```text
candidate_feed_viewed
```

Properties:

- `result_count`
- `active_filters_count`
- `sort_mode`
- `feed_mode`
- coarse city

Первый worker feed view фиксировать как отдельный first-time milestone `worker_first_feed_viewed` либо вычислять через PostHog first occurrence. Для простоты пилота допустимо отдельное событие с local/server guard.

## Filters

Не слать событие на каждое движение control. Отправлять после применения:

```text
feed_filters_applied
```

Properties — только enum/count/bucket; без точных координат.

## `tma/src/features/chat/ChatPage.tsx`

Сейчас после `confirmShift()` клиент пишет `track("confirm")`.

### Добавить UI events

При meaningful open:

```text
chat_opened
```

Properties:

- `match_id`
- `actor_role`
- `match_status`

После успешного `sendMessage`:

```text
message_sent
```

Не отправлять `text` сообщения.

Допустимые свойства:

- `match_id`
- `actor_role`
- `message_kind: text | quick_reply`
- `length_bucket`

Перед `confirmShift` можно отправить intent, а после успешного ответа:

```text
shift_confirmation_requested
```

Но canonical `shift_confirmed` — только backend, когда обе стороны действительно подтвердили.

Legacy `track("confirm")` оставить до окончания dual-write.

Отмены/переносы/hours также лучше считать server-side как факты, а client-side только если нужен UX funnel.

## `tma/src/features/vacancy/CreateVacancyPage.tsx`

Сейчас после успешного `createVacancy` вызывается `track("vacancy_publish", { role })`.

Разделить семантику:

- если backend создаёт сразу опубликованную смену — UI может отправить `shift_publish_ui_succeeded`, но canonical `shift_published` должен отправлять backend;
- если появится draft → publish, оставить два доменных события `shift_created` и `shift_published` на backend.

Legacy `vacancy_publish` временно сохранить.

## Wallet / billing UI

В точке, где пользователь начинает пополнение:

```text
wallet_topup_initiated
```

Properties:

- `amount`
- `provider: yookassa`
- `venue_id`

`wallet_topup_succeeded` клиент **не отправляет** — это webhook/server fact.

---

# 6. Backend: новый analytics service

## Создать `backend/app/analytics_service.py`

Задача: единая безопасная отправка server-side событий.

Интерфейс:

```py
def capture(
    event: str,
    *,
    distinct_id: str,
    properties: dict | None = None,
    groups: dict | None = None,
) -> None:
    ...
```

Требования:

- no-op при `POSTHOG_ENABLED=false` или пустом ключе;
- короткий timeout;
- analytics failure никогда не откатывает транзакцию бизнес-операции;
- исключение уходит в лог/Sentry на разумном уровне, но не спамит пользователя;
- sanitizer properties;
- denylist чувствительных ключей;
- события денег и trust/safety вызываются только после успешного DB transition;
- для критических переходов capture размещать после commit или через post-commit helper, чтобы PostHog не увидел то, что БД потом откатила.

### Denylist минимум

```text
phone
inn
ogrn
email
init_data
telegram_init_data
message_text
text
full_name
birth_date
lat
lng
exact_address
document_url
photo_document_url
jwt
token
secret
```

Для `text` есть исключение: не надо строить сложные исключения — просто никогда не передавать chat body в analytics properties.

## `backend/app/config.py`

Добавить settings:

```text
posthog_key
posthog_host
posthog_enabled
```

С production-safe validation: отсутствие PostHog **не должно блокировать запуск** продукта, так как аналитика не является core dependency.

---

# 7. Backend: точные места доменных событий

## `backend/app/routers/auth.py`

После создания нового аккаунта / успешной первичной регистрации:

```text
account_created
```

Это опционально для Phase 1. `onboarding_completed` важнее и остаётся client/domain-profile milestone.

Не передавать Telegram ID в properties. `distinct_id` строить из внутреннего owner/user ID.

## endpoint свайпа

Файл маршрута, обслуживающий POST `/swipes`.

В момент, когда взаимный like **реально создаёт Match**, после commit:

```text
match_created
```

Properties:

- `match_id`
- `worker_user_id`
- `venue_id`
- `vacancy_id`
- `role_requested`
- `hours_from_shift_start`
- `match_source`

Не доверять этим значениям с клиента — брать из моделей БД.

## `backend/app/routers/chat.py`

После сохранения первого реального сообщения по match:

```text
chat_started
```

Только один раз на match.

Не отправлять текст.

Properties:

- `match_id`
- `first_sender_role`
- `minutes_from_match_to_first_message`

Обычный `message_sent` можно оставить client-side для UX и не дублировать каждый message на сервере в PostHog.

## `backend/app/routers/matches.py`

Это главный source-of-truth для shift lifecycle.

### После взаимного подтверждения

Когда после очередного confirm оба флага true и status становится `confirmed`:

```text
shift_confirmed
```

Properties:

- `match_id`
- `vacancy_id`
- `worker_user_id`
- `venue_id`
- `scheduled_start_at`
- `scheduled_hours`
- `pay_amount`
- `hours_from_match_to_confirmation`

Событие должно быть idempotent: повторный confirm не создаёт второй `shift_confirmed`.

### Cancel

После успешной отмены:

```text
shift_cancelled
```

Properties:

- `match_id`
- `actor_role`
- normalized `reason_code`
- `hours_before_start` bucket/number

Не отправлять свободный текст причины целиком.

### `not-held`

`mark_not_held()` уже содержит важную бизнес-логику no-show/dispute.

После commit:

- если выставлен `m.no_show = True` → `no_show_recorded`;
- если открыт dispute → `dispute_opened`;
- если смена просто `expired` без no-show → `shift_not_completed`.

### Attendance/check-in

Если результат приводит к подтверждённому no-show или dispute — событие должно отражать **результат доменной логики**, не клик пользователя.

## `backend/app/shift_rules.py`

Функции `maybe_complete()` / `accrue_commission()` — лучшие точки для финальных бизнес-событий, если именно там гарантированно меняются состояния.

### Когда match впервые стал completed

```text
shift_completed
```

Properties:

- `match_id`
- `vacancy_id`
- `venue_id`
- `worker_user_id`
- `scheduled_hours`
- `actual_hours`
- `gmv_amount`
- `commission_amount`
- `completion_mode`

### Когда комиссия впервые создана

```text
commission_charged
```

Событие должно следовать той же идемпотентности, что и запись `Commission`.

Не делать analytics capture условием успешности начисления.

## scheduler

Автоматическое закрытие смен должно приводить к тем же canonical событиям через общий domain helper, а не иметь отдельный `shift_auto_closed_analytics` путь.

То есть ручное и автоматическое завершение должны сходиться в `shift_completed`, различаясь property `completion_mode`.

## `backend/app/routers/billing.py`

### Создание topup

Можно server-side дополнить client intent, но основной Phase 1 факт:

### Успешный webhook/fulfill

Только после успешной идемпотентной фиксации платежа:

```text
wallet_topup_succeeded
```

Properties:

- `venue_id`
- `amount`
- `provider: yookassa`
- безопасный internal payment identifier при необходимости корреляции

Нельзя отправлять:

- card/payment instrument details;
- секрет webhook;
- receipt/customer PII.

### Refund

После фактической операции:

```text
refund_processed
```

---

# 8. Identity и groups

## Person distinct_id

Использовать:

```text
user:<internal_user_id>
```

или, если User и Employer живут в разных ID-пространствах и ID могут совпасть:

```text
seeker:<id>
employer_user:<id>
```

Нужно выбрать один вариант после проверки модели идентичности. Главное: **не raw Telegram ID, не username, не телефон**.

## Active role

Поскольку человек может действовать в разных ролях, каждое relevant event должно иметь:

```text
actor_role: seeker | employer
```

Не полагаться только на person property `role_primary`.

## Venue groups

Если PostHog groups включены в выбранном плане/проекте:

```text
venue:<employer_id>
```

Group properties:

- `venue_type`
- `venue_city`
- `venue_verified`
- `first_shift_posted_at`

Если groups не нужны на пилоте — не блокировать запуск; `venue_id` property достаточно.

---

# 9. Privacy contract

PostHog не должен стать копией основной БД.

## Никогда не отправлять

- Telegram initData;
- JWT/access token;
- Telegram ID как property без необходимости;
- телефон;
- ИНН/ОГРН в user events;
- ФИО;
- дату рождения;
- текст чатов;
- причины жалоб/споров свободным текстом;
- точные координаты;
- точный домашний адрес;
- фото документов;
- S3 signed URLs;
- платежные реквизиты.

## Использовать вместо этого

- enums;
- booleans;
- buckets;
- internal opaque IDs;
- coarse city/district, если это действительно нужно для marketplace liquidity.

## Session replay

На пилоте оставить выключенным. Включать только после отдельного privacy review, masking policy и проверки экранов чата/профиля/платежей.

## Autocapture

На первом этапе выключить. StaffSwipe выгоднее иметь короткую осмысленную taxonomy, чем миллионы случайных DOM-click событий.

---

# 10. Event taxonomy v1

## Client/UX

| Event | Source | Когда |
| --- | --- | --- |
| `app_opened` | TMA | один раз за session |
| `onboarding_started` | TMA | первый вход в onboarding |
| `role_selected` | TMA | auth/role selection success |
| `onboarding_completed` | TMA/domain | профиль готов |
| `worker_feed_viewed` | TMA | meaningful feed view |
| `candidate_feed_viewed` | TMA | venue candidate feed |
| `shift_swiped` | TMA | worker decision |
| `candidate_swiped` | TMA | venue decision |
| `feed_filters_applied` | TMA | применение фильтров |
| `chat_opened` | TMA | открыт чат |
| `message_sent` | TMA | сообщение успешно отправлено, без текста |
| `shift_confirmation_requested` | TMA | успешный confirm request/response |
| `wallet_topup_initiated` | TMA | пользователь начал оплату |

## Server/domain

| Event | Source | Когда |
| --- | --- | --- |
| `match_created` | backend | Match реально создан |
| `chat_started` | backend | первое сообщение match |
| `shift_confirmed` | backend | обе стороны подтвердили |
| `shift_cancelled` | backend | смена отменена |
| `shift_not_completed` | backend | смена не состоялась |
| `no_show_recorded` | backend | no-show подтверждён доменной логикой |
| `dispute_opened` | backend | спор создан |
| `dispute_resolved` | backend/admin | спор закрыт |
| `shift_completed` | backend/shift_rules | завершена смена |
| `wallet_topup_succeeded` | backend/billing | успешный платёж зафиксирован |
| `commission_charged` | backend/shift_rules | комиссия создана |
| `refund_processed` | backend/admin/billing | возврат зафиксирован |
| `verification_result` | backend/admin | проверка завершена |

---

# 11. Legacy → canonical mapping

| Сейчас | PostHog v1 | Примечание |
| --- | --- | --- |
| `open` | `app_opened` | dual-write |
| `swipe` | `shift_swiped` / `candidate_swiped` | role-aware |
| `match` | `match_created` | legacy client остаётся временно; canonical backend |
| `confirm` | `shift_confirmation_requested` + `shift_confirmed` | intent vs fact |
| `vacancy_publish` | `shift_published` | canonical backend |
| `consent` | не ключевая product metric | оставить legacy при необходимости |
| `client_error` | Sentry | не дублировать как основную product metric |
| DB Match `completed` | `shift_completed` | backend canonical |

---

# 12. Dashboards v1

## Dashboard 1 — Worker Activation

Funnel:

```text
app_opened
→ onboarding_completed
→ worker_feed_viewed
→ shift_swiped(direction=like OR any)
→ match_created
→ chat_started
→ shift_confirmed
→ shift_completed
```

Breakdowns:

- city;
- acquisition/entrypoint;
- requested role;
- new vs returning user.

## Dashboard 2 — Venue Activation

```text
app_opened
→ onboarding_completed
→ shift_published
→ candidate_feed_viewed
→ candidate_swiped(direction=like)
→ match_created
→ shift_confirmed
→ shift_completed
```

## Dashboard 3 — Marketplace Liquidity

- active seekers/day;
- active venues/day;
- published shifts/day;
- median feed result count;
- time `shift_published → match_created`;
- matches per published shift;
- completed shifts per published shift;
- role/city breakdown.

## Dashboard 4 — Trust & Safety

- no-show rate / confirmed shift;
- cancellation rate;
- dispute rate;
- dispute resolution time;
- shift_not_completed rate;
- repeated no-show entities (internal analysis with strict access).

## Dashboard 5 — Revenue & Retention

- GMV from completed shifts;
- commission amount;
- successful wallet topups;
- refund amount/rate;
- worker repeat completion rate;
- venue repeat hire rate;
- D1/D7/D30 return by actor role.

---

# 13. Feature flags v1

Не превращать PostHog flags в бизнес-конфиг. Деньги, безопасность, комиссия, auth и eligibility не должны зависеть от случайного client-only flag.

Стартовый набор:

```text
experiment.onboarding_short
experiment.feed_default_mode
experiment.worker_card_trust_badge
experiment.venue_card_reliability_badge
experiment.match_celebration
release.urgent_shift_badge
release.saved_search_alerts
```

## Правила flags

Каждый flag имеет:

- owner;
- purpose;
- default safe value;
- primary metric;
- guardrail metric;
- rollout plan;
- rollback plan;
- removal date/condition.

Не вкладывать flags друг в друга без крайней необходимости.

---

# 14. Первые эксперименты

## A. Короткий onboarding

Primary:

```text
onboarding_completed / onboarding_started
```

Secondary:

- first like rate;
- match rate;
- completed shift rate.

Guardrails:

- report/no-show rate;
- profile completeness;
- support error rate.

## B. Swipe vs list first

Primary:

- first meaningful action time;
- like rate;
- match rate.

Guardrail:

- accidental back/pass proxy;
- session abandonment.

## C. Trust badge on card

Primary:

- like → match → confirmed shift conversion.

Guardrail:

- diversity/exposure;
- new-user cold-start fairness;
- report/no-show downstream.

## D. Card hierarchy: pay vs reliability

Смотреть не только CTR/like. Победитель определяется по `shift_completed`, а не по количеству свайпов.

---

# 15. Tests

## TMA

### Создать `tma/src/lib/analytics.test.ts`

Проверить:

- no key → no-op;
- capture не бросает;
- identify использует internal user ID;
- logout вызывает reset;
- denylist не пропускает чувствительные properties;
- event names typed;
- disabled autocapture/replay config.

### Обновить `tma/src/store/session.test.ts`

- setAuth identifies;
- setRole updates role context;
- logout resets analytics identity.

### Обновить tests для `useSwipeAction`

- seeker emits `shift_swiped`;
- employer emits `candidate_swiped`;
- match UX не считается canonical backend match.

## Backend

### Создать `backend/tests/test_analytics_service.py`

- disabled → no network call;
- timeout/failure does not throw into domain operation;
- denylist;
- event payload shape;
- host/key config;
- no chat text leakage.

### Domain tests

Добавить assertions/mocks в существующие tests:

- match created once;
- mutual confirm → `shift_confirmed` once;
- repeated idempotent operation → no duplicate domain event;
- completed shift → one `shift_completed`;
- commission → one `commission_charged`;
- YooKassa webhook retry → one logical `wallet_topup_succeeded`;
- not-held employer path → correct no-show/dispute event.

---

# 16. CI

Текущие обязательные проверки остаются:

```bash
cd tma
npm run lint
npm run typecheck
npm test
npm run build

cd ../backend
# существующий lint/test набор проекта

bash scripts/verify.sh
```

Дополнительно:

- dependency audit после добавления `posthog-js`;
- grep/test, запрещающий импорт `posthog-js` вне `lib/analytics.ts`;
- по возможности test на denylisted analytics properties.

---

# 17. Rollout

## Phase A — foundation

- ENV;
- `posthog-js`;
- `analytics.ts`;
- typed events;
- identity/reset;
- app_opened;
- dual-write legacy events.

**Критерий:** приложение работает идентично без ключа PostHog.

## Phase B — activation

- onboarding;
- feed views;
- worker/candidate swipes;
- chat open/message sent;
- shift confirmation intent.

**Критерий:** worker и venue activation funnels собираются.

## Phase C — backend truth

- match_created;
- chat_started;
- shift_confirmed;
- cancellation/not-held/no-show/disputes;
- shift_completed;
- commission;
- YooKassa success/refund.

**Критерий:** match-to-completion и revenue funnel не зависят от клиента.

## Phase D — dashboards

Создать 5 dashboards из этого документа.

Проверить минимум 7 дней pilot data.

## Phase E — feature flags/experiments

Только после того, как event taxonomy стабильна и baseline метрик известен.

---

# 18. Acceptance criteria

Внедрение считается готовым, когда:

1. Продукт полностью работает с `POSTHOG_ENABLED=false` и без `VITE_POSTHOG_KEY`.
2. Один StaffSwipe user не смешивается с другим после logout/login.
3. Ни телефон, ни ИНН, ни Telegram initData, ни chat text не попадают в analytics payloads.
4. `match_created`, `shift_confirmed`, `shift_completed`, `commission_charged`, `wallet_topup_succeeded` имеют backend source-of-truth.
5. YooKassa webhook retry и другие идемпотентные переходы не раздувают бизнес-метрики.
6. Legacy `/events` и текущая админская воронка продолжают работать на этапе dual-write.
7. Можно построить worker и venue funnel от open до completed shift.
8. Можно отдельно измерить no-show/dispute/cancel rate.
9. Можно посчитать GMV и комиссию только по подтверждённым backend фактам.
10. TMA lint/typecheck/tests/build и backend tests проходят.

---

# 19. Рекомендуемый порядок PR

Не делать один гигантский PR.

### PR 1 — analytics foundation

- dependency;
- ENV;
- `analytics.ts`;
- event typings;
- identity/reset;
- tests.

### PR 2 — TMA activation events

- app/open/onboarding;
- feed;
- swipe;
- chat;
- vacancy/topup intents.

### PR 3 — backend domain events

- analytics_service;
- match/chat/confirm;
- shift lifecycle;
- billing;
- tests/idempotency.

### PR 4 — dashboards + flags

- PostHog objects/configuration;
- experiment documentation;
- rollout notes.

Это снижает риск: если аналитическая библиотека или endpoint ведут себя плохо, их можно откатить без отката платежей/мэтчей/чата.

---

# 20. Что НЕ делать

- Не удалять `/events` сразу.
- Не отправлять `match_created` только с фронта.
- Не считать успешную оплату по redirect обратно из ЮKassa.
- Не отправлять chat text.
- Не включать autocapture/session replay «на всякий случай».
- Не использовать PostHog как источник прав доступа или финансовой истины.
- Не давать feature flags менять комиссию, authorization или trust/safety rules на клиенте.
- Не использовать точные координаты ради красивого dashboard.
- Не создавать события без владельца и вопроса, на который они должны отвечать.

---

# 21. Итоговая карта файлов

## Изменить

```text
tma/package.json
tma/.env.example
tma/src/main.tsx
tma/src/store/session.ts
tma/src/features/auth/RolePage.tsx
tma/src/features/onboarding/*
tma/src/features/feed/useSwipeAction.ts
tma/src/features/invites/InvitesPage.tsx
tma/src/features/chat/ChatPage.tsx
tma/src/features/vacancy/CreateVacancyPage.tsx
<frontend wallet/topup screen>

backend/.env.example
.env.example
backend/app/config.py
backend/app/routers/auth.py
<router for POST /swipes>
backend/app/routers/chat.py
backend/app/routers/matches.py
backend/app/shift_rules.py
backend/app/routers/billing.py
<admin dispute/verification resolution paths>
```

## Создать

```text
tma/src/lib/analytics.ts
tma/src/lib/analyticsEvents.ts
tma/src/lib/analytics.test.ts
backend/app/analytics_service.py
backend/tests/test_analytics_service.py
```

## Сохранить на этапе миграции

```text
tma/src/api/endpoints.ts -> track()
backend/app/routers/analytics.py -> POST /events + /analytics/funnel
backend Event table
```

Это позволяет внедрить PostHog без рискованной переделки существующей бизнес-логики StaffSwipe.