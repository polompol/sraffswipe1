/**
 * Собирает страницы юридических документов из docs/legal/*.md в public/legal/*.html.
 *
 * Зачем: на экране выбора роли человек ставит галочку «принимаю оферту и
 * политику», и ссылки должны открывать реальный текст. Раньше они вели в «#» —
 * согласие ссылалось в никуда. Теперь документы лежат рядом с приложением и
 * открываются по адресу /legal/offer.html — отдельный хостинг не нужен.
 *
 * Источник правды — markdown в docs/legal/. Правим только его, html собирается.
 * Разметка нарочно поддерживается минимальная (заголовки, списки, **жирный**) —
 * ровно та, что используется в документах, без сторонних библиотек.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../../docs/legal");
const OUT = resolve(here, "../public/legal");

const DOCS = [
  { file: "offer", title: "Публичная оферта — StaffSwipe" },
  { file: "privacy", title: "Политика обработки персональных данных — StaffSwipe" },
  { file: "terms", title: "Правила сервиса — StaffSwipe" },
];

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Жирный, курсив, `код` и ссылки — внутри уже экранированного текста. */
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

function toHtml(md) {
  const out = [];
  // В markdown абзацы и пункты списка перенесены по ширине строки, и **жирный**
  // может открыться на одной строке, а закрыться на следующей. Поэтому сначала
  // собираем блок целиком (buf), и только потом разбираем разметку.
  let buf = [];
  let mode = null; // "p" | "li" | null
  let listOpen = false;

  const flush = () => {
    if (!buf.length) return;
    const text = inline(buf.join(" "));
    out.push(mode === "li" ? `<li>${text}</li>` : `<p>${text}</p>`);
    buf = [];
  };
  const closeList = () => {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  };

  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      mode = null;
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flush();
      mode = null;
      closeList();
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    const item = line.match(/^[-*]\s+(.*)$/);
    if (item) {
      flush();
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      mode = "li";
      buf = [item[1]];
      continue;
    }
    // Продолжение текущего блока (перенос строки).
    if (mode) {
      buf.push(line);
      continue;
    }
    closeList();
    mode = "p";
    buf = [line];
  }
  flush();
  closeList();
  return out.join("\n");
}

// Цвета — те же токены, что в приложении (багровый + слоновая кость),
// плюс тёмная тема по системной настройке телефона.
const CSS = `
:root { --bg:#efe7d3; --card:#fffdf7; --ink:#241a17; --muted:#6d6357;
        --gold:#a51c30; --line:#ddd0b6; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#171012; --card:#211619; --ink:#f2e9e4; --muted:#b8a7ab;
          --gold:#d24b60; --line:#3a2329; }
}
* { box-sizing: border-box; }
body { margin:0; padding:24px 16px 64px; background:var(--bg); color:var(--ink);
       font:16px/1.6 -apple-system, "Segoe UI", Roboto, sans-serif;
       -webkit-text-size-adjust:100%; }
main { max-width:720px; margin:0 auto; background:var(--card); border-radius:20px;
       padding:24px 20px; border:1px solid var(--line); }
h1 { font-size:26px; line-height:1.25; margin:0 0 20px; }
h2 { font-size:19px; margin:28px 0 10px; color:var(--gold); }
h3 { font-size:17px; margin:22px 0 8px; }
p, li { overflow-wrap:anywhere; }
ul { padding-left:22px; margin:10px 0; }
li { margin:6px 0; }
a { color:var(--gold); }
code { background:rgba(165,28,48,0.08); padding:1px 5px; border-radius:5px;
       font-size:0.92em; }
footer { max-width:720px; margin:20px auto 0; color:var(--muted); font-size:13px;
         text-align:center; }
footer a { color:var(--muted); }
`;

mkdirSync(OUT, { recursive: true });

for (const { file, title } of DOCS) {
  const md = readFileSync(resolve(SRC, `${file}.md`), "utf8");
  const others = DOCS.filter((d) => d.file !== file)
    .map((d) => `<a href="${d.file}.html">${d.title.split(" — ")[0]}</a>`)
    .join(" · ");
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${toHtml(md)}
</main>
<footer>StaffSwipe · ${others}</footer>
</body>
</html>
`;
  writeFileSync(resolve(OUT, `${file}.html`), html, "utf8");
}

console.log(`legal: собрано ${DOCS.length} документа в public/legal/`);
