"""Загрузка фото в S3-совместимое хранилище через подписанную форму.

Без ключей S3 — 503 (фронт мягко деградирует к ручному вводу URL).
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, StringConstraints

from ..config import settings
from ..ratelimit import rate_limit
from ..security import current_principal

router = APIRouter(prefix="/uploads", tags=["uploads"])

_ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class PhotoUrlIn(BaseModel):
    content_type: str = "image/jpeg"
    # Первые 16 байт файла в hex — проба для проверки настоящего типа.
    # Пусто разрешаем: старые версии приложения пробу не присылают, ломать их
    # из-за этого нельзя. Как только фронт обновится, можно требовать всегда.
    head_hex: Annotated[str, StringConstraints(max_length=64)] = ""


# Потолок размера фото. Presigned PUT его не ограничивает НИКАК: ссылка
# позволяет залить в бакет файл любого размера, минуя лимит прокси в 2 МБ.
# Один пользователь мог бы забить хранилище (и счёт за него) гигабайтами.
# Presigned POST умеет условие content-length-range — его и используем.
MAX_PHOTO_BYTES = 8 * 1024 * 1024

# Первые байты файла («магическое число») — единственный надёжный признак типа.
# Заявленный клиентом content_type ничего не доказывает: назвать исполняемый
# файл «image/jpeg» может кто угодно. Хранилище проверить содержимое не может,
# поэтому сверяем на сервере ДО выдачи подписи — по короткой пробе от клиента.
_MAGIC = {
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/webp": [b"RIFF"],          # + "WEBP" на 8-й позиции, проверяем ниже
}


def _looks_like(content_type: str, head: bytes) -> bool:
    """Похоже ли начало файла на заявленный тип."""
    if not head:
        return False
    if not any(head.startswith(sig) for sig in _MAGIC.get(content_type, [])):
        return False
    if content_type == "image/webp":
        return len(head) >= 12 and head[8:12] == b"WEBP"
    return True


class PhotoUrlOut(BaseModel):
    upload_url: str      # POST сюда файл (multipart) вместе с полями ниже
    fields: dict         # поля формы от S3: их надо приложить к запросу
    public_url: str      # этот URL сохраняем в профиль/вакансию
    max_bytes: int = MAX_PHOTO_BYTES


@router.post(
    "/photo-url",
    response_model=PhotoUrlOut,
    # Каждый вызов выдаёт подписанную ссылку в хранилище. Без лимита их можно
    # было нагенерировать бесконечно и заливать по ним параллельно.
    dependencies=[Depends(rate_limit("upload", 20, 60))],
)
def photo_url(
    body: PhotoUrlIn, principal: dict = Depends(current_principal)
):
    if not settings.s3_ready:
        raise HTTPException(
            status_code=503,
            detail="Загрузка фото не настроена (нет ключей S3).",
        )
    ext = _ALLOWED.get(body.content_type)
    if ext is None:
        raise HTTPException(status_code=415, detail="Только JPEG/PNG/WebP")
    if body.head_hex:
        try:
            head = bytes.fromhex(body.head_hex)
        except ValueError:
            raise HTTPException(status_code=400, detail="Битая проба файла") from None
        if not _looks_like(body.content_type, head):
            raise HTTPException(
                status_code=415,
                detail="Это не похоже на картинку — выберите фото JPEG, PNG или WebP",
            )

    key = f"photos/{principal['id']}/{uuid.uuid4().hex}.{ext}"
    try:
        import boto3

        s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_key,
            aws_secret_access_key=settings.s3_secret,
            region_name=settings.s3_region or None,
        )
        presigned = s3.generate_presigned_post(
            Bucket=settings.s3_bucket,
            Key=key,
            Fields={"Content-Type": body.content_type},
            Conditions=[
                {"Content-Type": body.content_type},
                # Размер проверяет уже само хранилище: подделать нельзя,
                # слишком большой файл просто не примут.
                ["content-length-range", 1, MAX_PHOTO_BYTES],
            ],
            ExpiresIn=900,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="S3 недоступен") from exc

    base = settings.s3_public_base or f"{settings.s3_endpoint}/{settings.s3_bucket}"
    return PhotoUrlOut(
        upload_url=presigned["url"],
        fields=presigned["fields"],
        public_url=f"{base}/{key}",
    )
