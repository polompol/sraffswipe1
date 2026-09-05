import { defineConfig } from "vite";
import pkg from "./package.json";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
// Проверка боевой сборки лежит отдельным файлом, чтобы её покрывал тест.
import { assertNotDemoBuild } from "./src/lib/buildGuard";

assertNotDemoBuild(process.env);

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
          // @tma.js — то же самое, что было @telegram-apps: библиотеку
          // переименовали. Правило по старому имени перестало совпадать с
          // чем-либо, и SDK молча уезжал в общий кусок сборки — разбиение
          // работало вхолостую, а заметить это по зелёной сборке нельзя.
          if (id.includes("@tma.js") || id.includes("valibot")) {
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
