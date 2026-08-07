/**
 * Юридические документы: ссылки ведут на реальные страницы, страницы
 * собираются, и в них попадают условия, на которые ссылается продукт.
 *
 * Зачем тест: галочка «принимаю оферту» — юридическое основание и для комиссии,
 * и для обработки персональных данных. Раньше ссылки вели в «#», а в оферте не
 * было ни слова про комиссию, хотя счёт заведению выставляется именно по ней.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { LEGAL_LINKS, OFFER_URL, PRIVACY_URL } from "./legal";

const ROOT = process.cwd(); // tma/
const OUT = (name: string) => resolve(ROOT, "public/legal", `${name}.html`);

function build(): void {
  execFileSync("node", ["scripts/build-legal.mjs"], { cwd: ROOT });
}

describe("ссылки на документы", () => {
  it("никогда не ведут в пустоту", () => {
    for (const l of LEGAL_LINKS) {
      expect(l.href).not.toBe("#");
      expect(l.href).toMatch(/legal\/\w+\.html$|^https?:\/\//);
    }
    expect(OFFER_URL).toBeTruthy();
    expect(PRIVACY_URL).toBeTruthy();
  });
});

describe("сборка страниц", () => {
  it("собирает три документа без остатков markdown", () => {
    build();
    for (const name of ["offer", "privacy", "terms"]) {
      const html = readFileSync(OUT(name), "utf8");
      expect(html).toContain("<!doctype html>");
      // Незакрытая разметка означала бы, что человек читает «**жирный**».
      expect(html).not.toContain("**");
      expect(html.match(/<ul>/g)?.length ?? 0).toBe(
        html.match(/<\/ul>/g)?.length ?? 0,
      );
    }
  });

  it("в оферте есть комиссия, срок оплаты и возраст", () => {
    build();
    const offer = readFileSync(OUT("offer"), "utf8");
    expect(offer).toContain("10%");
    expect(offer).toContain("7 календарных дней");
    expect(offer).toContain("18 лет");
  });

  it("в политике сказано, что документы не хранятся", () => {
    build();
    const privacy = readFileSync(OUT("privacy"), "utf8");
    expect(privacy).toContain("не запрашивает и не хранит");
    expect(privacy).toContain("ЮKassa");
    expect(privacy).toContain("DaData");
  });
});
