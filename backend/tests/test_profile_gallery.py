"""Галерея сохраняется целиком, но не расширяет права на чужие загрузки."""
from app.config import settings


def _profile(client, monkeypatch):
    monkeypatch.setattr(settings, "s3_endpoint", "https://storage.yandexcloud.net")
    monkeypatch.setattr(settings, "s3_bucket", "staffswipe-photos")
    monkeypatch.setattr(settings, "s3_key", "key")
    monkeypatch.setattr(settings, "s3_public_base", "https://cdn.staffswipe.ru")
    auth = client.post("/auth/telegram", json={
        "init_data": "", "role": "seeker"
    }).json()
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    base = f"https://cdn.staffswipe.ru/photos/{auth['user_id']}"
    return headers, [f"{base}/one.jpg", f"{base}/two.jpg"]


def test_gallery_roundtrip_reorder_and_remove(client, monkeypatch):
    headers, photos = _profile(client, monkeypatch)
    response = client.put("/me", headers=headers, json={"photo_urls": photos})
    assert response.status_code == 200
    assert response.json()["photoUrls"] == photos
    assert client.get("/me", headers=headers).json()["photoUrls"] == photos
    response = client.put("/me", headers=headers, json={"photo_urls": photos[::-1]})
    assert response.json()["photoUrl"] == photos[1]
    client.put("/me", headers=headers, json={"photo_urls": []})
    profile = client.get("/me", headers=headers).json()
    assert profile["photoUrls"] == []
    assert profile["photoUrl"] == ""


def test_foreign_gallery_item_cannot_partially_update_profile(client, monkeypatch):
    headers, photos = _profile(client, monkeypatch)
    client.put("/me", headers=headers, json={"name": "Анна", "photo_urls": photos})
    response = client.put("/me", headers=headers, json={
        "name": "Другое имя", "photo_urls": [photos[0],
            "https://cdn.staffswipe.ru/photos/another-user/secret.jpg"]
    })
    assert response.status_code == 400
    profile = client.get("/me", headers=headers).json()
    assert profile["name"] == "Анна"
    assert profile["photoUrls"] == photos


def test_gallery_rejects_csv_injection_and_oversized_input(client, monkeypatch):
    headers, photos = _profile(client, monkeypatch)
    for payload in [
        {"photo_urls": photos * 3},
        {"photo_url": photos[0] + ",https://evil.example/track.jpg"},
        {"photo_urls": [photos[0] + ",https://evil.example/track.jpg"]},
        {"photo_urls": photos, "photo_url": photos[0]},
    ]:
        assert client.put("/me", headers=headers, json=payload).status_code == 422
    assert client.get("/me", headers=headers).json()["photoUrls"] == []
