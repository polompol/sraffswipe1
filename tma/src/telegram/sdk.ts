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
  openLink as sdkOpenLink,
  openTelegramLink as sdkOpenTelegramLink,
  isTMA as sdkIsTMA,
  setMiniAppHeaderColor,
  setMiniAppBackgroundColor,
  setMiniAppBottomBarColor,
  isMiniAppDark,
  mountClosingBehavior,
  enableClosingConfirmation,
  disableClosingConfirmation,
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

  // Раскрытие — отдельно и ПЕРВЫМ делом. Раньше оно стояло после await
  // mountViewport(): приложение, открытое из кнопки уведомления, показывалось
  // в половину экрана и рывком раскрывалось через мгновение. А если
  // монтирование вьюпорта падало (это бывает при перезагрузке в разработке),
  // раскрытие не выполнялось вообще.
  try {
    expandViewport();
  } catch {
    /* noop */
  }

  try {
    await mountViewport();
    bindViewportCssVars();
  } catch {
    /* noop */
  }

  try {
    mountClosingBehavior();
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

// CloudStorage здесь больше нет намеренно. Ключ входа клали в облако
// Telegram «про запас», но не читали оттуда ни разу: при потере локального
// токена приложение молча входит заново по подписи запуска (см. silentReauth
// в api/client.ts) — это и надёжнее, и свежее. Оставалась лишняя копия
// ключа в чужом хранилище, которая никому не помогала.

// --- Открытие ссылок ---

/** Открыть внешнюю ссылку.
 *
 *  `window.open` внутри Telegram молча не срабатывает: вебвью не создаёт новых
 *  окон, а после `await` браузер вдобавок считает вызов не-пользовательским.
 *  Именно так ломалась оплата: заведение жало «Пополнить 3 000 ₽», получало
 *  вибрацию — и ничего. Пробовало ещё раз, комиссия уходила в просрочку,
 *  публикация смен блокировалась.
 */
export function openExternal(url: string): void {
  // Относительные адреса (страницы оферты рядом с приложением) SDK не примет.
  const abs = new URL(url, window.location.href).href;
  try {
    if (sdkOpenLink.isAvailable()) {
      sdkOpenLink(abs);
      return;
    }
  } catch {
    /* вне Telegram или старый клиент */
  }
  window.open(abs, "_blank", "noopener");
}

/** Открыть ссылку внутри Telegram (t.me/...). Через обычный openLink клиент
 *  открыл бы собственный домен во встроенном браузере вместо перехода в чат. */
export function openTelegram(url: string): void {
  try {
    if (sdkOpenTelegramLink.isAvailable()) {
      sdkOpenTelegramLink(url);
      return;
    }
  } catch {
    /* noop */
  }
  openExternal(url);
}

/** Запущены ли мы внутри Telegram. Вне его вход невозможен в принципе:
 *  подписи initData нет, и человек упирался в «Не удалось войти — проверьте
 *  интернет», хотя интернет ни при чём. */
export function insideTelegram(): boolean {
  try {
    return sdkIsTMA();
  } catch {
    return false;
  }
}

// --- Цвета оболочки Telegram ---

/** Покрасить шапку, фон и нижнюю панель Telegram под тему приложения.
 *
 *  Без этого фирменный кремовый экран висел в стандартной белой (или
 *  тёмно-серой) рамке Telegram: стык виден сразу, и приложение читается как
 *  «сайт в окне», а не как часть мессенджера. Особенно заметно, когда у
 *  человека тёмный Telegram, а приложение светлое.
 */
export function paintChrome(dark: boolean): void {
  const bg = dark ? "#160d0f" : "#efe7d3";      // --bg
  const bar = dark ? "#201316" : "#fffdf8";     // --surface (цвет таббара)
  try {
    if (setMiniAppHeaderColor.isAvailable()) setMiniAppHeaderColor(bg);
  } catch {
    /* старый клиент — оставит стандартную шапку */
  }
  try {
    setMiniAppBackgroundColor.ifAvailable(bg);
  } catch {
    /* noop */
  }
  try {
    setMiniAppBottomBarColor.ifAvailable(bar);
  } catch {
    /* noop */
  }
}

/** Тёмная ли тема В САМОМ TELEGRAM.
 *
 *  Не `prefers-color-scheme`: он отражает тему ТЕЛЕФОНА, а у Telegram своя
 *  настройка. Частая комбинация «телефон светлый, Telegram тёмный» давала
 *  чёрный интерфейс вокруг и кремовое приложение внутри.
 */
export function telegramDark(): boolean | null {
  // Вне Telegram сигнал темы просто отдаёт false, а не бросает исключение —
  // и приложение в обычном браузере всегда стартовало бы в светлой теме,
  // игнорируя системную. Поэтому сначала проверяем, что мы вообще внутри.
  if (!insideTelegram()) return null;
  try {
    return isMiniAppDark();
  } catch {
    return null;
  }
}

/** Подписка на смену темы в Telegram, пока приложение открыто. */
export function onTelegramThemeChange(fn: (dark: boolean) => void): () => void {
  try {
    return isMiniAppDark.sub(fn);
  } catch {
    return () => {};
  }
}

// --- Защита от случайного закрытия ---

/** Спрашивать подтверждение при закрытии, пока в форме есть несохранённое.
 *
 *  Заведение по три минуты заполняет смену (дата, время, ставка, адрес,
 *  описание), задевает крестик — и всё пропадает без единого вопроса.
 */
export function guardClosing(dirty: boolean): void {
  try {
    if (dirty) enableClosingConfirmation();
    else disableClosingConfirmation();
  } catch {
    /* noop */
  }
}
