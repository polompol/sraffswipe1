"""Два предохранителя, которые есть в коде, но которых никто не сторожит.

Оба нашлись при разборе списка «исправить до запуска». Сама защита в обоих
случаях написана и работает — а вот проверки на неё нет, то есть удалить её
можно молча, и весь набор останется зелёным. Ровно так уже было с проверками
бота: код есть, тесты есть, а выполняются они нигде.
"""
import re
from pathlib import Path

from .shifttime import age_shift

COMPOSE = Path(__file__).resolve().parents[2] / "docker-compose.prod.yml"


def _service_blocks(text: str) -> dict[str, str]:
    """Разбить docker-compose на службы, без разбора YAML.

    Намеренно текстом, а не библиотекой: PyYAML в зависимостях проекта не
    объявлен, он подтягивается попутно. Тест, стоящий на случайно оказавшейся
    рядом библиотеке, однажды тихо исчезнет — сегодня я такой уже чинил.
    """
    body = text.split("\nservices:", 1)[1]
    blocks: dict[str, str] = {}
    cur = None
    for line in body.splitlines():
        # Раздел служб кончается на следующем ключе первого уровня (volumes:,
        # networks:). Без этой отсечки тома попадали в список служб.
        if re.match(r"^[A-Za-z0-9_-]+:", line):
            break
        m = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", line)
        if m:
            cur = m.group(1)
            blocks[cur] = ""
        elif cur is not None:
            blocks[cur] += line + "\n"
    return blocks


def test_production_compose_pins_the_dangerous_flags():
    """Боевая сборка обязана прибивать DEV_MODE=false, а не надеяться на .env.

    `assert_production_safe()` начинается с `if self.dev_mode: return` — один
    флаг выключает ВСЮ защиту разом: дефолтный JWT-секрет, вход в обход
    подписи Telegram, отсутствие токена бота. Сервер поднимется и будет
    отвечать «ok».

    Сейчас это не страшно: в docker-compose.prod.yml обе службы задают
    DEV_MODE явно, а значение из `environment:` перебивает любой .env — в том
    числе случайно скопированный с машины разработчика, где DEV_MODE=true.
    Вся защита держится на этих двух строчках, и до сих пор их не стерёг
    никто.
    """
    text = COMPOSE.read_text(encoding="utf-8")
    services = _service_blocks(text)
    # Отбираем по НАСТОЯЩЕЙ строке настройки, а не по подстроке: комментарий
    # «DEV_MODE=false → требует заданные секреты» стоит перед описанием службы
    # и по тексту попадает в предыдущую — и redis оказывался «нашим».
    ours = {
        name: body for name, body in services.items()
        if re.search(r"^\s+JWT_SECRET:", body, re.M)
    }
    assert ours, "в боевой сборке не нашлось ни одной службы приложения"

    for name, body in ours.items():
        assert re.search(r'DEV_MODE:\s*"false"', body), (
            f"служба {name}: DEV_MODE не прибит к false — вся проверка "
            "безопасной конфигурации отключается одной строкой в .env"
        )
        assert re.search(r'ALLOW_INSECURE_TELEGRAM_AUTH:\s*"false"', body), (
            f"служба {name}: вход в обход подписи Telegram не запрещён явно"
        )
        # `${VAR:?...}` — форма «нет значения → сборка не поднимется». Без
        # «:?» пустой секрет молча превратился бы в пустую строку.
        for secret in ("JWT_SECRET", "INTERNAL_API_SECRET"):
            assert re.search(rf"{secret}:\s*\$\{{{secret}:\?", body), (
                f"служба {name}: {secret} задан без «:?» — при пустом .env "
                "сервис поднимется с пустым секретом вместо отказа"
            )


def _match_ready_but_not_closed(client):
    """Смена, о которой договорились и которая ещё не закрыта."""
    e = client.post("/auth/telegram",
                    json={"init_data": "", "role": "employer"}).json()
    eh = {"Authorization": f"Bearer {e['access_token']}"}
    client.post("/vacancies", headers=eh, json={
        "role": "waiter", "date": "2030-05-17", "start_time": 600,
        "end_time": 1080, "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    })
    s = client.post("/auth/telegram",
                    json={"init_data": "", "role": "seeker"}).json()
    sh = {"Authorization": f"Bearer {s['access_token']}"}
    v = client.get("/vacancies", headers=sh).json()[0]
    client.post("/swipes", headers=sh, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    mid = client.post("/swipes", headers=eh, json={
        "target_id": s["user_id"], "target_type": "user", "direction": "like",
        "vacancy_id": v["id"]}).json()["match_id"]
    client.post(f"/matches/{mid}/confirm", headers=sh)
    client.post(f"/matches/{mid}/confirm", headers=eh)
    return mid, s["access_token"]


def test_act_is_refused_until_the_shift_is_closed(client, doc_token):
    """Акт — документ о ВЫПОЛНЕННОЙ работе, и до закрытия его быть не должно.

    Раньше он выдавался и по «подтверждённой» смене, то есть за неделю до
    самой работы: первичный бухгалтерский документ «услуги оказаны полностью и
    в срок» на то, чего не было, — и с ИНН обеих сторон внутри. Отказ в коде
    стоит, но проверки на него не было: тесты акта все до одного сначала
    доводят смену до закрытия, поэтому запрет не трогает ни один из них.
    """
    mid, token = _match_ready_but_not_closed(client)
    short = doc_token(client, token)

    r = client.get(f"/matches/{mid}/act.pdf", params={"token": short})
    assert r.status_code == 409, r.text
    assert "после закрытия смены" in r.json()["detail"]

    # А после закрытия — выдаётся. Иначе проверка выше доказывала бы лишь то,
    # что акт не работает никогда.
    age_shift(mid)
    eh_code = None
    e = client.post("/auth/telegram",
                    json={"init_data": "", "role": "employer"}).json()
    eh = {"Authorization": f"Bearer {e['access_token']}"}
    for m in client.get("/matches", headers=eh).json():
        if m["id"] == mid:
            eh_code = m["checkin_code"]
    sh = {"Authorization": f"Bearer {token}"}
    client.post(f"/matches/{mid}/checkin", headers=sh, json={"code": eh_code})
    client.post(f"/matches/{mid}/attendance", headers=eh, json={"attended": True})

    ok = client.get(f"/matches/{mid}/act.pdf", params={"token": short})
    assert ok.status_code == 200, ok.text


def test_every_required_secret_fails_the_launch_when_missing():
    """Пустой секрет должен ронять запуск, а не превращаться в пустую строку.

    В compose есть две формы подстановки: `${VAR:?текст}` — «нет значения,
    останавливаемся», и `${VAR:-запасное}` — «нет значения, берём запасное».
    Голая `${VAR}` — третья, самая опасная: она молча даёт пустую строку.
    Пустой пароль базы, пустое имя бота в ссылке на оплату, пустой домен в
    адресе сервера — всё это поднимется и будет выглядеть работающим.

    Обязательными считаем те, без которых сервис бессмыслен: без токена не
    войдёт ни один человек, без домена приложение стучится в никуда.
    """
    text = COMPOSE.read_text(encoding="utf-8")
    must_stop = [
        "JWT_SECRET", "INTERNAL_API_SECRET", "POSTGRES_PASSWORD",
        "TELEGRAM_BOT_TOKEN", "BOT_USERNAME", "DOMAIN",
    ]
    for name in must_stop:
        assert f"${{{name}:?" in text, (
            f"{name} нигде не объявлен через «${{{name}:?…}}» — при пустом "
            ".env боевая сборка поднимется с пустым значением вместо отказа"
        )
