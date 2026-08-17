import { describe, expect, it } from "vitest";
import { apiError } from "./errors";

/** Ошибка проверки полей у FastAPI — это СПИСОК объектов, а не строка. */
function validationError(loc: (string | number)[], msg: string) {
  return { response: { status: 422, data: { detail: [{ loc, msg, type: "x" }] } } };
}

describe("apiError", () => {
  it("возвращает наш русский текст отказа как есть", () => {
    const e = { response: { status: 403, data: { detail: "Только для оператора" } } };
    expect(apiError(e)).toBe("Только для оператора");
  });

  it("не отдаёт объект наружу — иначе экран падает при отрисовке", () => {
    const e = validationError(["body", "roles", 0], "Input should be 'waiter'");
    const text = apiError(e);
    expect(typeof text).toBe("string");
    expect(text).toContain("должности");
  });

  it("показывает наше собственное сообщение из схемы", () => {
    const e = validationError(
      ["body", "date"],
      "Value error, Смена не может быть в прошлом",
    );
    expect(apiError(e)).toBe("Смена не может быть в прошлом (поле «дата смены»)");
  });

  it("объясняет частые коды ответа своими словами", () => {
    expect(apiError({ response: { status: 429, data: {} } })).toContain("Слишком часто");
    expect(apiError({ response: { status: 502, data: {} } })).toContain("Сервер");
    expect(apiError(new Error("Network Error"))).toContain("Нет связи");
  });

  it("падает на запасной текст, когда сказать нечего", () => {
    const e = { response: { status: 400, data: {} } };
    expect(apiError(e, "Не удалось сохранить")).toBe("Не удалось сохранить");
  });
});
