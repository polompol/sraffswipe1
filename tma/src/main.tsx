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
