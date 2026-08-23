/**
 * Предохранитель боевой сборки должен срабатывать.
 *
 * Если демо-сборка уедет на сервер, никакой ошибки никто не увидит:
 * приложение откроется, лента заполнится выдуманными сменами, люди начнут на
 * них откликаться, а заведения не получат ни одного отклика. Поэтому у самой
 * проверки должен быть тест — иначе однажды она перестанет срабатывать молча.
 */
import { describe, expect, it } from "vitest";
import { assertNotDemoBuild } from "./buildGuard";

describe("боевая сборка на демо-данных", () => {
  it("падает, когда бэкенд не включён", () => {
    expect(() => assertNotDemoBuild({ PROD_BUILD: "1" })).toThrow(
      /VITE_USE_BACKEND/,
    );
    expect(() =>
      assertNotDemoBuild({ PROD_BUILD: "1", VITE_USE_BACKEND: "false" }),
    ).toThrow();
    // Пустая строка и «1» — тоже не «true»: сравнение строгое не случайно.
    expect(() =>
      assertNotDemoBuild({ PROD_BUILD: "1", VITE_USE_BACKEND: "" }),
    ).toThrow();
    expect(() =>
      assertNotDemoBuild({ PROD_BUILD: "1", VITE_USE_BACKEND: "1" }),
    ).toThrow();
  });

  it("пропускает боевую сборку с настоящим бэкендом и адресом", () => {
    expect(() =>
      assertNotDemoBuild({
        PROD_BUILD: "1",
        VITE_USE_BACKEND: "true",
        VITE_API_BASE_URL: "https://staffswipe.ru/api",
      }),
    ).not.toThrow();
  });
});

describe("боевая сборка с неверным адресом сервера", () => {
  const prod = (url?: string) => ({
    PROD_BUILD: "1",
    VITE_USE_BACKEND: "true",
    ...(url === undefined ? {} : { VITE_API_BASE_URL: url }),
  });

  it("падает без адреса", () => {
    expect(() => assertNotDemoBuild(prod())).toThrow(/адрес не задан/);
    expect(() => assertNotDemoBuild(prod("   "))).toThrow(/адрес не задан/);
  });

  it("падает на адресе своей машины", () => {
    // Значение по умолчанию из tma/Dockerfile: правильное локально,
    // катастрофическое на сервере.
    expect(() => assertNotDemoBuild(prod("http://localhost:8000"))).toThrow();
    expect(() => assertNotDemoBuild(prod("https://localhost:8000"))).toThrow(
      /адрес вашей машины/,
    );
    expect(() => assertNotDemoBuild(prod("https://127.0.0.1/api"))).toThrow(
      /адрес вашей машины/,
    );
  });

  it("падает, когда не заполнен DOMAIN", () => {
    // Ровно то, что получается из «https://${DOMAIN}/api» с пустым DOMAIN.
    // «https://${DOMAIN}/api» с пустым DOMAIN — это НЕ ошибка разбора:
    // получается рабочий адрес «https://api/». Тем и опасно.
    expect(() => assertNotDemoBuild(prod("https:///api"))).toThrow(
      /не похоже на домен/,
    );
    expect(() => assertNotDemoBuild(prod("https://staffswipe/api"))).toThrow(
      /не похоже на домен/,
    );
  });

  it("падает на http — Telegram открывает Mini App только по https", () => {
    expect(() => assertNotDemoBuild(prod("http://staffswipe.ru/api"))).toThrow(
      /нужен https/,
    );
  });

  it("падает на мусоре вместо адреса", () => {
    expect(() => assertNotDemoBuild(prod("staffswipe.ru/api"))).toThrow(
      /это не адрес/,
    );
  });

  it("не мешает обычной сборке — там адрес по умолчанию нормален", () => {
    expect(() =>
      assertNotDemoBuild({ VITE_API_BASE_URL: "http://localhost:8000" }),
    ).not.toThrow();
  });

  it("не мешает обычной сборке — локальной и в CI", () => {
    expect(() => assertNotDemoBuild({})).not.toThrow();
    expect(() => assertNotDemoBuild({ VITE_USE_BACKEND: "false" })).not.toThrow();
    // PROD_BUILD со значением, отличным от «1», боевой сборкой не считается.
    expect(() => assertNotDemoBuild({ PROD_BUILD: "0" })).not.toThrow();
    expect(() => assertNotDemoBuild({ PROD_BUILD: "true" })).not.toThrow();
  });
});
