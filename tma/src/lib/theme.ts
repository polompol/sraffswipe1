export type ThemeMode = "light" | "dark";

const KEY = "ss_theme";

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode === "dark" ? "dark" : "";
  localStorage.setItem(KEY, mode);
}

export function currentTheme(): ThemeMode {
  return (localStorage.getItem(KEY) as ThemeMode | null) ?? "light";
}

/** Применяет сохранённую тему на старте (по умолчанию — светлая «молочная»). */
export function initTheme(): void {
  applyTheme(currentTheme());
}
