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


class PhotoUrlOut(BaseModel):
    upload_url: str  # PUT сюда файл напрямую
    public_url: str  # этот URL сохраняем в профиль/вакансию


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
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.s3_bucket,
                "Key": key,
                "ContentType": body.content_type,
            },
            ExpiresIn=900,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="S3 недоступен") from exc

    base = settings.s3_public_base or f"{settings.s3_endpoint}/{settings.s3_bucket}"
    return PhotoUrlOut(upload_url=upload_url, public_url=f"{base}/{key}")
