/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_USE_BACKEND?: string;
  readonly VITE_DEV_INIT_DATA?: string;
  readonly VITE_BOT_USERNAME?: string;
  readonly VITE_PILOT_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Версия из package.json, подставляется на сборке (см. vite.config.ts). */
declare const __APP_VERSION__: string;
