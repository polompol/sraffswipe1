import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";

import "./theme/theme.css";
import "./index.css";
import { initTelegram } from "./telegram/sdk";
import { initTheme, syncTelegramTheme } from "./lib/theme";
import { track } from "./api/endpoints";
import { reportError } from "./lib/report";
import { initSentry } from "./lib/sentry";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/Toast";
import { App } from "./App";
import { watchKeyboard } from "@/lib/keyboard";
import { LS, SS, forgetRetired } from "@/lib/storage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// Глобальная видимость падений: необработанные ошибки и промисы → на backend.
window.addEventListener("error", (e) => reportError(e.error ?? e.message, "window.error"));
window.addEventListener("unhandledrejection", (e) =>
  reportError(e.reason, "unhandledrejection"),
);

// Стираем то, что раньше сохраняли, а теперь не сохраняем (точные координаты).
// Делаем это до первого экрана: у людей, которые пользовались приложением
// раньше, старое значение лежит в телефоне и само оттуда не денется.
forgetRetired();

void initSentry();
// Тему ставим сразу, до первого кадра (иначе вспышка светлого экрана у тех, у
// кого тёмная), а после подъёма SDK уточняем её по самому Telegram.
initTheme();
void initTelegram().then(syncTelegramTheme);

// Установка на домашний экран (вне Telegram). Внутри Mini App приложение уже
// живёт в оболочке Telegram, и лишний слой там не нужен — поэтому регистрируем
// service worker, только если запуск обычный, браузерный.
if ("serviceWorker" in navigator && !window.location.hash.includes("tgWebApp")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* не поддержано или заблокировано — приложение работает как обычно */
    });
  });
}
// Крупный режим (доступность) — применяем до первого рендера, если включён.
if (localStorage.getItem(LS.large) === "1") {
  document.body.dataset.large = "1";
}
// Кнопка из уведомления бота открывает приложение с ?go=<экран>. Без этого
// человек получал «отметьтесь на смене», жал кнопку и попадал в ленту
// вакансий — искать нужный экран самому. Хэш для этого не годится: Telegram
// кладёт туда initData и наш собственный #/путь затирается.
const GO_SCREENS: Record<string, string> = {
  shifts: "/shifts",
  matches: "/matches",
  vacancies: "/vacancy/my",
  applicants: "/applicants",
  profile: "/profile",
};
try {
  const q = new URLSearchParams(window.location.search);
  const go = q.get("go") ?? "";
  // id — какую именно запись открыть. Уведомление «Новое сообщение» ведёт
  // сразу в нужный разговор, а не в общий список: искать чат заново на каждое
  // сообщение — ровно та причина, по которой переписку уводят в личку.
  // Пропускаем только безопасные идентификаторы, чтобы из ссылки нельзя было
  // подставить произвольный путь в адресе.
  const id = (q.get("id") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  const path = go === "chat" && id ? `/chat/${id}` : GO_SCREENS[go];
  if (path && localStorage.getItem(LS.jwt)) {
    window.location.hash = `#${path}`;
  }
} catch {
  /* нет query — обычный запуск */
}

// «open» — один раз за сессию, чтобы не раздувать вершину воронки на перезапусках.
if (!sessionStorage.getItem(SS.opened)) {
  sessionStorage.setItem(SS.opened, "1");
  track("open");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
          <Toaster />
        </HashRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Клавиатура закрывает низ экрана — панель ввода в чате должна подниматься
// над ней, а не прятаться под неё.
watchKeyboard();
