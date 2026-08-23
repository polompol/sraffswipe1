import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { API_PORT, API_URL, APP_PORT, APP_URL } from "./harness/env";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const TMP = resolve(here, ".tmp");

/** Своя база на каждый прогон — с уникальным именем, а не «стереть прошлую».
 *
 *  Настройка Playwright загружается заново в каждом рабочем процессе, и
 *  «стереть прошлую» срабатывало бы посреди прогона: у живого сервера
 *  исчезал файл базы, и он отвечал «база только для чтения» на каждую запись.
 *  Уникальное имя снимает вопрос совсем — стирать нечего.
 *
 *  Отдельная база нужна потому, что сквозной путь доводит смены до закрытия и
 *  до списания комиссии: повторный прогон на тех же данных проверял бы уже не
 *  то, что написано в тесте.
 */
mkdirSync(TMP, { recursive: true });
const DB_FILE = resolve(TMP, `e2e-${Date.now()}-${process.pid}.db`);

// Прибираем базы прошлых прогонов — но только заведомо старые. Свежие мог
// создать соседний процесс этого же запуска, и трогать их нельзя.
const HOUR = 60 * 60 * 1000;
for (const name of readdirSync(TMP)) {
  const file = resolve(TMP, name);
  try {
    if (Date.now() - statSync(file).mtimeMs > HOUR) rmSync(file, { force: true });
  } catch {
    /* файл уже убрал кто-то другой — и хорошо */
  }
}

export default defineConfig({
  testDir: "./tests",
  // Тесты одного прогона делят один сервер и одну базу, поэтому идут по
  // очереди: параллельные мешали бы друг другу счётчиками и деньгами.
  workers: 1,
  fullyParallel: false,
  // На CI бывает медленный холодный старт — даём запас, но не бесконечный:
  // зависший тест должен падать, а не висеть до конца задания.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: APP_URL,
    // Телефон, а не десктоп: приложение живёт внутри Telegram на телефоне.
    ...devices["Pixel 5"],
    // Следы только у упавших: иначе каталог отчёта растёт на сотни мегабайт.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [{ name: "телефон", use: {} }],

  webServer: [
    {
      // Настоящий бэкенд на своей базе. Режим разработки нужен ровно для
      // одного: вход без подписи Telegram — в браузере её взять негде.
      command:
        `python -m uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: resolve(root, "backend"),
      url: `${API_URL}/health`,
      // Свой сервер всегда, даже если порт занят: чужой процесс работал бы на
      // чужой базе, и тест проверял бы неизвестно что.
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
      env: {
        DATABASE_URL: `sqlite:///${DB_FILE}`,
        DEV_MODE: "true",
        ALLOW_INSECURE_TELEGRAM_AUTH: "true",
        // Нулевой tg_id — оператор: им ходит проверка денег в конце пути.
        ADMIN_TG_IDS: "0",
        JWT_SECRET: "e2e-secret-not-for-production",
        INTERNAL_API_SECRET: "e2e-internal-secret",
        ALLOWED_ORIGINS: APP_URL,
      },
    },
    {
      // Собранное приложение, а не dev-сервер: проверяем то, что уедет на
      // сервер, вместе с расщеплением бандла и ленивой загрузкой экранов.
      command:
        `npm run build && npx vite preview --host 127.0.0.1 --port ${APP_PORT}`,
      cwd: resolve(root, "tma"),
      url: APP_URL,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 180_000,
      env: {
        VITE_USE_BACKEND: "true",
        VITE_API_BASE_URL: API_URL,
      },
    },
  ],
});
