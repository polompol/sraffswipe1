#!/usr/bin/env bash
# ===== StaffSwipe: запуск приложения одной командой (Mac/Linux) =====
# В терминале из папки проекта: bash start-app.sh
set -e
cd "$(dirname "$0")/tma"

if ! command -v npm >/dev/null 2>&1; then
  echo "[ОШИБКА] Node.js не установлен. Скачай LTS с https://nodejs.org и перезапусти терминал."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Первый запуск: устанавливаю зависимости, подожди 1-2 минуты..."
  npm install
fi

echo "Запускаю StaffSwipe → открой http://localhost:5173/ (Ctrl+C — остановить)"
npm run dev
