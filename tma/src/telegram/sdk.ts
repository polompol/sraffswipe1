// Тонкая обёртка над @telegram-apps/sdk-react (v3). Вся работа с Telegram —
// только здесь, чтобы при смене версии править одно место. Все вызовы
// защищены try/catch: приложение должно открываться и вне Telegram (dev).

import {
  init as sdkInit,
  miniAppReady,
  mountMiniAppSync,
  mountThemeParamsSync,
  bindThemeParamsCssVars,
  mountViewport,
  expandViewport,
  mountSwipeBehavior,
  disableVerticalSwipes,
  bindViewportCssVars,
  backButton,
  hapticFeedback,
  retrieveRawInitData,
  retrieveLaunchParams,
  shareURL,
  showPopup,
  isPopupSupported,
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
    // Приложение свайповое, и вертикальный свайп в Telegram закрывает
    // мини-апп. Потянул карточку чуть вниз при свайпе — и вместо отклика
    // приложение схлопнулось, а человек не понял, что произошло.
    // Отключаем закрытие свайпом: выйти по-прежнему можно крестиком.
    mountSwipeBehavior();
    disableVerticalSwipes();
  } catch {
    /* noop */
  }

  try {
    backButton.mount();
  } catch {
    /* noop */
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

/** Метка запуска из ссылки t.me/<bot>?startapp=<param> (кампании/рефералы).
 *  В Telegram берётся из launch params; в dev/браузере — из ?startapp= в URL. */
export function startParam(): string {
  try {
    const lp = retrieveLaunchParams() as {
      tgWebAppStartParam?: string;
    };
    if (lp.tgWebAppStartParam) return lp.tgWebAppStartParam;
  } catch {
    /* вне Telegram */
  }
  try {
    return new URLSearchParams(window.location.search).get("startapp") ?? "";
  } catch {
    return "";
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

// --- Подтверждение действия ---

/** Родное окно подтверждения Telegram. Браузерный `confirm` внутри Mini App
 *  выглядит чужеродно — серое системное окно поверх фирменного экрана, причём
 *  в момент ответственного решения (неявка, спор, снятие смены). Вне Telegram
 *  и на старых клиентах откатываемся на `confirm`, чтобы поток не сломался. */
export async function confirmAction(
  message: string,
  confirmText = "Да",
): Promise<boolean> {
  try {
    if (isPopupSupported()) {
      const id = await showPopup({
        message,
        buttons: [
          { id: "ok", type: "default", text: confirmText },
          { id: "cancel", type: "cancel" },
        ],
      });
      return id === "ok";
    }
  } catch {
    /* не поддержано — падаем в обычный confirm */
  }
  return window.confirm(message);
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
