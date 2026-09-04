#!/bin/bash
# Стартовый хук Claude Code on the web: ставит зависимости backend + TMA,
# чтобы тесты и линтеры работали с первой минуты сессии.
# Локально (не в веб-окружении) ничего не делает.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "[hook] Backend: pip install (requirements + ruff + pytest)"
# Fallback --ignore-installed: в контейнере часть пакетов может стоять через
# apt (debian), и pip не может их обновить обычным способом. После fallback
# принудительно возвращаем зафиксированные версии (--force-reinstall --no-deps),
# чтобы не разъехались fastapi/pydantic.
python3 -m pip install -q --disable-pip-version-check \
  -r backend/requirements.txt ruff pytest \
  || {
    python3 -m pip install -q --disable-pip-version-check --ignore-installed \
      -r backend/requirements.txt ruff pytest
    python3 -m pip install -q --disable-pip-version-check \
      --force-reinstall --no-deps -r backend/requirements.txt
  }

echo "[hook] TMA: npm install"
(cd tma && npm install --no-audit --no-fund)

echo "[hook] Готово: pytest/ruff и npm-скрипты доступны."
