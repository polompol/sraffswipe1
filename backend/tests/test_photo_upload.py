"""Загрузка фото в хранилище — от подписи до файла в бакете.

Фото — не украшение: в приложении, где смену выбирают свайпом за секунду,
карточка без фотографии просто пролистывается. При этом путь загрузки самый
хрупкий во всём сервисе: браузер отправляет файл НАПРЯМУЮ в чужое хранилище
по подписи, которую выдал наш сервер. Ошибиться можно в регионе, в условиях
подписи, в адресе — и каждая такая ошибка выглядит одинаково: «не грузится».

Поэтому здесь настоящий S3-сервер (moto), а не заглушка: подпись реально
проверяется, файл реально долетает.
"""
import io

import pytest

BUCKET = "staffswipe-photos"
REGION = "ru-central1"
JPEG_HEAD = b"\xff\xd8\xff\xe0\x00\x10JFIF"


@pytest.fixture()
def s3(monkeypatch):
    """Поднимаем S3-совместимое хранилище в памяти и настраиваем на него сервис."""
    moto = pytest.importorskip("moto")
    import boto3

    from app.config import settings

    with moto.mock_aws():
        client = boto3.client(
            "s3",
            region_name=REGION,
            aws_access_key_id="test-key",
            aws_secret_access_key="test-secret",
        )
        client.create_bucket(
            Bucket=BUCKET,
            CreateBucketConfiguration={"LocationConstraint": REGION},
        )
        monkeypatch.setattr(settings, "s3_endpoint", "https://s3.amazonaws.com", False)
        monkeypatch.setattr(settings, "s3_bucket", BUCKET, False)
        monkeypatch.setattr(settings, "s3_key", "test-key", False)
        monkeypatch.setattr(settings, "s3_secret", "test-secret", False)
        monkeypatch.setattr(settings, "s3_region", REGION, False)
        monkeypatch.setattr(settings, "s3_public_base", "", False)
        yield client


def _auth(client):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": "seeker"}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _presign(client, headers, content_type="image/jpeg", head=JPEG_HEAD):
    return client.post("/uploads/photo-url", headers=headers, json={
        "content_type": content_type, "head_hex": head.hex(),
    })


def test_photo_actually_lands_in_the_bucket(client, s3):
    """Полный путь: подпись → отправка файла → файл лежит в хранилище."""
    import requests

    headers, uid = _auth(client)
    r = _presign(client, headers)
    assert r.status_code == 200, r.text
    data = r.json()

    # Ровно так это делает браузер: поля от хранилища ПЕРЕД файлом.
    files = {"file": ("photo.jpg", io.BytesIO(JPEG_HEAD + b"x" * 100), "image/jpeg")}
    resp = requests.post(data["upload_url"], data=data["fields"], files=files)
    assert resp.status_code in (200, 204), resp.text

    key = data["public_url"].split(f"/{BUCKET}/", 1)[-1]
    got = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
    assert got.startswith(JPEG_HEAD), "в бакете лежит именно наш файл"
    assert key.startswith(f"photos/{uid}/"), "файлы разложены по владельцам"


def test_the_size_limit_is_baked_into_the_signature(client, s3):
    """Потолок размера должен быть ВНУТРИ подписи, а не в приложении.

    Ссылка на загрузку уходит в браузер, и файл летит мимо нашего сервера —
    проверить его размер у себя уже невозможно. Поэтому условие вшивается в
    подписанную политику: подделать его нельзя, слишком большой файл хранилище
    просто не примет. Без этого один человек залил бы в бакет (и в счёт за
    него) сколько угодно гигабайт.

    Проверяем именно нашу часть — что условие в политике есть. Как хранилище
    его исполняет, за нас проверить нельзя: локальная заглушка условия
    политики не разбирает вовсе, а настоящий S3 их соблюдает.
    """
    import base64
    import json

    from app.routers.uploads import MAX_PHOTO_BYTES

    headers, _ = _auth(client)
    data = _presign(client, headers).json()
    assert data["max_bytes"] == MAX_PHOTO_BYTES

    policy = json.loads(base64.b64decode(data["fields"]["policy"]))
    limits = [c for c in policy["conditions"]
              if isinstance(c, list) and c[0] == "content-length-range"]
    assert limits == [["content-length-range", 1, MAX_PHOTO_BYTES]], (
        "размер обязан быть ограничен в самой подписи"
    )
    types = [c for c in policy["conditions"]
             if isinstance(c, dict) and "Content-Type" in c]
    assert types == [{"Content-Type": "image/jpeg"}], (
        "тип файла тоже фиксируем подписью"
    )


def test_a_disguised_file_is_rejected_before_any_signature(client, s3):
    """Не картинка — отказ ещё до выдачи ссылки.

    Заявленный тип файла не доказывает ничего: назвать что угодно «image/jpeg»
    может кто угодно, а хранилище содержимое не проверяет. Смотрим на первые
    байты сами.
    """
    headers, _ = _auth(client)
    r = _presign(client, headers, head=b"MZ\x90\x00")  # исполняемый файл
    assert r.status_code == 415
    assert "картинк" in r.json()["detail"].lower()


def test_public_url_points_at_the_uploaded_file(client, s3):
    """Адрес, который сохраняется в профиль, должен вести на этот же файл."""
    from app.config import settings

    headers, _ = _auth(client)
    data = _presign(client, headers).json()
    assert data["public_url"].startswith(
        f"{settings.s3_endpoint}/{BUCKET}/"
    ), "без отдельного публичного адреса собираем его из эндпоинта и бакета"

    # С CDN/публичным доменом адрес берётся оттуда.
    settings.s3_public_base = "https://cdn.example.ru"
    try:
        data2 = _presign(client, headers).json()
        assert data2["public_url"].startswith("https://cdn.example.ru/photos/")
    finally:
        settings.s3_public_base = ""


def test_without_keys_upload_answers_honestly(client):
    """Ключей нет — 503 и понятный текст, а не молчаливая поломка.

    Приложение на этот ответ рассчитано: предлагает вставить ссылку вручную.
    """
    headers, _ = _auth(client)
    r = _presign(client, headers)
    assert r.status_code == 503
    assert "не настроена" in r.json()["detail"].lower()
