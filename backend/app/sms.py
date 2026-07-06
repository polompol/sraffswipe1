"""Отправка SMS-кода. Провайдер выбирается настройкой sms_provider.

В dev-режиме реальная отправка не выполняется — код возвращается в ответе API.
Подключение реального шлюза (МТС Exolve / SMS.RU / SMSC.ru) — в send_code().
"""
import secrets

from .config import settings


def generate_code() -> str:
    # 6 цифр из криптостойкого генератора (1 000 000 комбинаций). При лимите
    # 5 попыток/мин на номер перебор занял бы сотни дней — против 4 цифр (random),
    # которые подбирались за часы.
    return f"{secrets.randbelow(1000000):06d}"


def send_code(phone: str, code: str) -> None:
    provider = settings.sms_provider
    if provider == "none" or settings.dev_mode:
        # Заглушка: в реальности здесь HTTP-запрос к шлюзу.
        print(f"[SMS:{provider}] -> {phone}: код {code}")
        return
    # Пример точки интеграции (псевдокод):
    # if provider == "exolve":
    #     httpx.post("https://api.exolve.ru/messaging/v1/SendSMS", json={...},
    #                headers={"Authorization": f"Bearer {settings.sms_api_key}"})
    # elif provider == "smsru":
    #     httpx.get("https://sms.ru/sms/send", params={...})
    raise NotImplementedError(f"SMS provider '{provider}' не настроен")
