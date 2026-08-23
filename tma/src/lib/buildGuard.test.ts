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

  it("пропускает боевую сборку с настоящим бэкендом", () => {
    expect(() =>
      assertNotDemoBuild({ PROD_BUILD: "1", VITE_USE_BACKEND: "true" }),
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
