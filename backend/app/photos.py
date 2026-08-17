"""Откуда разрешено брать фото профиля, заведения и интерьера.

Поле фото — это просто строка с адресом, и она подставляется в картинку на
чужом экране. Проверка «начинается на https://» отсекала только совсем грубые
подделки (`javascript:`, `data:`), но не главное: адрес мог вести на ЛЮБОЙ
чужой сайт. Отсюда три беды сразу.

1. Слежка. Картинка грузится с чужого сервера, и владелец этого сервера видит
   IP-адрес и устройство каждого, кто открыл карточку. Достаточно опубликовать
   смену — и собираешь список всех, кто её посмотрел.
2. Подмена. Модерацию проходит приличное фото, а потом по тому же адресу
   кладётся что угодно. В приложении ничего не менялось — картинка «та же».
3. Чужой трафик и мёртвые картинки: адрес живёт на чужом сервере, и когда тот
   ляжет, у половины карточек пропадут фото.

Поэтому фото принимаем только из своего хранилища (S3/CDN) плюс аватарка из
самого Telegram — её приложение получает при входе, и другого источника у неё
нет. Пока хранилище не настроено, ограничение не действует: иначе фото
поставить было бы нечем вообще.
"""
from urllib.parse import urlparse

from .config import settings

# Аватарка из Telegram приходит с их же CDN — это не сторонний сайт.
_TELEGRAM_HOSTS = ("t.me", "telegram.org", "telesco.pe", "telegram.me")


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def _own_hosts() -> set[str]:
    """Хосты нашего хранилища: публичный базовый адрес, эндпоинт и бакет-хост."""
    hosts: set[str] = set()
    for raw in (settings.s3_public_base, settings.s3_endpoint):
        h = _host(raw)
        if h:
            hosts.add(h)
    # Адресация «бакет как поддомен»: bucket.storage.yandexcloud.net.
    endpoint_host = _host(settings.s3_endpoint)
    if endpoint_host and settings.s3_bucket:
        hosts.add(f"{settings.s3_bucket}.{endpoint_host}")
    return hosts


def is_allowed_photo_url(url: str) -> bool:
    """Можно ли сохранить этот адрес фото."""
    if not url:
        return True  # пусто = «фото нет», это всегда допустимо
    scheme = urlparse(url).scheme.lower()
    if scheme not in ("http", "https"):
        return False
    host = _host(url)
    if not host:
        return False
    if any(host == t or host.endswith("." + t) for t in _TELEGRAM_HOSTS):
        return True
    # Хранилища ещё нет — значит и загружать некуда: не запрещаем ничего,
    # иначе профиль остался бы вообще без фото.
    if not settings.s3_ready:
        return True
    return host in _own_hosts()
