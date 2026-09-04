#!/usr/bin/env python3
"""Собрать всё, что сервис говорит человеку ВНЕ приложения, в один список.

Зачем. Текст на экране найти просто: увидел фразу — открой файл этого экрана.
А сообщение, пришедшее в Telegram, найти нельзя ничем: оно просто пришло, и
где оно написано — не видно. Таких текстов около полусотни, и это самый
слышимый голос сервиса: их читают, когда приложение закрыто.

Список СОБИРАЕТСЯ ИЗ КОДА, а не пишется руками. Список текстов, который ведут
отдельно, расходится с кодом на второй неделе: правят в одном месте, забывают
в другом, и документ начинает врать. Здесь врать нечему — он всегда такой же,
как код.

    python3 scripts/texts.py          # напечатать
    python3 scripts/texts.py --write  # записать в docs/ТЕКСТЫ.md
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _texts(src: str, call: str) -> list[tuple[int, str]]:
    """Найти строки, переданные в вызов `call`, вместе с номером строки."""
    out: list[tuple[int, str]] = []
    for m in re.finditer(rf"{call}\(", src):
        # Берём кусок до конца вызова и вытаскиваем из него строковые литералы.
        chunk = src[m.start():m.start() + 900]
        depth, end = 0, len(chunk)
        for i, ch in enumerate(chunk):
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        body = chunk[:end]
        # Обрезаем на первом именованном аргументе: дальше идут подпись кнопки
        # и служебные слова (screen="shifts"), а не то, что читает человек.
        # Без этого в текст попадало «Открыть сменуshifts».
        cut = min(
            (body.find(k) for k in ("open_app=", "screen=", "ident=", "kind=",
                                    "note=", "reply_markup=")
             if body.find(k) != -1),
            default=len(body),
        )
        parts = re.findall(r'"((?:[^"\\]|\\.)*)"', body[:cut])
        text = "".join(parts).strip()
        if len(text) > 15 and re.search(r"[А-Яа-яЁё]", text):
            line = src[:m.start()].count("\n") + 1
            out.append((line, text))
    return out


def collect() -> dict[str, list[tuple[str, int, str]]]:
    groups: dict[str, list[tuple[str, int, str]]] = {
        "Что пишет сам бот": [],
        "Что приходит человеку в Telegram": [],
        "Что сервис пишет в чат смены": [],
        "Что человек видит вместо отказа": [],
    }
    bot = ROOT / "backend" / "bot" / "main.py"
    if bot.exists():
        src = bot.read_text()
        for call in ("send_typed", "message.answer"):
            for line, t in _texts(src, re.escape(call)):
                groups["Что пишет сам бот"].append(("bot/main.py", line, t))

    for p in sorted((ROOT / "backend" / "app").rglob("*.py")):
        src = p.read_text()
        rel = str(p.relative_to(ROOT / "backend"))
        for line, t in _texts(src, "notify_owner"):
            groups["Что приходит человеку в Telegram"].append((rel, line, t))
        for line, t in _texts(src, "sys_message"):
            groups["Что сервис пишет в чат смены"].append((rel, line, t))
        for m in re.finditer(r'detail=\s*\n?\s*((?:f?"(?:[^"\\]|\\.)*"\s*\n?\s*)+)', src):
            text = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))).strip()
            if len(text) > 15 and re.search(r"[А-Яа-яЁё]", text):
                line = src[:m.start()].count("\n") + 1
                groups["Что человек видит вместо отказа"].append((rel, line, text))

        # Отказ, вынесенный в константу, — тоже отказ.
        #
        # Сборщик читал только те тексты, что написаны прямо в detail=. Стоило
        # одну фразу вынести в модульную константу (а выносят её именно тогда,
        # когда она нужна В НЕСКОЛЬКИХ местах, то есть встречается человеку
        # чаще прочих) — и она исчезала из каталога. Каталог при этом
        # оставался зелёным: он не знает, что чего-то не увидел.
        consts = dict(
            re.findall(
                r'^(_[A-Z][A-Z0-9_]*)\s*=\s*\(\s*\n((?:\s*"(?:[^"\\]|\\.)*"\s*\n)+)\s*\)',
                src, re.M,
            )
        )
        consts.update(
            re.findall(r'^(_[A-Z][A-Z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*")\s*$', src, re.M)
        )
        for m in re.finditer(r"detail=(_[A-Z][A-Z0-9_]*)", src):
            raw = consts.get(m.group(1))
            if raw is None:
                continue
            text = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', raw)).strip()
            if len(text) > 15 and re.search(r"[А-Яа-яЁё]", text):
                line = src[:m.start()].count("\n") + 1
                groups["Что человек видит вместо отказа"].append((rel, line, text))
    return groups


def render(groups: dict[str, list[tuple[str, int, str]]]) -> str:
    total = sum(len(v) for v in groups.values())
    out = [
        "# Что сервис говорит человеку",
        "",
        "Собрано из кода командой `python3 scripts/texts.py --write`.",
        "**Руками не править** — правьте в коде, файл и строка указаны у каждой",
        "фразы, потом соберите список заново.",
        "",
        f"Всего фраз: {total}.",
        "",
        "Текст на экране сюда не входит: его искать просто — увидели фразу,",
        "откройте файл этого экрана. А сообщение в Telegram найти иначе нельзя:",
        "оно просто пришло, и откуда — не видно.",
        "",
        "Чтобы найти любую фразу приложения, включая экранную:",
        "",
        "```sh",
        "grep -rn \"часть фразы\" backend/app backend/bot tma/src",
        "```",
        "",
        "**Чего здесь нет.** Фразы, собранные из кусков на ходу (например",
        "дайджест «Смены рядом» и утренние напоминания — они склеиваются из",
        "названия должности, даты и адреса), сюда не попадают: готового текста в",
        "коде нет, он появляется только в момент отправки. Их искать тем же",
        "grep по узнаваемому куску.",
        "",
        "Многоточие «…» на месте подставляемого значения: суммы, имени, даты.",
        "",
    ]
    for name, rows in groups.items():
        if not rows:
            continue
        out.append(f"## {name} ({len(rows)})")
        out.append("")
        for rel, line, text in rows:
            # Подставляемые значения показываем многоточием: «Баланс пополнен
            # на {body.amount_rub} ₽» — это код, а читать список будет человек.
            body = re.sub(r"\{[^}]*\}", "…", text)
            body = body.replace("\\n", " ").replace("  ", " ").strip()
            out.append(f"- {body}")
            out.append(f"  <sub>{rel}:{line}</sub>")
        out.append("")
    return "\n".join(out)


def main() -> None:
    doc = render(collect())
    if "--write" in sys.argv:
        target = ROOT / "docs" / "ТЕКСТЫ.md"
        target.write_text(doc)
        print(f"Записано: {target.relative_to(ROOT)}")
    else:
        print(doc)


if __name__ == "__main__":
    main()
