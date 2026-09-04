import { expect, test } from "@playwright/test";
import { API_URL } from "../harness/env";
import {
  auth,
  fillProfile,
  login,
  openApp,
  publishShift,
  waitForStableLayout,
} from "../harness/app";

/**
 * ЧТО ЛЕЖИТ ПОВЕРХ ЧЕГО.
 *
 * Проверка появилась после разбора старого одностраничного макета: там
 * круглые кнопки ленты («Отклик» и «Пропустить») оставались нарисованными
 * ПОВЕРХ открытой шторки фильтров и поверх экрана «Взаимно!». Выглядело это
 * как две белые подписи посреди чужого окна, а на ощупь было хуже: палец
 * попадал по кнопке, которой на этом экране быть не должно, — то есть человек
 * откликался на смену, думая, что закрывает фильтры.
 *
 * В самом приложении слои разложены иначе (шторка 40, оверлей 50, кнопки
 * колоды 2), но «разложены правильно» и «проверено» — разные вещи: порядок
 * держится на трёх числах в CSS, которые может сдвинуть любая правка соседней
 * строки. Здесь он замеряется.
 *
 * Замер — попаданием, а не сравнением прямоугольников: важно не «пересекаются
 * ли», а «что окажется под пальцем». Прямоугольники пересекаются всегда —
 * шторка занимает весь экран.
 */

const PHONE = { width: 390, height: 844 };

/** Что окажется под пальцем в середине каждой круглой кнопки колоды.
 *
 *  Возвращает для каждой кнопки название ближайшего слоя, который её
 *  перехватил: `overlay`, `sheet-backdrop` — хорошо; `act` — значит кнопка
 *  осталась сверху и нажмётся. */
async function whatCatchesDeckButtons(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const acts = [...document.querySelectorAll<HTMLElement>(".act")];
    return acts.map((b) => {
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(
        Math.round(r.left + r.width / 2),
        Math.round(r.top + r.height / 2),
      ) as HTMLElement | null;
      const layer = top?.closest(".overlay, .sheet-backdrop, .act");
      return {
        button: b.getAttribute("aria-label") || "",
        // Что именно перехватило нажатие: класс ближайшего слоя.
        caught: layer ? layer.className.split(" ")[0] : (top?.tagName ?? "ничего"),
      };
    });
  });
}

const CASES = [
  { who: "работник", role: "seeker", seed: 851_100, city: "Муром" },
  { who: "заведение", role: "employer", seed: 851_300, city: "Александров" },
] as const;

for (const c of CASES) {
  test(`шторка фильтров закрывает кнопки колоды — ${c.who}`, async ({ browser, request }) => {
    // Свой город на каждый случай: лента показывает всех в городе, и в общем
    // городе наверху колоды оказался бы человек из соседнего теста.
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

    const { context, page } = await openApp(browser, c.role === "seeker" ? seeker : emp);
    await page.setViewportSize(PHONE);
    await page.goto("/#/feed");
    await waitForStableLayout(page, ".page");
    await expect(page.locator(".act").first()).toBeVisible();

    await page.getByRole("button", { name: /^Фильтры/ }).click();
    await expect(page.locator(".sheet")).toBeVisible();
    // Шторка выезжает снизу — замерять надо по неподвижной картинке.
    await page.waitForTimeout(500);

    const caught = await whatCatchesDeckButtons(page);
    expect(caught.length, "кнопки колоды должны существовать под шторкой").toBeGreaterThan(0);
    for (const x of caught) {
      expect(x.caught, `«${x.button}» осталась поверх шторки фильтров`).not.toBe("act");
    }

    // И кнопка внизу шторки не обрезана: «Показать смены» — то, ради чего
    // шторку открывали, и на 390 точках она обязана поместиться целиком.
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".sheet-foot button")]
        .filter((b) => b.scrollWidth > b.clientWidth + 1)
        .map((b) => (b.textContent || "").trim()),
    );
    expect(clipped, "подпись кнопки в шторке обрезана").toEqual([]);

    await context.close();
  });
}

test("экран «Взаимно!» закрывает кнопки колоды", async ({ browser, request }) => {
  const emp = await login(request, "employer", 851_500, "Дрова");
  await fillProfile(request, emp, {
    company_name: "Кофейня «Дрова»",
    city: "Юрьев-Польский",
    address: "ул. Ленина, 5",
    contact_phone: "+79998515",
  });
  // Смен несколько: после отклика колода не должна опустеть. С одной сменой
  // круглые кнопки исчезали вместе с колодой — проверка проходила вхолостую,
  // ничего не измерив.
  const vac = await publishShift(request, emp, { days: 1, city: "Юрьев-Польский" });
  await publishShift(request, emp, { days: 2, city: "Юрьев-Польский" });
  await publishShift(request, emp, { days: 3, city: "Юрьев-Польский" });
  const seeker = await login(request, "seeker", 851_501, "Мария");
  await fillProfile(request, seeker, {
    name: "Мария",
    city: "Юрьев-Польский",
    district: "Центр",
    roles: ["barista"],
    birth_date: "1998-04-12",
    med_book: "yes",
  });

  // Заведение позвало первым — значит отклик работника сразу даст «Взаимно!».
  await request.post(`${API_URL}/swipes`, {
    headers: auth(emp),
    data: {
      target_id: seeker.id,
      target_type: "user",
      direction: "like",
      vacancy_id: vac.id,
    },
  });

  const { context, page } = await openApp(browser, seeker);
  await page.setViewportSize(PHONE);
  await page.goto("/#/feed");
  await waitForStableLayout(page, ".page");
  await page.getByRole("button", { name: "Отклик" }).click();

  await expect(page.locator(".overlay")).toBeVisible();
  await expect(page.locator(".overlay")).toContainText("Взаимно!");
  // Конфетти летят через весь экран; ждём, пока картинка встанет.
  await page.waitForTimeout(700);

  const caught = await whatCatchesDeckButtons(page);
  // Пустой список — не «всё хорошо», а «нечего было мерить»: ровно так эта
  // проверка однажды и прошла вхолостую.
  expect(caught.length, "кнопки колоды должны существовать под оверлеем").toBeGreaterThan(0);
  for (const x of caught) {
    expect(x.caught, `«${x.button}» осталась поверх экрана «Взаимно!»`).not.toBe("act");
  }

  await context.close();
});
