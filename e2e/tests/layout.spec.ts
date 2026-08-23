import { expect, test } from "@playwright/test";
import { API_URL } from "../harness/env";
import { auth, fillProfile, login, openApp, publishShift } from "../harness/app";

/**
 * РАСКЛАДКА НА РАЗНЫХ ТЕЛЕФОНАХ — постоянная проверка вместо разовых замеров.
 *
 * Здесь ловится целый класс поломок, которого не видно ни в одном обычном
 * тесте: всё «работает», а на экране половина не помещается.
 *
 * Что уже было поймано руками и теперь не должно вернуться:
 *   • раскладка ленты менялась скачком на высоте 700 точек — на экране 700
 *     карточка занимала 71% высоты, на 701 уже 53%. В эту ступеньку попадали
 *     Galaxy S8–S10 (360×740) и iPhone 8 Plus (414×736), и на них у карточки
 *     обрезался низ: «На карту в день» и «Медкнижка» просто не показывались;
 *   • строка «код прихода» уносила «Мои смены» за правый край экрана;
 *   • круглые кнопки и кнопка «Детали смены» перекрывались невидимыми
 *     украшениями и не нажимались.
 *
 * Размеры — не круглые числа «для красоты», а настоящие телефоны.
 */
const PHONES = [
  { name: "старый iPhone SE", w: 320, h: 568 },
  { name: "дешёвый андроид", w: 360, h: 640 },
  { name: "iPhone SE 2020", w: 375, h: 667 },
  { name: "iPhone 8 Plus", w: 414, h: 736 },
  { name: "Galaxy S10", w: 360, h: 740 },
  { name: "iPhone 12 mini", w: 375, h: 812 },
  { name: "iPhone 14", w: 390, h: 844 },
  { name: "Pixel 7", w: 412, h: 915 },
  { name: "iPhone 15 Pro Max", w: 430, h: 932 },
];

test.describe("лента на любом телефоне", () => {
  test.beforeAll(async ({ request }) => {
    const emp = await login(request, "employer", 830_001, "Дрова");
    await fillProfile(request, emp, {
      company_name: "Кофейня «Дрова»",
      city: "Санкт-Петербург",
      address: "ул. Льва Толстого, 16",
      contact_phone: "+79990000003",
    });
    await publishShift(request, emp, { city: "Санкт-Петербург" });

    const seeker = await login(request, "seeker", 830_002, "Мария");
    await fillProfile(request, seeker, {
      name: "Мария",
      city: "Санкт-Петербург",
      district: "Басманный",
      roles: ["barista"],
      birth_date: "1998-04-12",
      med_book: "yes",
      about: "Опыт в кофейне, знаю Rancilio.",
    });
    await request.post(`${API_URL}/me/available`, {
      headers: auth(seeker),
      data: { available: true },
    });
  });

  for (const phone of PHONES) {
    test(`${phone.name} (${phone.w}×${phone.h})`, async ({ browser, request }) => {
      const seeker = await login(request, "seeker", 830_002, "Мария");
      const { context, page } = await openApp(browser, seeker);
      await page.setViewportSize({ width: phone.w, height: phone.h });
      await page.goto("/#/feed");
      await expect(page.locator(".swipe-card").first()).toBeVisible();

      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const deck = document.querySelector(".deck")!.getBoundingClientRect();
        const body = document.querySelector(".swipe-body") as HTMLElement;
        const acts = document.querySelector(".actions")!.getBoundingClientRect();
        // Текст, заехавший под круглые кнопки: сравниваем каждый блок карточки
        // с полосой кнопок.
        let underButtons = 0;
        for (const child of Array.from(body.children)) {
          const r = child.getBoundingClientRect();
          if (r.height > 0 && r.bottom > acts.top) {
            underButtons = Math.max(underButtons, Math.round(r.bottom - acts.top));
          }
        }
        // Что реально под пальцем в центре каждой круглой кнопки.
        const reachable = Array.from(document.querySelectorAll(".act")).every(
          (a) => {
            const r = a.getBoundingClientRect();
            const el = document.elementFromPoint(
              r.left + r.width / 2,
              r.top + r.height / 2,
            );
            return !!el && !!el.closest(".act");
          },
        );
        // Подробности открываются касанием карточки, поэтому проверяем не
        // кнопку, а саму карточку: не накрыта ли она украшением. Именно так
        // ломался штамп ХОЧУ/НЕТ — прозрачный, но ловящий нажатия.
        const cardEl = document.querySelector(".swipe-card")!;
        const cr = cardEl.getBoundingClientRect();
        const hit = document.elementFromPoint(cr.left + 40, cr.top + 60);
        const detailsReachable = !!hit && !!hit.closest(".swipe-card");
        return {
          overflowX: de.scrollWidth - de.clientWidth,
          deckShare: Math.round((deck.height / window.innerHeight) * 100),
          clipped: body.scrollHeight - body.clientHeight,
          underButtons,
          reachable,
          detailsReachable,
        };
      });

      expect(m.overflowX, "экран не должен ездить вбок").toBe(0);
      expect(m.reachable, "круглые кнопки должны нажиматься").toBe(true);
      expect(m.detailsReachable, "карточка должна принимать касание").toBe(true);
      // Карточка — главный предмет на экране. Ниже 60% она перестаёт им быть.
      expect(m.deckShare, "доля экрана под карточкой").toBeGreaterThanOrEqual(60);
      // Пара точек — округление подпиксельных высот, не потерянная строка.
      expect(m.clipped, "низ карточки не должен обрезаться").toBeLessThanOrEqual(4);
      expect(m.underButtons, "текст не должен уезжать под кнопки").toBeLessThanOrEqual(4);

      await context.close();
    });
  }
});

test.describe("мои смены на узком экране", () => {
  test("страница не уезжает вбок на 320 точках", async ({ browser, request }) => {
    const emp = await login(request, "employer", 830_010, "Полночь");
    await fillProfile(request, emp, {
      company_name: "Бар «Полночь»",
      city: "Санкт-Петербург",
      address: "Покровка, 5",
      contact_phone: "+79990000004",
    });
    const vac = await publishShift(request, emp, { role: "bartender", city: "Санкт-Петербург" });

    const seeker = await login(request, "seeker", 830_011, "Пётр");
    await fillProfile(request, seeker, {
      name: "Пётр",
      city: "Санкт-Петербург",
      roles: ["bartender"],
      birth_date: "1995-01-01",
      med_book: "yes",
    });
    await request.post(`${API_URL}/swipes`, {
      headers: auth(seeker),
      data: { target_id: vac.id, target_type: "vacancy", direction: "like" },
    });
    await request.post(`${API_URL}/swipes`, {
      headers: auth(emp),
      data: {
        target_id: seeker.id,
        target_type: "user",
        direction: "like",
        vacancy_id: vac.id,
      },
    });

    // Крупный режим для слабого зрения — там текст больше, и вылезало сильнее.
    for (const large of [false, true]) {
      const { context, page } = await openApp(
        browser,
        seeker,
        large ? { ss_large: "1" } : {},
      );
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto("/#/matches");
      await expect(page.locator(".card").first()).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const bar = document.querySelector(".tabbar")!.getBoundingClientRect();
        const cards = Array.from(document.querySelectorAll(".card"));
        const last = cards[cards.length - 1].getBoundingClientRect();
        const tiny = Array.from(
          document.querySelectorAll("button, a, [role=button]"),
        ).filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5);
        }).length;
        return {
          overflowX: de.scrollWidth - de.clientWidth,
          gapToTabbar: Math.round(bar.top - last.bottom),
          tiny,
        };
      });

      expect(m.overflowX, `вбок (крупный режим: ${large})`).toBe(0);
      expect(m.gapToTabbar, "список не должен заезжать под панель вкладок")
        .toBeGreaterThanOrEqual(0);
      expect(m.tiny, "зон нажатия меньше 44 точек быть не должно").toBe(0);

      await context.close();
    }
  });
});

test.describe("клавиатура в чате", () => {
  test("поле ввода не прячется под клавиатурой", async ({ browser, request }) => {
    const emp = await login(request, "employer", 830_020, "Грядка");
    await fillProfile(request, emp, {
      company_name: "Ресторан «Грядка»",
      city: "Санкт-Петербург",
      address: "Покровка, 12",
      contact_phone: "+79990000005",
    });
    const vac = await publishShift(request, emp, {
      role: "cook",
      city: "Санкт-Петербург",
    });

    const seeker = await login(request, "seeker", 830_021, "Ольга");
    await fillProfile(request, seeker, {
      name: "Ольга",
      city: "Санкт-Петербург",
      roles: ["cook"],
      birth_date: "1994-03-03",
      med_book: "yes",
    });
    await request.post(`${API_URL}/swipes`, {
      headers: auth(seeker),
      data: { target_id: vac.id, target_type: "vacancy", direction: "like" },
    });
    const out = await (
      await request.post(`${API_URL}/swipes`, {
        headers: auth(emp),
        data: {
          target_id: seeker.id,
          target_type: "user",
          direction: "like",
          vacancy_id: vac.id,
        },
      })
    ).json();

    const { context, page } = await openApp(browser, seeker);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/#/chat/${out.match_id}`);
    const input = page.getByLabel("Текст сообщения");
    await expect(input).toBeVisible();

    // Настоящую клавиатуру в браузере не поднять, но она делает ровно одно:
    // урезает видимую часть окна снизу. Именно это и повторяем — и заодно
    // проверяем, что панель ввода читает переменную --kb, а не игнорирует её.
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--kb", "336px");
    });

    const m = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Текст сообщения"]')!;
      // Панель ввода — ближайший предок, приклеенный к низу окна.
      let bar: HTMLElement = el as HTMLElement;
      while (bar.parentElement && getComputedStyle(bar).position !== "fixed") {
        bar = bar.parentElement;
      }
      const r = bar.getBoundingClientRect();
      // Низ видимой части экрана при поднятой клавиатуре.
      const visibleBottom = window.innerHeight - 336;
      return {
        barBottom: Math.round(r.bottom),
        visibleBottom,
        inputVisible: Math.round(el.getBoundingClientRect().bottom),
      };
    });

    expect(
      m.barBottom,
      "панель ввода должна подняться над клавиатурой",
    ).toBeLessThanOrEqual(m.visibleBottom + 1);
    expect(m.inputVisible).toBeLessThanOrEqual(m.visibleBottom + 1);

    await context.close();
  });
});

test.describe("главные фильтры на экране", () => {
  test("работник видит свои четыре, заведение — свои", async ({ browser, request }) => {
    const emp = await login(request, "employer", 830_030, "Дрова");
    await fillProfile(request, emp, {
      company_name: "Кофейня «Дрова»",
      city: "Екатеринбург",
      address: "Ленина, 1",
      contact_phone: "+79990000006",
    });
    await publishShift(request, emp, { city: "Екатеринбург", days: 2 });
    await publishShift(request, emp, { city: "Екатеринбург", days: 0, role: "cook" });

    const seeker = await login(request, "seeker", 830_031, "Дарья");
    await fillProfile(request, seeker, {
      name: "Дарья",
      city: "Екатеринбург",
      roles: ["barista", "cook"],
      birth_date: "1997-07-07",
      med_book: "yes",
    });
    await request.post(`${API_URL}/me/available`, {
      headers: auth(seeker),
      data: { available: true },
    });

    // Работник: город со счётчиком, «Сегодня», «Роль», «Оплата».
    const a = await openApp(browser, seeker);
    await a.page.goto("/#/feed");
    await expect(a.page.locator(".swipe-card").first()).toBeVisible();
    const seekerChips = a.page.locator(".chip");
    await expect(seekerChips).toHaveCount(4);
    await expect(seekerChips.first()).toContainText("Екатеринбург");

    // Счётчик показывает, сколько нашлось — по нему видно, что фильтр сузил
    // ленту, а не что смен нет. Ради этого он и стоит на чипе.
    const before = (await seekerChips.first().innerText()).trim();
    await a.page.getByRole("button", { name: "Сегодня", exact: true }).click();
    await expect(seekerChips.first()).not.toHaveText(before);
    await expect(
      a.page.locator(".chip", { hasText: "Сегодня" }),
    ).toHaveClass(/chip-on/);
    await a.context.close();

    // Заведение: другой набор — у него другой вопрос.
    const b = await openApp(browser, emp);
    await b.page.goto("/#/feed");
    await expect(b.page.locator(".swipe-card").first()).toBeVisible();
    const empChips = b.page.locator(".chip");
    await expect(empChips).toHaveCount(5);
    for (const name of ["Сегодня", "Роль", "Район", "Надёжность"]) {
      await expect(b.page.locator(".chip", { hasText: name })).toHaveCount(1);
    }
    // «Надёжность» — переключатель, не выбор: стрелки у него быть не должно.
    await b.page.getByRole("button", { name: "Надёжность", exact: true }).click();
    await expect(
      b.page.locator(".chip", { hasText: "Без неявок" }),
    ).toHaveClass(/chip-on/);
    await b.context.close();
  });
});
