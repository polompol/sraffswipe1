"""Конфигурация приложения (читается из окружения / .env)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./staffswipe.db"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    jwt_secret: str = "dev-secret-change-me"
    jwt_alg: str = "HS256"
    jwt_ttl_hours: int = 168
    initdata_ttl_hours: int = 24
    # Fail-safe: development behaviour must never be enabled by accident.
    # Tests/local development explicitly set DEV_MODE=true in their environment.
    dev_mode: bool = False
    sms_provider: str = "none"
    sms_api_key: str = ""
    dadata_token: str = ""
    telegram_bot_token: str = ""
    mini_app_url: str = ""
    bot_username: str = "staffswipe_bot"
    commission_pct: int = 10
    commission_min_rub: int = 0
    commission_due_days: int = 7
    late_cancel_hours: int = 6
    business_tz: str = "Europe/Moscow"
    allow_insecure_telegram_auth: bool = False
    internal_api_secret: str = ""
    yookassa_webhook_secret: str = ""
    redis_url: str = ""
    org_name: str = ""
    org_inn: str = ""
    org_kpp: str = ""
    org_ogrn: str = ""
    org_address: str = ""
    org_bank_name: str = ""
    org_bank_bic: str = ""
    org_bank_account: str = ""
    org_corr_account: str = ""
    org_signer: str = ""
    org_vat: bool = False

    @property
    def org_ready(self) -> bool:
        return bool(
            self.org_name and self.org_inn and self.org_bank_account
            and self.org_bank_bic
        )

    allowed_origins: str = ""
    yookassa_shop_id: str = ""
    yookassa_secret_key: str = ""
    payment_return_url: str = ""
    yookassa_send_receipt: bool = False
    yookassa_vat_code: int = 1
    sentry_dsn: str = ""
    admin_tg_ids: str = ""
    s3_endpoint: str = ""
    s3_bucket: str = ""
    s3_key: str = ""
    s3_secret: str = ""
    s3_public_base: str = ""
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
