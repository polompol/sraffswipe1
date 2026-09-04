/**
 * Стили не должны молча перебивать сами себя.
 *
 * Правило вида «то же свойство у того же селектора с другим значением» ниже
 * по файлу побеждает — а верхнее остаётся в коде и выглядит рабочим. Так уже
 * было: тень карточки и тень главной кнопки были вписаны числами поверх
 * токенов, и поменять их через токен было нельзя — они не менялись. Отдельно
 * ловится копия куска файла, заехавшая внутрь @media: там правила замирали
 * в старой редакции для всех телефонов уже 380 точек шириной.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface Rule {
  media: string;
  selector: string;
  body: string;
}

/** Разобрать CSS на правила верхнего уровня и внутри @media. */
function parse(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const media: string[] = [];
  let buf = "";
  let depth = 0;
  let selector = "";
  for (const ch of text) {
    if (ch === "{") {
      if (depth === 0) {
        selector = buf.trim();
        buf = "";
        if (selector.startsWith("@")) {
          media.push(selector);
          continue;
        }
      }
      depth += 1;
      if (depth > 1) buf += ch;
    } else if (ch === "}") {
      if (depth === 0 && media.length) {
        media.pop();
      } else {
        depth -= 1;
        if (depth === 0) {
          out.push({ media: media.join(" "), selector, body: buf });
          buf = "";
        } else {
          buf += ch;
        }
      }
    } else {
      buf += ch;
    }
  }
  return out;
}

// Запасной вариант для браузеров без dvh: высота колоды объявляется дважды
// намеренно, и второе объявление — не ошибка, а замена для тех, кто умеет.
const ALLOWED = new Set(["|.deck|height"]);

function conflicts(css: string): string[] {
  const seen = new Map<string, string[]>();
  for (const r of parse(css)) {
    for (const decl of r.body.split(";")) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim();
      const value = decl.slice(i + 1).split(/\s+/).join(" ").trim();
      if (!prop || prop.startsWith("--")) continue;
      const key = `${r.media}|${r.selector}|${prop}`;
      const list = seen.get(key) ?? [];
      list.push(value);
      seen.set(key, list);
    }
  }
  const bad: string[] = [];
  for (const [key, values] of seen) {
    if (ALLOWED.has(key)) continue;
    if (new Set(values).size > 1) {
      bad.push(`${key}: ${values.join(" → ")}`);
    }
  }
  return bad;
}

const read = (p: string) => readFileSync(join(__dirname, p), "utf8");

describe("таблицы стилей", () => {
  it("одно свойство одного селектора не объявляется дважды по-разному", () => {
    for (const file of ["../index.css", "./theme.css"]) {
      expect(conflicts(read(file)), `${file}:`).toEqual([]);
    }
  });

  it("внутри @media не лежит копия основного файла", () => {
    // Признак той поломки: в узкое правило заехал целый кусок с десятками
    // селекторов. Правило под конкретный экран правит единицы вещей.
    const rules = parse(read("../index.css"));
    const perMedia = new Map<string, number>();
    for (const r of rules) {
      if (!r.media) continue;
      perMedia.set(r.media, (perMedia.get(r.media) ?? 0) + 1);
    }
    for (const [media, count] of perMedia) {
      expect(count, `${media}: правил внутри`).toBeLessThan(40);
    }
  });
});
