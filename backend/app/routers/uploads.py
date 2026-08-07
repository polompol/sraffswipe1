"""Загрузка фото в S3-совместимое хранилище через presigned PUT URL.

Без ключей S3 — 503 (фронт мягко деградирует к ручному вводу URL).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..security import current_principal

router = APIRouter(prefix="/uploads", tags=["uploads"])

_ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class PhotoUrlIn(BaseModel):
    content_type: str = "image/jpeg"


# Потолок размера фото. Presigned PUT его не ограничивает НИКАК: ссылка
# позволяет залить в бакет файл любого размера, минуя лимит прокси в 2 МБ.
# Один пользователь мог бы забить хранилище (и счёт за него) гигабайтами.
# Presigned POST умеет условие content-length-range — его и используем.
MAX_PHOTO_BYTES = 8 * 1024 * 1024


class PhotoUrlOut(BaseModel):
    upload_url: str      # POST сюда файл (multipart) вместе с полями ниже
    fields: dict         # поля формы от S3: их надо приложить к запросу
    public_url: str      # этот URL сохраняем в профиль/вакансию
    max_bytes: int = MAX_PHOTO_BYTES


@router.post("/photo-url", response_model=PhotoUrlOut)
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

    key = f"photos/{principal['id']}/{uuid.uuid4().hex}.{ext}"
    try:
        import boto3

        s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_key,
            aws_secret_access_key=settings.s3_secret,
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
