/**
 * Сброс кэша должен попадать в живой ключ.
 *
 * Ключи запросов — обычные строки, разбросанные по экранам («matches»
 * встречается четырнадцать раз). Опечатка в одном сбросе не ломает ни сборку,
 * ни тесты: экран просто не обновится. Так пропадают самые обидные ошибки —
 * человек подтвердил смену, а список показывает старое, и виноватым выглядит
 * сервер.
 *
 * Проверка простая: каждый ключ, который где-то сбрасывают, обязан где-то и
 * запрашиваться.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sources(full));
    } else if (/\.tsx?$/.test(name) && !name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

const RESET = "invalidateQueries|setQueryData|removeQueries|cancelQueries";

function collect() {
  const queried = new Set<string>();
  const touched = new Map<string, string>();
  for (const file of sources(ROOT)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/queryKey:\s*\[\s*"([^"]+)"/g)) {
      // Ключ в сбросе — не «запрошенный». Без этого опечатка засчитывала
      // сама себя: и в сбросе, и в списке живых ключей, и проверка молчала.
      const before = src.slice(Math.max(0, (m.index ?? 0) - 80), m.index);
      if (new RegExp(`(?:${RESET})\\w*\\(\\s*\\{?\\s*$`).test(before)) continue;
      queried.add(m[1]);
    }
    const reset = new RegExp(
      `(?:${RESET})\\w*\\(\\s*\\{?\\s*(?:queryKey:\\s*)?\\[\\s*"([^"]+)"`,
      "g",
    );
    for (const m of src.matchAll(reset)) {
      touched.set(m[1], file.slice(ROOT.length + 1));
    }
  }
  return { queried, touched };
}

describe("ключи запросов", () => {
  it("сброс кэша попадает в ключ, который кто-то запрашивает", () => {
    const { queried, touched } = collect();
    const orphans = [...touched]
      .filter(([key]) => !queried.has(key))
      .map(([key, file]) => `${key} (${file})`);
    expect(orphans, "сброс в пустоту").toEqual([]);
  });

  it("проверка действительно что-то видит", () => {
    // Страховка от «сканер ничего не нашёл и потому молчит».
    const { queried, touched } = collect();
    expect(queried.size).toBeGreaterThan(15);
    expect(touched.size).toBeGreaterThan(10);
  });
});
