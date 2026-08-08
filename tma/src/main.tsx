import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";

import "./theme/theme.css";
import "./index.css";
import { initTelegram } from "./telegram/sdk";
import { initTheme } from "./lib/theme";
import { track } from "./api/endpoints";
import { reportError } from "./lib/report";
import { initSentry } from "./lib/sentry";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/Toast";
import { App } from "./App";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// Глобальная видимость падений: необработанные ошибки и промисы → на backend.
window.addEventListener("error", (e) => reportError(e.error ?? e.message, "window.error"));
window.addEventListener("unhandledrejection", (e) =>
  reportError(e.reason, "unhandledrejection"),
);

void initSentry();
void initTelegram();
initTheme();
// Крупный режим (доступность) — применяем до первого рендера, если включён.
if (localStorage.getItem("ss_large") === "1") {
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
  const go = new URLSearchParams(window.location.search).get("go") ?? "";
  const path = GO_SCREENS[go];
  if (path && localStorage.getItem("ss_jwt")) {
    window.location.hash = `#${path}`;
  }
} catch {
  /* нет query — обычный запуск */
}

// «open» — один раз за сессию, чтобы не раздувать вершину воронки на перезапусках.
if (!sessionStorage.getItem("ss_open")) {
  sessionStorage.setItem("ss_open", "1");
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
