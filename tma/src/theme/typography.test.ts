/**
 * Сторож типографики и зон нажатия.
 *
 * Шкала размеров в проекте была и раньше — ей просто перестали пользоваться:
 * размеры расползлись числами по сотне мест в разметке. Заметить это на
 * глаз невозможно (каждая правка выглядит безобидно), а расплата приходит
 * позже и не там: «крупный режим» для слабого зрения увеличивал часть
 * надписей, а остальные оставались мелкими.
 *
 * Поэтому правило проверяется автоматически: размер текста берётся из шкалы,
 * ничего мельче нижней границы, зона нажатия не меньше 44px.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("..", import.meta.url).pathname;
const FLOOR_PX = 13;
const TOUCH_PX = 44;

function walk(dir: string, ext: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full, ext);
    return ext.some((e) => name.endsWith(e)) ? [full] : [];
  });
}

describe("типографика", () => {
  it("в разметке нет размеров текста числом — только шкала", () => {
    const bad: string[] = [];
    for (const file of walk(SRC, [".tsx"])) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (/fontSize: \d/.test(line)) bad.push(`${file}:${i + 1}`);
      });
    }
    expect(bad, "размер должен браться из шкалы: fontSize: \"var(--text-…)\"")
      .toEqual([]);
  });

  it("нигде нет текста мельче нижней границы", () => {
    const bad: string[] = [];
    for (const file of walk(SRC, [".css"])) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const m = line.match(/font-size: ([\d.]+)px/);
        // Единственное исключение — огромная буква-подложка на карточке:
        // это украшение под фотографией, а не текст.
        if (m && Number(m[1]) < FLOOR_PX && !line.includes("140px")) {
          bad.push(`${file}:${i + 1} → ${m[1]}px`);
        }
      });
    }
    expect(bad, `мельче ${FLOOR_PX}px читать невозможно`).toEqual([]);
  });

  it("шкала описана целиком и растёт в крупном режиме", () => {
    const css = readFileSync(join(SRC, "theme/theme.css"), "utf8");
    const steps = ["xs", "sm", "base", "md", "lg", "xl", "2xl", "3xl",
                   "display", "hero"];
    for (const s of steps) {
      expect(css, `нет ступени --text-${s}`).toContain(`--text-${s}:`);
    }
    const large = css.slice(css.indexOf('body[data-large="1"]'));
    for (const s of steps) {
      expect(large, `крупный режим не поднимает --text-${s}`)
        .toContain(`--text-${s}:`);
    }
  });
});

describe("зоны нажатия", () => {
  it("кнопки не мельче 44px", () => {
    const bad: string[] = [];
    for (const file of walk(SRC, [".tsx", ".css"])) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const m = line.match(/min-?[Hh]eight: (\d+)/);
        const looksLikeButton = /button|btn|tag|tab|act\b/i.test(line)
          || /minHeight/.test(line);
        if (m && looksLikeButton && Number(m[1]) < TOUCH_PX) {
          // Ноль — это «снять ограничение» у контейнера, не кнопка.
          if (Number(m[1]) !== 0) bad.push(`${file}:${i + 1} → ${m[1]}px`);
        }
      });
    }
    expect(bad, `палец уверенно попадает в ${TOUCH_PX}px`).toEqual([]);
  });
});
