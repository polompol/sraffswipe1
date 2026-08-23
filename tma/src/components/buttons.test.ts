/**
 * Два способа сделать кнопку не должны расходиться.
 *
 * В коде их исторически два: класс `.btn` прямо в разметке и компонент
 * `<Button>` (класс `.ui-btn`). Пока у каждого были свои числа, они тихо
 * разъезжались: высота 54 против 44/48/54, приглушение выключенной кнопки
 * 0.5 против 0.55, фокус обводкой против кольца. Заметить это по коду нельзя
 * — только глазами, когда две кнопки разной высоты уже стоят рядом.
 *
 * Поэтому проверка не на внешний вид, а на источник чисел: и тот и другой
 * обязаны брать их из общих токенов. Впишет кто-нибудь высоту числом — тест
 * скажет об этом сразу, а не через полгода.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../index.css"), "utf8");
const theme = readFileSync(resolve(here, "../theme/theme.css"), "utf8");

/** Тело одного правила CSS по его селектору. */
function rule(source: string, selector: string): string {
  const at = source.indexOf(`\n${selector} {`);
  expect(at, `правило ${selector} не найдено`).toBeGreaterThan(-1);
  const open = source.indexOf("{", at);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

describe("кнопки берут числа из одного места", () => {
  it("токены кнопок объявлены", () => {
    for (const token of [
      "--btn-h-sm", "--btn-h-md", "--btn-h-lg",
      "--btn-pad-sm", "--btn-pad-md", "--btn-pad-lg",
      "--btn-radius", "--btn-disabled", "--btn-shadow", "--focus-ring",
    ]) {
      expect(theme, `нет токена ${token}`).toContain(`${token}:`);
    }
  });

  it("высота — нигде не меньше 44 точек", () => {
    for (const [token, min] of [["--btn-h-sm", 44], ["--btn-h-md", 44], ["--btn-h-lg", 44]] as const) {
      const m = theme.match(new RegExp(`${token}:\\s*(\\d+)px`));
      expect(m, `нет значения у ${token}`).toBeTruthy();
      expect(Number(m![1])).toBeGreaterThanOrEqual(min);
    }
  });

  it("оба способа используют одни токены высоты и скругления", () => {
    const btn = rule(css, ".btn");
    expect(btn).toContain("var(--btn-h-lg)");
    expect(btn).toContain("var(--btn-radius)");
    expect(btn).toContain("var(--btn-pad-lg)");

    const ui = rule(css, ".ui-btn");
    expect(ui).toContain("var(--btn-radius)");
    expect(rule(css, ".ui-btn--lg")).toContain("var(--btn-h-lg)");
    expect(rule(css, ".ui-btn--md")).toContain("var(--btn-h-md)");
    expect(rule(css, ".ui-btn--sm")).toContain("var(--btn-h-sm)");
  });

  it("выключенная кнопка гаснет одинаково", () => {
    expect(rule(css, ".btn:disabled")).toContain("var(--btn-disabled)");
    expect(rule(css, ".ui-btn:disabled")).toContain("var(--btn-disabled)");
  });

  it("тень главной кнопки — одна и та же", () => {
    expect(rule(css, ".btn")).toContain("var(--btn-shadow)");
    expect(rule(css, ".ui-btn--primary")).toContain("var(--btn-shadow)");
  });

  it("в самих правилах кнопок нет высоты числом", () => {
    for (const sel of [".btn", ".ui-btn", ".ui-btn--sm", ".ui-btn--md", ".ui-btn--lg"]) {
      const body = rule(css, sel);
      expect(
        /min-height:\s*\d+px/.test(body),
        `${sel}: высота вписана числом вместо токена`,
      ).toBe(false);
    }
  });
});
