import { onTelegramThemeChange, paintChrome, telegramDark } from "@/telegram/sdk";

export type ThemeMode = "light" | "dark";

const KEY = "ss_theme";

function setDataTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode === "dark" ? "dark" : "";
  // Шапку, фон и нижнюю панель Telegram красим под тему приложения. Без этого
  // фирменный экран висел в стандартной рамке мессенджера, и стык было видно
  // сразу — приложение читалось как «сайт в окне», а не как часть Telegram.
  paintChrome(mode === "dark");
}

export function applyTheme(mode: ThemeMode): void {
  setDataTheme(mode);
  localStorage.setItem(KEY, mode); // явный выбор пользователя — запоминаем
}

/** Тема, выбранная пользователем вручную (или null, если ещё не выбирал). */
function savedTheme(): ThemeMode | null {
  const v = localStorage.getItem(KEY);
  return v === "dark" || v === "light" ? v : null;
}

/** Тёмная ли тема снаружи.
 *
 *  Спрашиваем САМ TELEGRAM, а не `prefers-color-scheme`. Раньше здесь стояла
 *  медиа-проверка с комментарием «Telegram прокидывает свою тему в webview» —
 *  это неверно: медиа-проверка отражает тему ТЕЛЕФОНА, а у Telegram своя
 *  настройка. Частая комбинация «телефон светлый, Telegram тёмный» давала
 *  чёрный интерфейс мессенджера вокруг и кремовое приложение внутри.
 *  Вне Telegram (браузер, разработка) откатываемся на системную тему.
 */
function outsideDark(): boolean {
  const tg = telegramDark();
  if (tg !== null) return tg;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function currentTheme(): ThemeMode {
  return savedTheme() ?? (outsideDark() ? "dark" : "light");
}

/** Тема на старте — СИНХРОННО, до первого кадра.
 *
 *  Тему Telegram на этот момент ещё не спросить (SDK поднимается асинхронно),
 *  поэтому берём явный выбор пользователя, иначе системную. Как только SDK
 *  готов, syncTelegramTheme() уточнит. Делать это только после SDK нельзя:
 *  человек с тёмной темой увидел бы вспышку светлого экрана.
 *
 *  Автоопределённую тему НЕ сохраняем, чтобы приложение продолжало следовать
 *  за темой клиента, пока человек сам не переключит её в настройках. */
export function initTheme(): void {
  setDataTheme(currentTheme());
}

/** Уточнить тему по Telegram и следить за её сменой. Зовётся после init SDK. */
export function syncTelegramTheme(): void {
  setDataTheme(currentTheme());
  // Человек может переключить тему Telegram, не закрывая приложение. Раньше
  // оно не реагировало вообще: тема определялась один раз при запуске.
  onTelegramThemeChange((dark) => {
    if (savedTheme()) return; // выбрал вручную — не перебиваем
    setDataTheme(dark ? "dark" : "light");
  });
}
