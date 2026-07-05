@echo off
rem ===== StaffSwipe: запуск приложения одним кликом (Windows) =====
rem Двойной клик по этому файлу ИЛИ в терминале VS Code: .\start-app.bat
rem Работает через cmd, поэтому не зависит от политики PowerShell.
chcp 65001 >nul
cd /d "%~dp0tma"

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ОШИБКА] Node.js не установлен или терминал открыт до установки.
  echo Скачай LTS с https://nodejs.org, установи и ПЕРЕЗАПУСТИ VS Code.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Первый запуск: устанавливаю зависимости, подожди 1-2 минуты...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ОШИБКА] npm install не прошёл. Проверь интернет и попробуй снова.
    pause
    exit /b 1
  )
)

echo.
echo Запускаю StaffSwipe... Через пару секунд откроется браузер.
echo Остановить: Ctrl+C в этом окне.
start "" http://localhost:5173/
call npm run dev
pause
