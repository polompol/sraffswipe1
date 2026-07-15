export type ThemeMode = "light" | "dark";

const KEY = "ss_theme";

function setDataTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode === "dark" ? "dark" : "";
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

/** Тёмная ли тема у клиента Telegram / системы. Telegram прокидывает свою
 *  тему в webview, поэтому prefers-color-scheme совпадает с темой Telegram. */
function prefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function currentTheme(): ThemeMode {
  return savedTheme() ?? (prefersDark() ? "dark" : "light");
}

/** Тема на старте: явный выбор пользователя, иначе — тема Telegram/системы.
 *  Автоопределённую тему НЕ сохраняем, чтобы приложение продолжало следовать
 *  за темой клиента, пока человек сам не переключит её в настройках. */
export function initTheme(): void {
  setDataTheme(currentTheme());
}
