import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const APP_PORT = 4181;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;

export default defineConfig({
  testDir: "./screens",
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: APP_URL,
    ...devices["Pixel 5"],
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${APP_PORT}`,
    cwd: resolve(root, "tma"),
    url: APP_URL,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 180_000,
    env: {
      VITE_USE_BACKEND: "false",
    },
  },
});
