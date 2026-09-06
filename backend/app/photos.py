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
нет.

Отдельно про случай «хранилище не настроено». Раньше запрет в нём просто
отключался — и это была дыра ровно там, где она опаснее всего: S3 не обязателен,
инструкция по запуску прямо описывает работу без него, а значит боевой сервер
принимал любой чужой адрес. Теперь послабление действует только в режиме
разработки. На бою без хранилища остаётся аватарка Telegram и буква названия —
загружать всё равно некуда, так что ничего рабочего это не ломает.
"""
import logging
import posixpath
from urllib.parse import unquote, urlparse

from .config import settings

_log = logging.getLogger("staffswipe")

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


def is_allowed_photo_url(url: str, owner_id: str = "") -> bool:
    """Можно ли сохранить этот адрес фото.

    `owner_id` — чьё это фото. Хранилище одно на всех, и адрес чужой картинки
    видно в обычной ленте, поэтому мало проверить хост: без проверки пути
    любой мог поставить себе чужую фотографию из того же бакета и выйти на
    смену под чужим лицом. Файлы кладутся в папку владельца
    (`photos/<id>/...`, см. routers/uploads.py) — её и сверяем.
    """
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
    if not settings.s3_ready:
        # В разработке хранилища обычно нет, а фото ставить надо — пускаем.
        # На бою — нет: загружать некуда, значит любой адрес здесь чужой.
        return bool(settings.dev_mode)
    if host not in _own_hosts():
        return False
    path = _clean_path(url)
    prefix = _bucket_prefix(host)
    # Имя бакета обязано быть в пути, если хост — общий эндпоинт облака.
    if not path.startswith(prefix):
        return False
    return not owner_id or path.startswith(f"{prefix}photos/{owner_id}/")


def _bucket_prefix(host: str) -> str:
    """С чего обязан начинаться путь НАШЕГО файла на этом хосте.

    Голый эндпоинт облака (storage.yandexcloud.net) общий для ВСЕХ его
    клиентов, а не наш. Он попадал в белый список хостов, и имя бакета в пути
    никто не проверял: адрес вида
    https://storage.yandexcloud.net/<ЧУЖОЙ-БАКЕТ>/photos/<мой-id>/x.jpg
    считался «нашим хранилищем». Свой бакет в том же облаке заводится за
    десять минут — и обе беды из шапки этого файла возвращались целиком:
    слежка за всеми, кто открыл карточку, и подмена картинки после модерации.

    Совсем убрать этот хост нельзя: когда s3_public_base не задан, наш
    собственный адрес именно такой (см. routers/uploads.py — база собирается
    как «эндпоинт/бакет»). Поэтому не запрет хоста, а требование имени бакета.
    """
    if settings.s3_bucket and host == _host(settings.s3_endpoint):
        return f"/{settings.s3_bucket}/"
    return "/"


def _clean_path(url: str) -> str:
    """Путь так, как его увидит БРАУЗЕР: со схлопнутыми «..».

    Проверка папки владельца искала вхождение подстроки «/photos/<id>/» в
    сыром пути. Адрес /photos/<мой-id>/../<чужой-id>/face.jpg её проходил:
    подстрока на месте. А браузер по правилам разбора адреса «..» схлопывает
    и грузит ЧУЖОЙ файл — человек выходил на смену под чужим лицом, ровно то,
    ради чего проверка папки и написана.

    unquote — потому что «..» приезжает и в процентной записи (%2e%2e).
    """
    raw = unquote(urlparse(url).path)
    return posixpath.normpath(raw) if raw else "/"


def delete_stored_photos(owner_id: str) -> int:
    """Удалить из хранилища все файлы человека. Возвращает число удалённых.

    Нужно для удаления данных по заявлению (152-ФЗ). Раньше стирались только
    ССЫЛКИ на фото в базе, а сами файлы оставались лежать в бакете: человек
    просил удалить его данные, получал ответ «удалили», а фотография никуда
    не девалась и открывалась по прямой ссылке. Ссылка неугадываемая, но
    закон говорит про хранение, а не про удобство поиска.

    Сбой хранилища не должен ронять всю операцию: остальное (профиль,
    переписка, свайпы) стереть важнее, поэтому здесь мы только сообщаем
    в лог. Файлы лежат в папке владельца — см. routers/uploads.py.
    """
    if not settings.s3_ready:
        return 0
    try:
        import boto3

        s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_key,
            aws_secret_access_key=settings.s3_secret,
            region_name=settings.s3_region or None,
        )
        removed = 0
        token = None
        while True:
            page = s3.list_objects_v2(
                Bucket=settings.s3_bucket,
                Prefix=f"photos/{owner_id}/",
                **({"ContinuationToken": token} if token else {}),
            )
            keys = [{"Key": o["Key"]} for o in page.get("Contents", [])]
            if keys:
                s3.delete_objects(
                    Bucket=settings.s3_bucket, Delete={"Objects": keys}
                )
                removed += len(keys)
            token = page.get("NextContinuationToken")
            if not token:
                return removed
    except Exception as exc:  # noqa: BLE001 — хранилище не должно рвать стирание
        _log.warning("Не удалось удалить фото %s из хранилища: %s", owner_id, exc)
        return 0
