import { defineConfig } from "vite";
import pkg from "./package.json";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

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
  },
});
