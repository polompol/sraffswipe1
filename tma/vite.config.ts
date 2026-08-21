import { defineConfig } from "vite";
import pkg from "./package.json";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// БОЕВАЯ СБОРКА НЕ ДОЛЖНА СОБРАТЬСЯ НА ДЕМО-ДАННЫХ.
//
// Без backend приложение работает на выдуманных сменах — это удобно для
// показа и для локальной работы. Но если такая сборка уедет на сервер,
// поломки не будет видно вообще: приложение откроется, лента заполнится,
// люди начнут откликаться на смены, которых нет, и заведения не получат
// ни одного отклика. Никакой ошибки при этом никто не увидит.
//
// Поэтому боевая сборка (её помечает docker-compose.prod.yml) падает сразу,
// если demo-режим не выключен. Обычные сборки — локальная и в CI — этой
// проверки не касаются.
function assertNotDemoBuild(): void {
  if (process.env.PROD_BUILD !== "1") return;
  if (process.env.VITE_USE_BACKEND === "true") return;
  throw new Error(
    "Боевая сборка с демо-данными: VITE_USE_BACKEND должен быть \"true\". "
    + "Проверьте args в docker-compose.prod.yml — приложение уехало бы на "
    + "сервер с выдуманными сменами.",
  );
}

assertNotDemoBuild();

// https://vitejs.dev/config/
export default defineConfig({
  // Версия приложения в сборке: её называют в поддержке, чтобы понимать,
  // какая сборка у человека на телефоне.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  base: "./",
  build: {
    target: "es2021",
    outDir: "dist",
    rollupOptions: {
      output: {
        // Чужие библиотеки — отдельными файлами от нашего кода.
        //
        // Приложение в Telegram открывают часто и обновляют тоже часто: при
        // одном общем файле любая наша правка заставляла телефон качать
        // заново ВСЁ, включая React и остальные библиотеки, которые не
        // менялись. Теперь они лежат отдельно и берутся из памяти телефона,
        // а качается только изменившаяся часть.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-router")) return "vendor-router";
          if (id.includes("@tanstack")) return "vendor-query";
          if (id.includes("react-spring") || id.includes("use-gesture")) {
            return "vendor-motion";
          }
          if (id.includes("@telegram-apps") || id.includes("valibot")) {
            return "vendor-telegram";
          }
          if (id.includes("react-dom") || id.includes("/react/")) {
            return "vendor-react";
          }
        },
      },
    },
  },
});
