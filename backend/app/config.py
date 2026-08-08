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
    dadata_secret: str = ""

    # --- Telegram ---
    # Токен бота (BotFather). Нужен для валидации initData и уведомлений.
    telegram_bot_token: str = ""
    # Публичный URL Mini App (для кнопки запуска и реф-ссылок).
    mini_app_url: str = ""
    # Username бота (без @) — для реферальных ссылок t.me/<bot>?startapp=...
    bot_username: str = "staffswipe_bot"
    # Бонус рефереру за приглашённого (супер-лайки).
    referral_bonus_superlikes: int = 3
    # Комиссия сервиса с закрытой смены (% от оплаты). Только УЧЁТ для счёта —
    # деньги не списываются автоматически до подключения ЮKassa. 0 = выключено.
    commission_pct: int = 10
    # Минимум комиссии за смену, ₽ (чтобы дешёвая смена не давала копейки).
    commission_min_rub: int = 0
    # Срок оплаты комиссии, дней. Неоплаченная комиссия старше срока =
    # просрочка: публикация новых вакансий блокируется до оплаты. 0 = не блокировать.
    commission_due_days: int = 7
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
        if problems:
            raise RuntimeError(
                "Небезопасная конфигурация для прод-режима: "
                + "; ".join(problems)
            )


settings = Settings()
