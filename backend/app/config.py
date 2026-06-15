"""Конфигурация приложения (читается из окружения / .env)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # По умолчанию SQLite — приложение поднимается без внешних зависимостей.
    # В проде: postgresql+psycopg://user:pass@host:5432/staffswipe (PostGIS).
    database_url: str = "sqlite:///./staffswipe.db"

    jwt_secret: str = "dev-secret-change-me"
    jwt_alg: str = "HS256"
    jwt_ttl_hours: int = 720

    # Режим разработки: код из SMS возвращается в ответе API.
    dev_mode: bool = True

    # SMS-провайдер: none|exolve|smsru|smsc (none = заглушка/dev).
    sms_provider: str = "none"
    sms_api_key: str = ""

    # DaData — проверка ИНН/ОГРН и подсказки адресов.
    dadata_token: str = ""
    dadata_secret: str = ""


settings = Settings()
