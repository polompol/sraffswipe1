import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";

import "./theme/theme.css";
import "./index.css";
import { initTelegram } from "./telegram/sdk";
import { initTheme } from "./lib/theme";
import { track } from "./api/endpoints";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { App } from "./App";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

void initTelegram();
initTheme();
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
        </HashRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
