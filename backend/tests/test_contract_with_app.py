"""Приложение не должно читать поля, которых сервер не шлёт.

Такая ошибка не ломает ни сборку, ни тесты: на экране просто пусто. Хуже
того, на демо-данных всё выглядит правильно — mock их заполняет, — и
разработчик видит рабочий экран, а живой человек пустой. В этом проекте так
уже случалось дважды: пропала надёжность работников на экране «Мои
работники», и четыре поля (время сообщения, id работника в мэтче и другие)
годами жили в типах, не приходя с сервера ни разу.

Проверка простая: у пар «модель ответа сервера ↔ тип приложения» набор полей
приложения должен укладываться в то, что сервер действительно отдаёт. Имена
сверяем с поправкой на переименование snake_case → camelCase, которое делает
клиент (см. tma/src/api/client.ts).
"""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "tma" / "src"

# Пары: модель ответа на сервере ↔ тип в приложении.
PAIRS = [
    ("CandidateOut", "Seeker"),
    ("VacancyOut", "Vacancy"),
    ("MatchOut", "MatchModel"),
    ("MessageOut", "Message"),
    ("MeOut", "Me"),
    ("ApplicantOut", "Applicant"),
    ("WorkerOut", "Worker"),
    ("AdminUserOut", "AdminUser"),
    ("RevenueOut", "AdminRevenue"),
]


def _camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(p.title() for p in tail)


def _server_models() -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for path in (ROOT / "backend" / "app").rglob("*.py"):
        text = path.read_text()
        for m in re.finditer(
            r"class (\w+)\(BaseModel\):(.*?)(?=\nclass |\n@|\ndef |\Z)", text, re.S
        ):
            fields = set(re.findall(r"^\s{4}(\w+)\s*:", m.group(2), re.M))
            # Явные алиасы сериализации — тоже имена «на проводе».
            fields |= set(
                re.findall(r'(?:serialization_alias|alias)="(\w+)"', m.group(2))
            )
            if fields:
                out[m.group(1)] = fields
    return out


def _app_types() -> dict[str, set[str]]:
    text = "\n".join(
        (APP / rel).read_text() for rel in ("api/endpoints.ts", "types/domain.ts")
    )
    out: dict[str, set[str]] = {}
    for m in re.finditer(
        r"export interface (\w+)(?: extends [\w<>, ]+)?\s*\{(.*?)\n\}", text, re.S
    ):
        fields = set(re.findall(r"^\s*(\w+)\??:", m.group(2), re.M))
        if fields:
            out[m.group(1)] = fields
    return out


@pytest.mark.parametrize(("model", "iface"), PAIRS)
def test_app_reads_only_what_server_sends(model: str, iface: str) -> None:
    server, app = _server_models(), _app_types()
    # Пара, которую не нашли, — не повод промолчать: переименовали одну
    # сторону, и проверка перестала бы что-либо проверять.
    assert model in server, f"на сервере нет модели {model} — обновите список пар"
    assert iface in app, f"в приложении нет типа {iface} — обновите список пар"

    sent = {_camel(f) for f in server[model]} | server[model]
    # Поля, собираемые в приложении из нескольких серверных (или чисто
    # экранные), перечисляются здесь явно — с объяснением, откуда они.
    known_local: dict[str, set[str]] = {
        "Seeker": {"availableToday"},   # считается сервером, но имя совпадает
    }
    ghosts = sorted(app[iface] - sent - known_local.get(iface, set()))
    assert not ghosts, (
        f"{iface} читает поля, которых {model} не отдаёт: {ghosts}. "
        "На экране будет пусто, а на демо-данных — правильно."
    )
