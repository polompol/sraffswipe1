"""Конфигурация приложения (читается из окружения / .env)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # По умолчанию SQLite — приложение поднимается без внешних зависимостей.
    # В проде: postgresql+psycopg://user:pass@host:5432/staffswipe (PostGIS).
    database_url: str = "sqlite:///./staffswipe.db"
    # Пул соединений к БД (только PostgreSQL) — запас под нагрузку.
    db_pool_size: int = 10
    db_max_overflow: int = 20

    jwt_secret: str = "dev-secret-change-me"
    jwt_alg: str = "HS256"
    # Срок жизни токена. Было 720 часов (месяц): украли телефон
    # разблокированным — доступ к аккаунту месяц, и отозвать его было нечем.
    # Неделя — компромисс: приложение переполучает токен само и молча (в
    # Telegram вход не требует действий человека), поэтому короткий срок он
    # не замечает. Мгновенный отзыв — отдельно, через поколение токенов.
    jwt_ttl_hours: int = 168
    # Срок годности Telegram initData (часы) — защита от replay перехваченной подписи.
    initdata_ttl_hours: int = 24

    # Режим разработки: код из SMS возвращается в ответе API.
    dev_mode: bool = True

    # SMS-провайдер: none|exolve|smsru|smsc (none = заглушка/dev).
    sms_provider: str = "none"
    sms_api_key: str = ""

    # DaData — проверка ИНН/ОГРН и подсказки адресов.
    dadata_token: str = ""

    # --- Telegram ---
    # Токен бота (BotFather). Нужен для валидации initData и уведомлений.
    telegram_bot_token: str = ""
    # Публичный URL Mini App (для кнопки запуска и реф-ссылок).
    mini_app_url: str = ""
    # Username бота (без @) — для реферальных ссылок t.me/<bot>?startapp=...
    bot_username: str = "staffswipe_bot"
    # Комиссия сервиса с закрытой смены (% от оплаты). Только УЧЁТ для счёта —
    # деньги не списываются автоматически до подключения ЮKassa. 0 = выключено.
    commission_pct: int = 10
    # Минимум комиссии за смену, ₽ (чтобы дешёвая смена не давала копейки).
    commission_min_rub: int = 0
    # Срок оплаты комиссии, дней. Неоплаченная комиссия старше срока =
    # просрочка: публикация новых вакансий блокируется до оплаты. 0 = не блокировать.
    commission_due_days: int = 7
    # За сколько часов до смены отмена считается «поздней». Позже этого срока
    # заведение уже не найдёт замену, поэтому по вреду такая отмена почти
    # равна неявке и отражается в надёжности профиля.
    late_cancel_hours: int = 6
    # Часовой пояс, в котором люди читают время смены. Сервер живёт в UTC, а
    # смена «10:00–18:00» — это московское время; без этого напоминания и
    # авто-закрытие смен уезжали на три часа. Другой город — другое значение.
    business_tz: str = "Europe/Moscow"
    # Разрешать вход без валидной подписи initData (ТОЛЬКО локальная отладка).
    allow_insecure_telegram_auth: bool = False

    # Секрет для внутренних вызовов (бот/вебхуки → /billing/fulfill).
    internal_api_secret: str = ""
    # Отдельный секрет для вебхука ЮKassa (в query). Если задан — урон от утечки
    # URL из логов ограничен вебхуком и не открывает /fulfill. Пусто → fallback.
    yookassa_webhook_secret: str = ""

    # Общая память для нескольких процессов: счётчики частоты и раздача
    # сообщений чата. Пусто — всё живёт в памяти процесса, и тогда
    # WEB_CONCURRENCY обязан быть 1. Пример: redis://redis:6379/0
    redis_url: str = ""

    # --- Реквизиты получателя платежа (для счёта и акта юрлицу) ---
    # Ресторан-юрлицо не может оплатить по безналу без счёта с реквизитами, а
    # в расходы не поставит без акта. Пока поля пустые, документы не
    # выдаются: лучше честный отказ, чем бумага с прочерками, которую
    # бухгалтерия всё равно вернёт.
    org_name: str = ""            # ИП Иванов Иван Иванович / ООО «Ромашка»
    org_inn: str = ""
    org_kpp: str = ""             # у ИП и самозанятого КПП нет — оставить пустым
    org_ogrn: str = ""
    org_address: str = ""
    org_bank_name: str = ""
    org_bank_bic: str = ""
    org_bank_account: str = ""    # расчётный счёт
    org_corr_account: str = ""    # корреспондентский счёт банка
    org_signer: str = ""          # кто подписывает документы
    # Плательщик НДС? Самозанятый и УСН — нет.
    org_vat: bool = False

    @property
    def org_ready(self) -> bool:
        """Хватает ли реквизитов, чтобы выставить счёт."""
        return bool(
            self.org_name and self.org_inn and self.org_bank_account
            and self.org_bank_bic
        )

    # Разрешённые источники CORS (csv). Пусто + dev_mode → "*"; иначе — mini_app_url.
    allowed_origins: str = ""

    # --- Платежи ---
    # ЮKassa (рубли): shop_id + секретный ключ.
    yookassa_shop_id: str = ""
    yookassa_secret_key: str = ""
    # Базовый URL для возврата после оплаты ЮKassa.
    payment_return_url: str = ""
    # 54-ФЗ: слать фискальный чек в платеже. Для САМОЗАНЯТОГО оставить False —
    # чек по НПД формируется в приложении «Мой налог», отдельная касса не нужна.
    # Включать ТОЛЬКО ИП/ООО, если касса не фискализирует сама. vat_code: 1 —
    # без НДС (самозанятый/УСН), 6 — НДС 20% и т.д.
    yookassa_send_receipt: bool = False
    yookassa_vat_code: int = 1

    # Sentry DSN (наблюдаемость). Пусто — без отправки ошибок.
    sentry_dsn: str = ""

    # Telegram-id админов (csv) — доступ к аналитике/админ-экранам.
    admin_tg_ids: str = ""

    # Хранилище фото (S3-совместимое, напр. Yandex Object Storage).
    s3_endpoint: str = ""
    s3_bucket: str = ""
    s3_key: str = ""
    s3_secret: str = ""
    s3_public_base: str = ""  # публичный базовый URL для GET (CDN/бакет)
    # Регион хранилища. Он входит в подпись запроса, и хранилище сверяет его
    # побайтово: с чужим регионом Яндекс отвечает «SignatureDoesNotMatch» —
    # ошибкой, по которой невозможно догадаться, что дело в одной строке
    # настроек. По умолчанию — регион Яндекса, потому что документация
    # проекта ведёт именно туда; для другого хранилища поменяйте.
    s3_region: str = "ru-central1"

    @property
    def s3_ready(self) -> bool:
        return bool(self.s3_endpoint and self.s3_bucket and self.s3_key)

    @property
    def yookassa_ready(self) -> bool:
        return bool(self.yookassa_shop_id and self.yookassa_secret_key)

    def assert_production_safe(self) -> None:
        """Не даём подняться в проде с дефолтными секретами/опасными флагами."""
        if self.dev_mode:
            return
        problems: list[str] = []
        if self.jwt_secret == "dev-secret-change-me":
            problems.append("JWT_SECRET не задан (используется dev-значение)")
        elif len(self.jwt_secret) < 32:
            problems.append("JWT_SECRET слишком короткий (нужно ≥32 символов)")
        if not self.internal_api_secret:
            problems.append("INTERNAL_API_SECRET не задан")
        if self.allow_insecure_telegram_auth:
            problems.append("ALLOW_INSECURE_TELEGRAM_AUTH=true в проде")
        # Без токена бота подпись Telegram не проверить, и вход отвергается у
        # ВСЕХ. Приложение при этом поднимается как ни в чём не бывало, отвечает
        # /health «ok», а люди видят «Невалидный initData» — и понять, что не
        # хватает одной строки в .env, по такому симптому невозможно. Пусть
        # лучше сервер честно не стартует и напишет причину в лог.
        if not self.telegram_bot_token:
            problems.append(
                "TELEGRAM_BOT_TOKEN не задан — вход через Telegram работать не будет"
            )
        if problems:
            raise RuntimeError(
                "Небезопасная конфигурация для прод-режима: "
                + "; ".join(problems)
            )


settings = Settings()
