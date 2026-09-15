# StaffSwipe — production deploy & operations runbook

Этот документ описывает запуск текущего production-стека StaffSwipe на одном VPS через `docker-compose.prod.yml` и отдельно отмечает проверки, которые нельзя заменить GitHub CI.

## 1. Что поднимается

Production compose включает:

- Caddy — HTTPS и reverse proxy;
- FastAPI API;
- Telegram bot;
- Telegram Mini App (собранная статика);
- PostgreSQL/PostGIS;
- Redis;
- отдельный scheduler-процесс.

Caddy проксирует `https://ДОМЕН/api/*` в FastAPI со снятием префикса `/api`, а остальной трафик отдаёт Mini App.

## 2. Что нужно до запуска

Нужны VPS с публичным IP, домен/поддомен с A-записью на этот IP, Telegram bot token и production-секреты. Для публичного запуска также нужны реальные реквизиты/контакты в `docs/legal/`, рабочая поддержка и один числовой Telegram ID владельца админки.

На сервере:

```sh
ssh root@<IP>
curl -fsSL https://get.docker.com | sh
ufw allow 22
ufw allow 80
ufw allow 443
```

Не включайте firewall до разрешения собственного SSH-порта.

## 3. Получить код

```sh
git clone https://github.com/polompol/sraffswipe1.git
cd sraffswipe1
```

Для production используйте только конкретный проверенный release SHA/ветку. Не считайте старый зелёный CI доказательством для нового коммита.

## 4. Production `.env`

```sh
bash scripts/gen-secrets.sh
cp .env.example .env
nano .env
```

Минимально обязательные значения:

```text
DOMAIN=
TELEGRAM_BOT_TOKEN=
BOT_USERNAME=
POSTGRES_PASSWORD=
JWT_SECRET=
INTERNAL_API_SECRET=
ADMIN_TG_IDS=
```

`ADMIN_TG_IDS` в production — один положительный числовой Telegram ID владельца. Не храните токены или другие секреты в Git, Mini App или обычной переписке.

Интеграции подключаются отдельными production-значениями:

- `YOOKASSA_*` — карточные пополнения/возвраты;
- `S3_*` + `UPLOAD_ORIGIN` — загрузка фотографий;
- `DADATA_TOKEN` — проверка реквизитов;
- `SENTRY_DSN` — сбор ошибок;
- `VITE_SUPPORT_URL` — поддержка;
- `ORG_*` — реквизиты документов.

Точный список и комментарии находятся в `.env.example`.

## 5. Запуск

```sh
docker compose -f docker-compose.prod.yml up -d --build
```

Проверить сервисы:

```sh
docker compose -f docker-compose.prod.yml ps
```

Для диагностики:

```sh
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f scheduler
docker compose -f docker-compose.prod.yml logs -f bot
docker compose -f docker-compose.prod.yml logs -f caddy
```

FastAPI при production-конфигурации работает с `DEV_MODE=false` и строгой Telegram auth. Миграции применяются тем же Alembic-путём, который проверяется в Backend CI.

## 6. Health endpoints — не путать

Через публичный домен endpoints доступны с `/api`:

```sh
curl -fsS https://ДОМЕН/api/health
curl -fsS https://ДОМЕН/api/health/ready
curl -fsS https://ДОМЕН/api/health/ops
```

Семантика:

- `/health` — только liveness API-процесса;
- `/health/ready` — API + PostgreSQL readiness. Именно его использует Docker healthcheck API;
- `/health/ops` — operational health: PostgreSQL, свежий Redis probe и heartbeat scheduler.

Scheduler считается stale, если heartbeat старше **180 секунд**. Отсутствующий/stale heartbeat или недоступный настроенный Redis дают `/health/ops` HTTP 503, но **не должны автоматически перезапускать API**.

Для внешнего alerting рекомендуется проверять `/api/health/ops`. Docker должен оставаться на `/health/ready`.

Если `/health/ready` = 200, а `/health/ops` = 503:

1. посмотреть `docker compose -f docker-compose.prod.yml logs --tail=200 scheduler`;
2. проверить Sentry, если задан `SENTRY_DSN`;
3. проверить `redis` и `db` в `docker compose ... ps`;
4. не перезапускать API вслепую — сначала определить компонент из `components` ответа `/health/ops`.

Operational endpoint не должен возвращать DSN, пароли, stack trace, Telegram ID или платёжные данные.

## 7. Telegram Mini App smoke — обязательно на физических устройствах

После HTTPS deploy настройте Menu Button/Mini App URL у бота и проверьте минимум:

- iOS: открытие, `initData`, safe area, BackButton, клавиатура чата, возврат из внешней страницы, повтор запроса при плохой сети;
- Android: тот же набор;
- обе роли: регистрация, лента, свайп/отклик, match, подтверждение смены, чат, код прихода, завершение/спор;
- плохая сеть: повтор state-changing запроса не должен создавать дубль сообщения/действия.

Browser/Playwright тесты этого не заменяют.

## 8. YooKassa test-environment smoke — до реальных денег

До включения реального магазина отдельно пройти тестовый контур:

1. создание пополнения;
2. возврат пользователя;
3. webhook успешного платежа;
4. повтор webhook;
5. ровно одно зачисление баланса;
6. refund;
7. повтор/неопределённый ответ refund;
8. reconciliation pending refund/payment.

GitHub CI проверяет кодовые инварианты, но не подтверждает доступность или настройки конкретного аккаунта YooKassa.

## 9. Backups

Production backup создаётся существующим скриптом:

```sh
bash scripts/backup.sh
```

Формат — SQL `pg_dump --clean --if-exists`, gzip и integrity check. Копия на том же VPS не является достаточной резервной копией: настройте `RCLONE_REMOTE`/S3/другое внешнее хранилище и отдельно проверьте, что файлы реально появляются и сохраняются по retention-политике.

Пример nightly cron:

```cron
0 4 * * * cd /root/sraffswipe1 && RCLONE_REMOTE=<remote>:staffswipe bash scripts/backup.sh >> /var/log/staffswipe-backup.log 2>&1
```

### Проверка восстановления

В репозитории есть `scripts/verify-backup-restore.sh`. Он предназначен для CI/тестового PostgreSQL и сам создаёт две disposable базы, выполняет миграции, dump → gzip → restore и проверяет core schema + sentinel data. Он также убеждается, что повреждённый gzip отвергается.

**Не направляйте этот скрипт на production database.**

Для production disaster-recovery периодически делайте rehearsal на staging/копии инфраструктуры: скачайте внешний backup, восстановите его в **новую пустую тестовую базу**, выполните sanity queries и только после этого считайте backup пригодным. Не проверяйте restore уничтожением единственной production-базы.

## 10. Обновление

Перед обновлением сохраните backup и зафиксируйте deploy SHA:

```sh
cd ~/sraffswipe1
bash scripts/backup.sh
git fetch --all --prune
git checkout <verified-sha-or-release>
docker compose -f docker-compose.prod.yml up -d --build
```

После обновления:

```sh
docker compose -f docker-compose.prod.yml ps
curl -fsS https://ДОМЕН/api/health/ready
curl -fsS https://ДОМЕН/api/health/ops
```

Затем повторите короткий Telegram smoke.

## 11. Repository release gate

PR должен иметь один агрегированный check **Repository Release Gate**. Он ждёт результаты одного и того же head SHA:

- TMA CI;
- Backend CI, включая PostgreSQL и backup→restore verification;
- E2E;
- Security.

Gate fail-closed: missing, failed, cancelled или timed-out source run не считается зелёным. Он не перезапускает и не дублирует сами suites.

Даже зелёный Repository Release Gate **не означает production launch автоматически**. Внешние gates остаются отдельными:

- physical iOS Telegram smoke;
- physical Android Telegram smoke;
- YooKassa test-environment smoke;
- production DNS/HTTPS;
- реальные внешние backups/retention;
- production provider credentials и юридические данные.

## 12. Частые проблемы

- `502 /api` — смотрите `logs api`; частые причины: миграция/конфиг/secrets.
- HTTPS не выпускается — DNS A-record и порты 80/443, затем `logs caddy`.
- Mini App не открывается — проверьте HTTPS URL Menu Button и `logs bot`.
- `/health/ready` 503 — PostgreSQL/API readiness.
- `/health/ops` 503 при `/health/ready` 200 — scheduler/Redis operational incident; смотрите `components` + scheduler logs/Sentry.
- фото не загружаются — проверьте `S3_*`, `UPLOAD_ORIGIN` и CSP.
- карточные пополнения не работают — проверьте `YOOKASSA_*`, webhook URL/secret и provider test smoke.

## 13. Критерий запуска

Production можно считать подготовленным только после совпадения двух групп доказательств:

1. текущий release SHA имеет зелёный Repository Release Gate;
2. внешние gates выше пройдены на реальной production/test инфраструктуре и физических Telegram клиентах.

Не подменяйте вторую группу браузерными тестами или старым CI.
