/**
 * Замеры «как это выглядит»: контраст текста, вылет за края, зоны нажатия.
 *
 * Всё считается в браузере на живой странице, а не по исходникам стилей:
 * цвет текста и фон складываются из десятка правил, наследования и тем, и
 * единственный честный ответ даёт готовая страница.
 */
import type { Page } from "@playwright/test";

export interface Violation {
  where: string; // человекочитаемый адрес элемента
  text: string; // что за текст
  ratio: number; // получившийся контраст
  need: number; // сколько требуется
  color: string;
  background: string;
}

export interface Paint {
  overflowX: number;
  tiny: number; // зон нажатия меньше 44 точек
  tinyWhere: string[];
  contrast: Violation[];
  checked: number; // сколько кусков текста удалось проверить
  // Текст на фотографии или на градиенте: цвет фона там из стилей не достать,
  // поэтому такие куски считаем отдельно, а не молча пропускаем.
  onImage: number;
  /** Пропущено, потому что закрыто другим слоем — человек этого не видит. */
  covered: number;
}

/** Снять замеры с открытой страницы. */
export async function measure(page: Page): Promise<Paint> {
  return page.evaluate(() => {
    const rgb = (v: string): [number, number, number, number] => {
      const m = v.match(/[\d.]+/g);
      if (!m) return [0, 0, 0, 0];
      const [r, g, b, a] = m.map(Number);
      return [r, g, b, a === undefined ? 1 : a];
    };
    const lum = ([r, g, b]: number[]): number => {
      const f = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (
      fg: [number, number, number, number],
      bg: [number, number, number, number],
    ): [number, number, number, number] => {
      const a = fg[3];
      return [
        fg[0] * a + bg[0] * (1 - a),
        fg[1] * a + bg[1] * (1 - a),
        fg[2] * a + bg[2] * (1 - a),
        1,
      ];
    };
    const ratio = (a: number[], b: number[]): number => {
      const l1 = lum(a);
      const l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const where = (el: Element): string => {
      const bits: string[] = [];
      let cur: Element | null = el;
      for (let i = 0; cur && i < 3; i += 1) {
        const cls = (cur.getAttribute("class") || "").split(/\s+/)[0];
        bits.unshift(cur.tagName.toLowerCase() + (cls ? `.${cls}` : ""));
        cur = cur.parentElement;
      }
      return bits.join(" > ");
    };

    /** Фон ПОД элементом — в той точке, где лежит текст.
     *
     *  Не вверх по дереву, а по настоящей стопке пикселей: половина подписей
     *  в приложении лежит на фотографии или на карточке, которая ей не
     *  родитель, а сосед. По дереву там находится прозрачный фон страницы, и
     *  белая подпись на фото выглядела бы «белым по кремовому» — проверка
     *  ловила бы то, чего человек не видит.
     */
    const backdrop = (
      el: Element,
      x: number,
      y: number,
    ): {
      color: [number, number, number, number];
      unknown: boolean;
      covered: boolean;
    } => {
      const stack = document.elementsFromPoint(x, y);
      const from = stack.indexOf(el);
      // Элемента нет в стопке — два совершенно разных случая, и путать их
      // нельзя.
      //
      // Первый: у него (или у родителя) pointer-events: none. Так помечена,
      // например, крупная сумма на карточке — чтобы жест свайпа не упирался
      // в надпись. Такой текст человек прекрасно видит, и мерить его надо.
      //
      // Второй: его закрывает другой элемент. В колоде лежат три карточки
      // одна на другой, и у нижних тот же текст на том же месте. Человек их
      // не видит вовсе, а замер брал фон ВЕРХНЕЙ карточки и сравнивал с ним
      // белые буквы нижней: «белое по кремовому, 1.02» — при том, что на
      // экране этого нет. Ровно так проверка изнанки и падала: перевёрнутая
      // карточка светлая, а под ней лежала обычная с белой суммой.
      //
      // Отличаем по тому, лежит ли элемент ВНУТРИ первого непрозрачного узла
      // стопки: если да — он просто прозрачен для нажатий; если нет — он под
      // чужим непрозрачным слоем, и его не видно.
      if (from < 0) {
        for (const node of stack) {
          const cs = getComputedStyle(node);
          const opaque =
            (cs.backgroundImage && cs.backgroundImage !== "none") ||
            rgb(cs.backgroundColor)[3] > 0.95;
          if (!opaque) continue;
          if (!node.contains(el)) {
            return { color: [255, 255, 255, 1], unknown: true, covered: true };
          }
          break;
        }
      }
      const under = from >= 0 ? stack.slice(from) : [el, ...stack];
      for (const node of under) {
        const cs = getComputedStyle(node);
        // Градиент или картинка — цвет из пикселя честно не достать.
        if (cs.backgroundImage && cs.backgroundImage !== "none") {
          return { color: [255, 255, 255, 1], unknown: true, covered: false };
        }
        const c = rgb(cs.backgroundColor);
        if (c[3] > 0.95) return { color: c, unknown: false, covered: false };
      }
      // Ничего непрозрачного в стопке — значит, красит холст. Браузер берёт
      // фон у <html>, а если у того его нет — переносит на холст фон <body>.
      // Без этого правила проверка выдумывала белый: у body высота 100%, и
      // под длинной страницей его прямоугольник просто кончается, хотя фон
      // на экране есть. В тёмной теме это давало ложные «нечитаемо».
      for (const node of [document.documentElement, document.body]) {
        const c = rgb(getComputedStyle(node).backgroundColor);
        if (c[3] > 0.95) return { color: c, unknown: false, covered: false };
      }
      // Не выдумываем: не смогли определить — не проверяем.
      return { color: [255, 255, 255, 1], unknown: true, covered: false };
    };

    const violations: Violation[] = [];
    let checked = 0;
    let onImage = 0;
    let covered = 0;
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const own = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim(),
      );
      if (!own) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (Number(cs.opacity) < 0.99) continue; // намеренно приглушено
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      // Точку берём внутри самого текста. Элементы за пределами окна
      // пропускаем: стопку пикселей там не спросить, а «подтянуть» точку к
      // краю окна нельзя — это уже другое место экрана и другой фон. До
      // остальных доберёмся прокруткой (см. sweep).
      const x = r.left + 2;
      const y = r.top + r.height / 2;
      if (x < 1 || x > window.innerWidth - 1) continue;
      if (y < 1 || y > window.innerHeight - 1) continue;
      const bg = backdrop(el, x, y);
      // Закрыт другим слоем — человек его не видит, мерить нечего. Считаем
      // отдельно от «текста на картинке»: это разные причины пропуска, и
      // складывать их в одну цифру значит потерять из виду обе.
      if (bg.covered) {
        covered += 1;
        continue;
      }
      if (bg.unknown) {
        onImage += 1;
        continue;
      }
      const fg = over(rgb(cs.color), bg.color);
      const size = parseFloat(cs.fontSize);
      const weight = Number(cs.fontWeight) || 400;
      const big = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = big ? 3 : 4.5;
      const got = ratio(fg, bg.color);
      checked += 1;
      if (got + 0.005 < need) {
        violations.push({
          where: where(el),
          text: (el.textContent || "").trim().slice(0, 40),
          ratio: Math.round(got * 100) / 100,
          need,
          color: cs.color,
          background: `rgb(${bg.color.slice(0, 3).map(Math.round).join(", ")})`,
        });
      }
    }

    const small = Array.from(
      document.querySelectorAll("button, a, [role=button], input[type=checkbox]"),
    ).filter((e) => {
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 1 || cx > window.innerWidth - 1) return false;
      if (cy < 1 || cy > window.innerHeight - 1) return false;
      // Считаем только то, во что палец действительно попадает. Иначе в счёт
      // шли кнопки на СЛЕДУЮЩЕЙ карточке колоды: она стоит позади и уменьшена
      // до 0,96 — 42 точки вместо 44, — но нажать её всё равно нельзя.
      const top = document.elementFromPoint(cx, cy);
      if (!top || (top !== e && !e.contains(top) && !top.contains(e))) return false;
      return r.height < 43.5 || r.width < 43.5;
    });

    const de = document.documentElement;
    return {
      overflowX: de.scrollWidth - de.clientWidth,
      tiny: small.length,
      tinyWhere: small.slice(0, 5).map(where),
      contrast: violations,
      checked,
      onImage,
      covered,
    };
  });
}

/** Пройти страницу сверху донизу и собрать замеры со всех экранов прокрутки.
 *
 *  Мерить можно только то, что сейчас в окне, — а страницы у нас длиннее
 *  экрана. Поэтому прокручиваем шагами по 3/4 окна и складываем находки,
 *  отсеивая повторы.
 */
export async function sweep(page: Page): Promise<Paint> {
  const all: Paint = {
    overflowX: 0,
    tiny: 0,
    tinyWhere: [],
    contrast: [],
    checked: 0,
    onImage: 0,
    covered: 0,
  };
  const seen = new Set<string>();
  const height = await page.evaluate(() => window.innerHeight);
  const full = await page.evaluate(() => document.body.scrollHeight);
  for (let top = 0; top === 0 || top < full; top += Math.round(height * 0.75)) {
    await page.evaluate((y) => window.scrollTo(0, y), top);
    await page.waitForTimeout(60);
    const m = await measure(page);
    all.overflowX = Math.max(all.overflowX, m.overflowX);
    all.checked += m.checked;
    all.onImage += m.onImage;
    all.covered += m.covered;
    for (const w of m.tinyWhere) {
      if (!seen.has(`t:${w}`)) {
        seen.add(`t:${w}`);
        all.tiny += 1;
        all.tinyWhere.push(w);
      }
    }
    for (const v of m.contrast) {
      const key = `c:${v.where}|${v.text}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.contrast.push(v);
      }
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return all;
}

/** Короткий разбор нарушений — чтобы падение теста читалось без отладки. */
export function report(v: Violation[]): string {
  return v
    .slice(0, 8)
    .map(
      (x) =>
        `${x.where}: «${x.text}» — ${x.ratio} при норме ${x.need} ` +
        `(${x.color} на ${x.background})`,
    )
    .join("\n");
}
