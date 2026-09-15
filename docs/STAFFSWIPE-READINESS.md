# StaffSwipe — production readiness

Этот файл хранит **правила оценки готовности**, а не копию старых test counts. Точный автоматический статус всегда берётся из текущего head SHA PR #62 и check `Repository Release Gate`; зелёный результат другого коммита не переносится на новый.

## Текущий integration workspace

- Repository: `polompol/sraffswipe1`
- Production-readiness PR: **#62**
- Head branch: `codex/staffswipe-production-readiness`
- Base: `codex/staffswipe-release-candidate`
- PR должен оставаться **Draft / unmerged**, пока не завершён финальный audit и внешние release gates.

## Что покрывает production-readiness программа

### 1. Деньги

- YooKassa-данные проверяются по провайдеру до зачисления;
- topup применяется exactly-once;
- refund имеет durable reservation/request identity;
- reconciliation обрабатывает неопределённые/ожидающие состояния;
- account deletion не должен обходить незавершённые финансовые обязательства;
- денежные гонки проверяются на PostgreSQL.

Реальный YooKassa test environment остаётся внешним gate.

### 2. Чат и плохая сеть

- клиентский `client_message_id` сохраняет идентичность сообщения;
- повтор после потерянного/неопределённого ответа не должен создавать дубль;
- UI показывает sending/failed/retry состояние;
- автоматический blind resend неоднозначного сообщения не используется;
- draft/outbox scoped по пользователю и match;
- plaintext chat не сохраняется в `localStorage/sessionStorage`.

### 3. Lifecycle смены

- state-changing endpoints используют row locking там, где нужна сериализация;
- проверяется точная role + identity авторизация;
- retry уже применённого intent должен возвращать committed state без повторных system messages/reports/settlement effects;
- check-in/attendance/not-held/dispute/cancel/confirm покрыты policy, retry и concurrency tests;
- stored arrival truth не должен изменяться от повторного запроса после неоднозначной мобильной сети.

### 4. Лента, свайпы и навигация

- состояния pending/failed/retry не маскируются под успех;
- пользовательский intent не теряется из-за повторного нажатия или позднего ответа;
- empty/exhausted feed имеет явное состояние;
- BackButton/навигация и большие/малые layout проверяются автоматизированно.

### 5. Trust & Safety / support / admin

- жалобы и support cases проходят серверную авторизацию;
- admin actions аудитируются;
- dispute/support queue покрыта тестами;
- доступ к админке определяется сервером, а не видимостью кнопки;
- production `ADMIN_TG_IDS` должен быть одним положительным числовым ID владельца.

### 6. Telegram WebView / accessibility

- safe area и viewport обрабатываются в UI;
- клавиатура чата и BackButton имеют автоматические проверки;
- reduced motion и крупные/малые layouts покрыты E2E/unit tests;
- browser emulation **не заменяет** physical Telegram iOS/Android smoke.

### 7. Operations / recovery

- `/health` — liveness API;
- `/health/ready` — API + PostgreSQL readiness и Docker healthcheck;
- `/health/ops` — PostgreSQL + fresh Redis probe + scheduler heartbeat;
- scheduler heartbeat хранится отдельно от daily `job_runs`;
- heartbeat stale threshold — 180 секунд;
- operational failure не раскрывает DSN/secrets/raw exception text;
- production backup остаётся SQL + gzip;
- CI выполняет disposable PostgreSQL dump → gzip → restore → schema + sentinel proof;
- повреждённый gzip должен отвергаться;
- `Repository Release Gate` агрегирует TMA CI, Backend CI, E2E и Security для **одного exact head SHA**.

## Автоматические repository gates

Для финального head SHA одновременно обязательны:

| Gate | Что доказывает |
| --- | --- |
| TMA CI | lint, TypeScript, unit tests, production build Mini App |
| Backend CI | Ruff, Python tests, PostgreSQL suite, migrations, backup→restore recovery |
| E2E | реальный браузер + живой backend + собранный Mini App |
| Security | secret scanning, dependency/security checks и остальные security jobs workflow |
| Repository Release Gate | все четыре источника выше относятся к одному exact head SHA и успешны |

`Repository Release Gate` fail-closed: missing, failed, cancelled или timed-out source evidence не считается успехом.

## Что GitHub CI принципиально не может подтвердить

Эти пункты остаются `PENDING`, пока не появится отдельное фактическое доказательство:

- **Telegram iOS physical-device smoke**;
- **Telegram Android physical-device smoke**;
- **YooKassa test-environment smoke**: payment → webhook → duplicate webhook → topup → refund → ambiguous retry → reconciliation;
- production DNS/HTTPS на реальном домене;
- реальные production credentials провайдеров;
- внешний backup destination действительно получает файлы и соблюдает retention;
- юридические реквизиты/контакты заполнены и опубликованы;
- production S3/DaData/support integrations проверены реальными аккаунтами, если они включаются в launch scope.

Ни один из этих пунктов нельзя автоматически пометить зелёным из-за успешного unit/E2E теста.

## Production health contract

Публично через Caddy:

```text
GET/HEAD /api/health
GET/HEAD /api/health/ready
GET/HEAD /api/health/ops
```

`/api/health/ops` рекомендуется использовать для внешнего alerting. Docker API healthcheck остаётся на `/health/ready`, чтобы проблема scheduler/Redis не превращалась в бессмысленный restart API.

При operational alert:

1. посмотреть `components` в `/api/health/ops`;
2. проверить `docker compose ... ps`;
3. посмотреть `logs scheduler`/`logs api`;
4. проверить Sentry;
5. только после определения причины выполнять restart/rollback.

## Backup / recovery contract

Production backup создаёт `scripts/backup.sh` и должен иметь **off-server copy**.

Repository recovery proof выполняет `scripts/verify-backup-restore.sh` только на disposable/test PostgreSQL. Скрипт создаёт собственные базы, накатывает production Alembic chain, пишет sentinel, делает `pg_dump --clean --if-exists | gzip`, проверяет архив, намеренно проверяет отказ на corrupt archive, восстанавливает во вторую базу и проверяет core schema + sentinel.

Production restore rehearsal должен выполняться на staging/новой пустой базе, а не уничтожением единственной production DB.

## Release decision

Кодовый release candidate можно считать repository-ready только если **на одном неизменённом head SHA**:

1. TMA CI = success;
2. Backend CI = success, включая PostgreSQL и recovery;
3. E2E = success;
4. Security = success;
5. Repository Release Gate = success;
6. PR #62 остаётся open + Draft + unmerged до завершения audit.

Production launch требует дополнительно закрыть внешние gates из раздела выше.

## Проверка вручную

Полный локальный репозиторный набор:

```sh
bash scripts/verify.sh
```

Production deploy/operations: `docs/DEPLOY.md`.

Specs/plans production-readiness находятся в `docs/superpowers/specs/` и `docs/superpowers/plans/`.

## Неизменные продуктовые правила

- зарплата сотруднику идёт напрямую от заведения;
- StaffSwipe начисляет комиссию заведению по закрытой смене;
- код прихода является evidence присутствия, но не гарантией оплаты;
- споры/no-show/несостоявшаяся смена проходят отдельную lifecycle/Trust & Safety обработку;
- дизайн и удобство не могут ослаблять серверную авторизацию, финансовые invariants или audit trail.
