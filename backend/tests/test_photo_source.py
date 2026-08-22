"""Фото — только своё загруженное, а не ссылка на чужой сайт.

Поле фото подставляется в картинку на чужом экране. Ссылка на посторонний
сервер даёт его владельцу список всех, кто открыл карточку (IP и устройство
каждого), и возможность в любой момент подменить картинку уже после
модерации. Разрешаем только собственное хранилище и аватарку из Telegram.
"""
import app.photos as photos
from app.config import settings


def _s3_on(monkeypatch):
    monkeypatch.setattr(settings, "s3_endpoint", "https://storage.yandexcloud.net")
    monkeypatch.setattr(settings, "s3_bucket", "staffswipe-photos")
    monkeypatch.setattr(settings, "s3_key", "key")
    monkeypatch.setattr(settings, "s3_public_base", "https://cdn.staffswipe.ru")


def test_our_own_storage_is_allowed(monkeypatch):
    _s3_on(monkeypatch)
    assert photos.is_allowed_photo_url("https://cdn.staffswipe.ru/photos/u1/a.jpg")
    assert photos.is_allowed_photo_url(
        "https://staffswipe-photos.storage.yandexcloud.net/photos/u1/a.jpg"
    )
    assert photos.is_allowed_photo_url(
        "https://storage.yandexcloud.net/staffswipe-photos/photos/u1/a.jpg"
    )


def test_a_stranger_site_is_refused(monkeypatch):
    _s3_on(monkeypatch)
    assert not photos.is_allowed_photo_url("https://evil.example/track.jpg")
    # Похожий хост — не наш: cdn.staffswipe.ru.evil.example.
    assert not photos.is_allowed_photo_url(
        "https://cdn.staffswipe.ru.evil.example/a.jpg"
    )


def test_telegram_avatar_is_allowed(monkeypatch):
    """Аватарку приложение получает от самого Telegram при входе."""
    _s3_on(monkeypatch)
    assert photos.is_allowed_photo_url("https://t.me/i/userpic/320/abc.jpg")
    assert photos.is_allowed_photo_url("https://cdn4.telesco.pe/file/abc.jpg")


def _s3_off(monkeypatch):
    monkeypatch.setattr(settings, "s3_endpoint", "")
    monkeypatch.setattr(settings, "s3_bucket", "")
    monkeypatch.setattr(settings, "s3_key", "")


def test_without_storage_in_development_nothing_is_forbidden(monkeypatch):
    """В разработке хранилища обычно нет, а фото ставить надо."""
    _s3_off(monkeypatch)
    monkeypatch.setattr(settings, "dev_mode", True)
    assert photos.is_allowed_photo_url("https://images.unsplash.com/photo-1.jpg")


def test_without_storage_in_production_strangers_are_still_refused(monkeypatch):
    """Дыра была ровно здесь.

    S3 необязателен, и docs/ПУСК.md прямо описывает запуск без него — то есть
    боевой сервер принимал любой чужой адрес. Загружать при этом всё равно
    некуда, значит любой адрес тут именно что чужой.
    """
    _s3_off(monkeypatch)
    monkeypatch.setattr(settings, "dev_mode", False)
    assert not photos.is_allowed_photo_url("https://images.unsplash.com/photo-1.jpg")
    assert not photos.is_allowed_photo_url("https://evil.example/track.jpg")
    # Аватарка Telegram остаётся: другого источника у неё нет, и приходит она
    # не от пользователя, а от самого Telegram при входе.
    assert photos.is_allowed_photo_url("https://t.me/i/userpic/320/abc.jpg")
    assert photos.is_allowed_photo_url(""), "пусто = «фото нет»"


def test_not_a_web_address_is_refused(monkeypatch):
    _s3_on(monkeypatch)
    assert not photos.is_allowed_photo_url("javascript:alert(1)")
    assert not photos.is_allowed_photo_url("data:image/png;base64,AAA")
    assert photos.is_allowed_photo_url(""), "пусто = «фото нет»"


def _auth(client, role):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def test_profile_refuses_a_stranger_photo(client, monkeypatch):
    _s3_on(monkeypatch)
    h, _ = _auth(client, "seeker")
    r = client.put("/me", headers=h, json={"photo_url": "https://evil.example/a.jpg"})
    assert r.status_code == 400
    r = client.put("/me", headers=h, json={
        "photo_url": "https://cdn.staffswipe.ru/photos/u1/a.jpg"
    })
    assert r.status_code == 200


def test_venue_refuses_a_stranger_photo(client, monkeypatch):
    _s3_on(monkeypatch)
    h, _ = _auth(client, "employer")
    r = client.put("/me", headers=h, json={"photo_url": "https://evil.example/a.jpg"})
    assert r.status_code == 400


def test_shift_interior_photo_is_checked_too(client, monkeypatch):
    """Фото интерьера видит вся лента — там та же слежка за зрителями."""
    from datetime import UTC, datetime, timedelta

    _s3_on(monkeypatch)
    h, _ = _auth(client, "employer")
    day = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    shift = {
        "role": "waiter", "date": day, "start_time": 600, "end_time": 1080,
        "rate": 400, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61,
    }
    r = client.post("/vacancies", headers=h, json={
        **shift, "interior_photo_url": "https://evil.example/a.jpg"
    })
    assert r.status_code == 400
    r = client.post("/vacancies", headers=h, json={
        **shift, "interior_photo_url": "https://cdn.staffswipe.ru/photos/e1/a.jpg"
    })
    assert r.status_code == 201
