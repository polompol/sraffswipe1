#!/usr/bin/env bash
# Сквозные проверки в настоящем браузере: живой бэкенд + собранное приложение.
#
# Отдельно от verify.sh нарочно: этот прогон поднимает сервер, собирает
# приложение и запускает браузер — минуты вместо секунд. verify.sh должен
# оставаться быстрым, чтобы его гоняли после каждой правки.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/e2e"

if [ ! -d node_modules ]; then
  echo "==> Ставлю Playwright"
  npm ci
fi

# Браузер: в готовом окружении он уже лежит рядом (PLAYWRIGHT_BROWSERS_PATH),
# в чистом — ставим сами. Скачивается один раз.
if [ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
  npx playwright install --with-deps chromium
fi

echo "==> Сквозные проверки в браузере"
npx playwright test "$@"
