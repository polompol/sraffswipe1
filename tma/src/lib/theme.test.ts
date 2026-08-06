// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { applyTheme, currentTheme, initTheme } from "./theme";

/** Подменяем системную тему: в jsdom matchMedia не реализован. */
function systemPrefersDark(dark: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: dark && q.includes("dark"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}

describe("тема оформления", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("без выбора пользователя берёт ТЁМНУЮ тему из системы", () => {
    // Telegram прокидывает свою тему в webview, поэтому приложение должно
    // следовать за клиентом, а не всегда стартовать в светлой.
    systemPrefersDark(true);
    expect(currentTheme()).toBe("dark");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("без выбора пользователя берёт СВЕТЛУЮ тему из системы", () => {
    systemPrefersDark(false);
    expect(currentTheme()).toBe("light");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("");
  });

  it("явный выбор пользователя важнее системной темы", () => {
    systemPrefersDark(true);
    applyTheme("light");
    expect(currentTheme()).toBe("light");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("");
  });

  it("автоопределённая тема НЕ сохраняется — иначе перестанет следовать за системой", () => {
    systemPrefersDark(true);
    initTheme();
    expect(localStorage.getItem("ss_theme")).toBeNull();
  });

  it("applyTheme запоминает выбор", () => {
    systemPrefersDark(false);
    applyTheme("dark");
    expect(localStorage.getItem("ss_theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("не падает, если matchMedia недоступен", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(() => initTheme()).not.toThrow();
    expect(currentTheme()).toBe("light");
  });
});
