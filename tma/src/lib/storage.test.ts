// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { LS, forgetRetired } from "./storage";

describe("что приложение хранит на телефоне", () => {
  beforeEach(() => localStorage.clear());

  it("точное место не хранит вовсе", () => {
    // Координаты с точностью до дома лежали в браузере бессрочно и переживали
    // выход из аккаунта. Ключа для них больше нет — и появиться он не должен
    // незаметно: этот список короткий, и каждая строка в нём — решение.
    const keys = Object.values(LS as Record<string, string>);
    expect(keys).not.toContain("ss_geo");
    expect(keys.some((k) => /geo|lat|lng|coord/i.test(k))).toBe(false);
  });

  it("старое сохранённое место стирает при запуске", () => {
    // Перестать писать — половина дела: у того, кто пользовался приложением
    // раньше, значение уже лежит в телефоне и само оттуда не денется.
    localStorage.setItem("ss_geo", JSON.stringify({ lat: 55.75, lng: 37.61 }));
    forgetRetired();
    expect(localStorage.getItem("ss_geo")).toBeNull();
  });

  it("нужное не трогает", () => {
    localStorage.setItem(LS.jwt, "токен");
    localStorage.setItem(LS.city, "Москва");
    forgetRetired();
    expect(localStorage.getItem(LS.jwt)).toBe("токен");
    expect(localStorage.getItem(LS.city)).toBe("Москва");
  });
});
