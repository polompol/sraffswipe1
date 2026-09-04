"""Ни одна проверка не должна исчезать молча.

Найдено замером, а не рассуждением. Журнал сборки на GitHub:

    459 passed, 1 skipped

а на машине разработчика тот же набор давал 472 passed. Разница — 13 проверок
бота, единственного, через что человек вообще входит в сервис. Они не
выполнялись НИ РАЗУ: файл начинается с `pytest.importorskip("aiogram")`, а
сборка ставила `requirements.txt` и четыре инструмента, среди которых aiogram
не было. Библиотеки нет — файл пропускается — галочка зелёная.

`importorskip` сам по себе не вреден: он нужен, чтобы тест не падал там, где
необязательной библиотеки нет намеренно. Вредна тишина: «пропущено» в отчёте
выглядит как «пройдено», и заметить пропажу можно только сравнив числа из двух
разных мест — чего никто никогда не делает.

Поэтому здесь список необязательных библиотек собирается ИЗ САМИХ ТЕСТОВ, а не
пишется руками: добавит кто-нибудь завтра новый `importorskip` — он попадёт
сюда сам. Список руками устарел бы первым же коммитом, и дыра вернулась бы
ровно тем же путём.
"""
import importlib.util
import re
from pathlib import Path

TESTS = Path(__file__).parent

# pytest.importorskip("имя") — с одинарными или двойными кавычками.
CALL = re.compile(r"""importorskip\(\s*["']([A-Za-z0-9_.]+)["']""")


def optional_modules() -> dict[str, list[str]]:
    """Какие библиотеки тесты считают необязательными и кто их просит."""
    found: dict[str, list[str]] = {}
    for path in sorted(TESTS.glob("test_*.py")):
        if path.name == Path(__file__).name:
            continue
        for name in CALL.findall(path.read_text(encoding="utf-8")):
            found.setdefault(name, []).append(path.name)
    return found


def test_optional_dependencies_are_actually_installed():
    """Все необязательные библиотеки на месте — значит, ничего не пропущено."""
    wanted = optional_modules()
    assert wanted, (
        "в тестах не нашлось ни одного importorskip — либо их убрали "
        "(тогда удалите и эту проверку), либо сломался разбор"
    )

    missing = {
        name: who
        for name, who in wanted.items()
        if importlib.util.find_spec(name) is None
    }
    lines = [f"  {name} — нужен для {', '.join(who)}" for name, who in missing.items()]
    assert not missing, (
        "Библиотеки нет — значит, эти проверки сейчас ПРОПУСКАЮТСЯ, а отчёт "
        "выглядит зелёным:\n" + "\n".join(lines) + "\n\n"
        "Поставьте их (для бота: pip install -r bot/requirements.txt) или "
        "уберите ненужный importorskip. Молча пропускать нельзя."
    )
