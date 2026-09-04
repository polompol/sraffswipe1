"""Список того, что сервис говорит человеку, не должен отставать от кода.

Список собирается из кода (scripts/texts.py), а не пишется руками — именно
потому, что рукописный расходится с кодом на второй неделе: правят в одном
месте, забывают в другом, и документ начинает врать.

Но собранный однажды он тоже устареет, если о нём забыть. Здесь проверяется
ровно это: пересобери — и получится тот же файл. Если нет, значит тексты
поменяли, а список не обновили.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_catalogue_matches_the_code():
    doc = ROOT / "docs" / "ТЕКСТЫ.md"
    assert doc.exists(), (
        "список текстов пропал — соберите: python3 scripts/texts.py --write"
    )

    fresh = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "texts.py")],
        capture_output=True, text=True, timeout=60,
    )
    assert fresh.returncode == 0, fresh.stderr[-2000:]
    assert fresh.stdout.strip() == doc.read_text().strip(), (
        "тексты в коде изменились, а docs/ТЕКСТЫ.md — нет.\n"
        "Соберите заново: python3 scripts/texts.py --write"
    )


def test_the_catalogue_actually_found_things():
    """Страховка от «сборщик сломался и молча выдал пустоту»."""
    text = (ROOT / "docs" / "ТЕКСТЫ.md").read_text()
    assert text.count("\n- ") > 100, "фраз подозрительно мало — сборщик сломан?"
    # Самое важное сообщение сервиса: единственный путь человека к спору.
    assert "несостоявшуюся" in text
