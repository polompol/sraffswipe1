#!/usr/bin/env bash
# Прогон всех проверок проекта одной командой.
# Backend требует установленных зависимостей (см. backend/requirements.txt).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Backend: ruff + pytest"
cd "$ROOT/backend"
if [ -d .venv ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi
ruff check .
python -m pytest -q

echo "==> TMA: lint + typecheck + test + build"
cd "$ROOT/tma"
npm run lint
npm run typecheck
npm run test
npm run build

echo "✅ Все проверки пройдены"
