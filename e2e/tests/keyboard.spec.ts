import { expect, test } from "@playwright/test";
import { fillProfile, login, openApp, publishShift, waitForStableLayout } from "../harness/app";

/**
 * ПУТЬ БЕЗ КАСАНИЯ ЭКРАНА.
 *
 * Замеры читаемости отвечают на вопрос «видно ли». Здесь другой: «дотянешься
 * ли». Ими пользуются не только незрячие — переключателем ходят по экрану при
 * травме руки, клавиатурой на телефоне с внешним чехлом-клавиатурой.
 *
 * Что уже было найдено и не должно вернуться: подробности открывались ТОЛЬКО
 * нажатием по самой карточке, а карточка — это div. Ни роли кнопки, ни места
 * в порядке обхода. Человек, который не может коснуться экрана, не мог
 * прочитать ни адрес, ни разбивку оплаты, ни предупреждение «просят деньги
 * вперёд — это обман». Свайпать при этом мог: круглые кнопки настоящие.
 *
 * То есть он соглашался на смену, не имея возможности прочитать её условия.
 */

const PHONE = { width: 390, height: 844 };

/** Куда попадает фокус, если жать Tab от начала страницы.
 *
 *  Круг замыкаем по самому элементу, а не по подписи. Раньше обход обрывался
 *  на первом повторе названия — и это скрыло настоящий дефект: кнопка
 *  «Подробнее» была у ВСЕХ карточек колоды, включая те, что лежат под
 *  верхней, поэтому название повторялось и обход заканчивался, не дойдя до
 *  кнопки решения. */
async function tabStops(page: import("@playwright/test").Page, limit = 30) {
  const stops: string[] = [];
  let first: unknown = null;
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press("Tab");
    const cur = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const w = window as unknown as { __seen?: Element[] };
      w.__seen = w.__seen || [];
      const idx = w.__seen.indexOf(el);
      if (idx === -1) w.__seen.push(el);
      return {
        name: (el.getAttribute("aria-label") || (el.textContent || "").trim()).slice(0, 45),
        seen: idx,
      };
    });
    if (!cur) break;
    if (cur.seen === 0 && first !== null) break; // круг замкнулся
    if (first === null) first = cur.name;
    stops.push(cur.name);
  }
  return stops;
}

const CASES = [
  {
    who: "работник",
    city: "Ковров",
    seed: 848_100,
    details: "Подробнее о смене",
    decide: "Откликнуться — хочу здесь работать",
  },
  {
    who: "заведение",
    city: "Гусь-Хрустальный",
    seed: 848_200,
    details: "Подробнее о человеке",
    decide: "Позвать на смену",
  },
] as const;

for (const c of CASES) {
  test(`подробности открываются клавишей — ${c.who}`, async ({ browser, request }) => {
    // Свой город на каждый случай: лента показывает всех в городе, а тесты
    // идут парами и заводят своих людей. В общем городе наверху колоды
    // оказывался бы чужой.
    const emp = await login(request, "employer", c.seed, "Дрова");
    await fillProfile(request, emp, {
      company_name: "Кофейня «Дрова»",
      city: c.city,
      address: "ул. Ленина, 5",
      contact_phone: `+7999${c.seed}`,
    });
    await publishShift(request, emp, { days: 1, city: c.city });
    const seeker = await login(request, "seeker", c.seed + 1, "Мария");
    await fillProfile(request, seeker, {
      name: "Мария",
      city: c.city,
      district: "Центр",
      roles: ["barista"],
      birth_date: "1998-04-12",
      med_book: "yes",
    });

    const { context, page } = await openApp(browser, c.who === "работник" ? seeker : emp);
    await page.setViewportSize(PHONE);
    await page.goto("/#/feed");
    await waitForStableLayout(page, ".page");
    await page.waitForTimeout(700);

    // 1. Кнопка подробностей есть в дереве доступности и стоит В ПОРЯДКЕ
    //    ОБХОДА — между карточкой и решением, то есть до того, как человек
    //    согласится.
    const stops = await tabStops(page);
    expect(stops, `порядок обхода: ${stops.join(" | ")}`).toContain(c.details);
    expect(stops).toContain(c.decide);
    expect(
      stops.indexOf(c.details),
      "подробности должны идти ДО кнопки решения: сначала читают, потом соглашаются",
    ).toBeLessThan(stops.indexOf(c.decide));

    // В колоде лежат три карточки одна на другой, и кнопка «Подробнее» есть у
    // каждой. В обход должна попадать ТОЛЬКО верхняя: действовать можно лишь с
    // ней, и уводить клавишей в карточку, которой человек не видит, — значит
    // открывать подробности неизвестно чего.
    expect(
      stops.filter((x) => x === c.details).length,
      `в обходе ${stops.filter((x) => x === c.details).length} кнопок «Подробнее» — должна быть одна`,
    ).toBe(1);

    // 2. Enter открывает изнанку.
    const more = page.getByRole("button", { name: c.details });
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".swipe-card.is-flipped")).toBeVisible();
    await page.waitForTimeout(700);

    // 3. И возвращает обратно. Без этого изнанка была бы ловушкой: касание
    //    ему недоступно, а другого выхода нет.
    const back = page.getByRole("button", { name: /Назад к карточке/ });
    await back.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".swipe-card.is-flipped")).toHaveCount(0);

    // 4. Зона нажатия не меньше обязательных 44 точек: кнопка выглядит как
    //    подпись, но пальцем по ней тоже попадают.
    const box = await more.boundingBox();
    expect(Math.round(box!.height), "низкая зона нажатия у «Подробнее»").toBeGreaterThanOrEqual(44);

    await context.close();
  });
}
