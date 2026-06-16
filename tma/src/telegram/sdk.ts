// Тонкая обёртка над @telegram-apps/sdk-react (v3). Вся работа с Telegram —
// только здесь, чтобы при смене версии править одно место. Все вызовы
// защищены try/catch: приложение должно открываться и вне Telegram (dev).

import {
  init as sdkInit,
  isTMA,
  miniAppReady,
  mountMiniAppSync,
  mountThemeParamsSync,
  bindThemeParamsCssVars,
  mountViewport,
  expandViewport,
  bindViewportCssVars,
  backButton,
  hapticFeedback,
  retrieveRawInitData,
  openInvoice,
  shareURL,
  cloudStorage,
} from "@telegram-apps/sdk-react";

let started = false;

/** Инициализация SDK и монтирование компонентов Mini App. Идемпотентно. */
export async function initTelegram(): Promise<void> {
  if (started) return;
  started = true;

  try {
    sdkInit();
  } catch {
    /* вне Telegram — продолжаем в dev-режиме */
  }

  try {
    mountMiniAppSync();
    miniAppReady();
  } catch {
    /* noop */
  }

  try {
    mountThemeParamsSync();
    bindThemeParamsCssVars();
  } catch {
    /* noop */
  }

  try {
    await mountViewport();
    bindViewportCssVars();
    expandViewport();
  } catch {
    /* noop */
  }

  try {
    backButton.mount();
  } catch {
    /* noop */
  }
}

/** Запущены ли мы внутри Telegram. */
export function insideTelegram(): boolean {
  try {
    return isTMA();
  } catch {
    return false;
  }
}

/** Сырой initData для серверной валидации (HMAC по bot-token). */
export function rawInitData(): string {
  try {
    return retrieveRawInitData() ?? "";
  } catch {
    return import.meta.env.VITE_DEV_INIT_DATA ?? "";
  }
}

// --- Тактильная отдача ---

export type Haptic =
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "warning"
  | "error"
  | "select";

export function haptic(kind: Haptic): void {
  try {
    if (kind === "success" || kind === "warning" || kind === "error") {
      hapticFeedback.notificationOccurred(kind);
    } else if (kind === "select") {
      hapticFeedback.selectionChanged();
    } else {
      hapticFeedback.impactOccurred(kind);
    }
  } catch {
    /* noop */
  }
}

// --- Кнопка «Назад» ---

export function showBackButton(onClick: () => void): () => void {
  try {
    backButton.show();
    const off = backButton.onClick(onClick);
    return () => {
      try {
        off();
        backButton.hide();
      } catch {
        /* noop */
      }
    };
  } catch {
    return () => {};
  }
}

// --- Платежи Telegram Stars ---

/** Открыть инвойс Stars. `link` — invoice link, полученный с backend. */
export async function payWithStars(link: string): Promise<string> {
  try {
    return await openInvoice(link, "url");
  } catch (e) {
    return e instanceof Error ? `failed:${e.message}` : "failed";
  }
}

// --- Шеринг для реферальной программы ---

export function share(url: string, text?: string): void {
  try {
    shareURL(url, text);
  } catch {
    /* noop */
  }
}

// --- Telegram CloudStorage (зашифрованное хранилище токена, best-effort) ---
// Дублируем JWT в CloudStorage; источник для синхронного чтения — localStorage.

type CloudApi = { setItem?: (k: string, v: string) => unknown };

export function cloudSet(key: string, value: string): void {
  try {
    (cloudStorage as CloudApi).setItem?.(key, value);
  } catch {
    /* noop */
  }
}
