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
import { report, sweep } from "../harness/paint";

/**
 * ВИД ЭКРАНОВ: тёмная тема, крупный шрифт, длинные названия.
 *
 * Проверки раскладки (layout.spec) отвечают на вопрос «помещается ли». Здесь
 * другой вопрос — «читается ли»: контраст текста к фону, зоны нажатия и
 * поведение при крупном системном шрифте и длинных названиях.
 *
 * Всё меряется на живой странице: цвет текста складывается из наследования,
 * темы и десятка правил, и по исходникам стилей ответа не получить. Ровно
 * так когда-то и разъехались цвета тёмной темы — «Смена подтверждена»
 * читалась хуже соседней обычной строки, а в коде всё выглядело правильно.
 */
const PHONE = { width: 360, height: 640 };

const SEEKER_SCREENS = ["/feed", "/matches", "/profile", "/settings", "/invites"];
const EMPLOYER_SCREENS = ["/feed", "/matches", "/vacancy/my", "/applicants"];

/** Сцена под один тест.
 *
 *  У каждого теста своё заведение и свои работники: публикация смен
 *  ограничена десятью в час на заведение — это боевое правило, и общая на всех
 *  сцена в него упиралась на шестом тесте.
 */
async function scene(request: Parameters<typeof login>[0], seed: number) {
  const emp = await login(request, "employer", seed + 1, "Дрова");
  await fillProfile(request, emp, {
    company_name: "Кофейня «Дрова»",
    city: "Москва",
    address: "ул. Льва Толстого, 16",
    contact_phone: `+7999${String(seed).slice(0, 7)}`,
  });
  // Две смены: на одну работник откликается сам (получается мэтч), вторая
  // остаётся приглашением — иначе экран «Кто меня зовёт» пустой, и проверять
  // на нём нечего.
  const vac = await publishShift(request, emp);
  const other = await publishShift(request, emp, { role: "waiter", days: 3 });

  const seeker = await login(request, "seeker", seed + 2, "Мария");
  await fillProfile(request, seeker, {
    name: "Мария",
    city: "Москва",
    district: "Басманный",
    roles: ["barista"],
    birth_date: "1998-04-12",
    med_book: "yes",
    about: "Опыт в кофейне, знаю Rancilio.",
  });
  // Отклик работника и приглашение от заведения — чтобы списки были не пустые.
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
  // Ещё один человек откликается и ответа пока не получил — иначе экран
  // «Кто откликнулся» у заведения пустой.
  const applicant = await login(request, "seeker", seed + 3, "Игорь");
  await fillProfile(request, applicant, {
    name: "Игорь",
    city: "Москва",
    roles: ["waiter"],
    birth_date: "1994-06-01",
    med_book: "yes",
  });
  await request.post(`${API_URL}/swipes`, {
    headers: auth(applicant),
    data: { target_id: other.id, target_type: "vacancy", direction: "like" },
  });

  return { emp, seeker };
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`тема: ${theme === "dark" ? "тёмная" : "светлая"}`, () => {
    test("текст читается на всех экранах работника", async ({
      browser,
      request,
    }) => {
      const { seeker } = await scene(request, theme === "dark" ? 843_100 : 843_200);
      const { context, page } = await openApp(browser, seeker, {
        ss_theme: theme,
      });
      await page.setViewportSize(PHONE);
      for (const screen of SEEKER_SCREENS) {
        await page.goto(`/#${screen}`);
        // Ждём, пока экран перестанет двигаться: колода въезжает пружиной, и
        // на промежуточном кадре карточка ещё уменьшена — замеры зон нажатия
        // ловили 42 точки вместо 44.
        await waitForStableLayout(page, ".page");
        const m = await sweep(page);
        // Страховка от «проверка ничего не смотрит»: если текст перестал
        // читаться из стилей (весь уехал на фотографию), тест должен упасть,
        // а не молча проходить.
        expect(
          m.checked,
          `${screen}: проверено ${m.checked} кусков текста, ` +
            `${m.onImage} на фотографии`,
        ).toBeGreaterThan(8);
        expect(m.contrast, `${screen}:\n${report(m.contrast)}`).toEqual([]);
        expect(m.overflowX, `${screen}: экран не должен ездить вбок`).toBe(0);
        expect(m.tiny, `${screen}: мелкие зоны нажатия ${m.tinyWhere}`).toBe(0);
      }
      await context.close();
    });

    test("текст читается на всех экранах заведения", async ({
      browser,
      request,
    }) => {
      const { emp } = await scene(request, theme === "dark" ? 843_300 : 843_400);
      const { context, page } = await openApp(browser, emp, { ss_theme: theme });
      await page.setViewportSize(PHONE);
      for (const screen of EMPLOYER_SCREENS) {
        await page.goto(`/#${screen}`);
        // Ждём, пока экран перестанет двигаться: колода въезжает пружиной, и
        // на промежуточном кадре карточка ещё уменьшена — замеры зон нажатия
        // ловили 42 точки вместо 44.
        await waitForStableLayout(page, ".page");
        const m = await sweep(page);
        // Страховка от «проверка ничего не смотрит»: если текст перестал
        // читаться из стилей (весь уехал на фотографию), тест должен упасть,
        // а не молча проходить.
        expect(
          m.checked,
          `${screen}: проверено ${m.checked} кусков текста, ` +
            `${m.onImage} на фотографии`,
        ).toBeGreaterThan(8);
        expect(m.contrast, `${screen}:\n${report(m.contrast)}`).toEqual([]);
        expect(m.overflowX, `${screen}: экран не должен ездить вбок`).toBe(0);
        expect(m.tiny, `${screen}: мелкие зоны нажатия ${m.tinyWhere}`).toBe(0);
      }
      await context.close();
    });
  });
}

test("крупный шрифт ничего не ломает", async ({ browser, request }) => {
  const { seeker } = await scene(request, 843_500);
  const { context, page } = await openApp(browser, seeker, { ss_large: "1" });
  await page.setViewportSize({ width: 320, height: 568 });
  for (const screen of SEEKER_SCREENS) {
    await page.goto(`/#${screen}`);
    await waitForStableLayout(page, ".page");
    const m = await sweep(page);
    expect(m.overflowX, `${screen}: вбок при крупном шрифте`).toBe(0);
    expect(m.contrast, `${screen}:\n${report(m.contrast)}`).toEqual([]);
  }
  await context.close();
});

test("длинное название и адрес не ломают карточку", async ({
  browser,
  request,
}) => {
  const emp = await login(request, "employer", 840_010, "Длинное");
  await fillProfile(request, emp, {
    // Настоящая беда живых данных: сети называются длинно, а адрес приходит
    // из справочника целиком, вместе с городом и индексом.
    company_name: "Ресторанно-гастрономический комплекс «Северное Сияние» на Мясницкой",
    city: "Москва",
    address: "город Москва, Центральный административный округ, Мясницкая улица, дом 24/7, строение 1",
    contact_phone: "+79990000012",
  });
  await publishShift(request, emp);

  const seeker = await login(request, "seeker", 840_011, "Константин");
  await fillProfile(request, seeker, {
    name: "Константин-Александр Вержбицкий-Загорский",
    city: "Москва",
    roles: ["barista"],
    birth_date: "1990-02-02",
    med_book: "yes",
    // Фото нет намеренно: у половины анкет его не будет.
  });

  const { context, page } = await openApp(browser, seeker);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/#/feed");
  await expect(page.locator(".swipe-card").first()).toBeVisible();
  await waitForStableLayout(page, ".swipe-card");
  const m = await sweep(page);
  expect(m.overflowX, "длинное название не должно уводить экран вбок").toBe(0);
  expect(m.contrast, `лента:\n${report(m.contrast)}`).toEqual([]);

  // И у заведения в ленте кандидатов — длинное имя человека без фото.
  const empApp = await openApp(browser, emp);
  await empApp.page.setViewportSize({ width: 320, height: 568 });
  await empApp.page.goto("/#/feed");
  await waitForStableLayout(empApp.page, ".swipe-card");
  const e = await sweep(empApp.page);
  expect(e.overflowX, "длинное имя не должно уводить экран вбок").toBe(0);
  expect(e.contrast, `кандидаты:\n${report(e.contrast)}`).toEqual([]);

  await context.close();
  await empApp.context.close();
});

test("шторки и чат читаются так же, как экраны", async ({ browser, request }) => {
  // Шторки закрывают собой экран целиком, и текста в них не меньше, чем на
  // странице: условия смены, что взять с собой, фильтры. Проверять их
  // отдельно нужно потому, что фон у них свой.
  const { seeker } = await scene(request, 843_600);
  const { context, page } = await openApp(browser, seeker, { ss_theme: "dark" });
  await page.setViewportSize(PHONE);
  await page.goto("/#/feed");
  await waitForStableLayout(page, ".page");

  // Подробности смены — на изнанке карточки, касанием. Проверять её отдельно
  // важнее, чем прежнюю шторку: изнанка светлая, а кнопки «Пропустить/Отклик»
  // лежат ПОВЕРХ неё и живут вне карточки — их белые подписи рассчитаны на
  // тёмную лицевую сторону и на светлой изнанке пропадали совсем.
  await page.locator(".swipe-card").first().click({ position: { x: 40, y: 60 } });
  await expect(page.locator(".swipe-card.is-flipped")).toBeVisible();
  await page.waitForTimeout(600); // переворот длится 0,45 с
  const details = await sweep(page);
  expect(details.checked, "на изнанке должен быть текст").toBeGreaterThan(8);
  expect(details.contrast, `изнанка карточки:\n${report(details.contrast)}`).toEqual([]);
  expect(details.overflowX, "изнанка не должна ездить вбок").toBe(0);
  expect(details.tiny, `мелкие зоны нажатия ${details.tinyWhere}`).toBe(0);
  // Возвращаем карточку лицом — дальше проверяются фильтры поверх ленты.
  // Ждать обязательно: невидимая сторона гаснет на СЕРЕДИНЕ переворота, и без
  // паузы следующий замер успевает застать её ещё видимой и посчитать её
  // текст на чужом фоне.
  await page.locator(".swipe-card").first().click({ position: { x: 40, y: 60 } });
  await expect(page.locator(".swipe-card.is-flipped")).toHaveCount(0);
  await page.waitForTimeout(600);

  // Фильтры.
  await page.getByRole("button", { name: /^Фильтры/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const filters = await sweep(page);
  expect(filters.checked, "в фильтрах должен быть текст").toBeGreaterThan(8);
  expect(filters.contrast, `фильтры:\n${report(filters.contrast)}`).toEqual([]);
  expect(filters.overflowX, "фильтры не должны ездить вбок").toBe(0);
  expect(filters.tiny, `мелкие зоны нажатия ${filters.tinyWhere}`).toBe(0);
  await page.keyboard.press("Escape");

  // Чат смены — у работника он уже есть: заведение позвало в ответ.
  await page.goto("/#/matches");
  await waitForStableLayout(page, ".page");
  await page.getByRole("button", { name: /Открыть чат/ }).first().click();
  await expect(page.locator(".page.chat")).toBeVisible();
  await waitForStableLayout(page, ".page");
  const chat = await sweep(page);
  expect(chat.checked, "в чате должен быть текст").toBeGreaterThan(8);
  expect(chat.contrast, `чат:\n${report(chat.contrast)}`).toEqual([]);
  expect(chat.overflowX, "чат не должен ездить вбок").toBe(0);
  expect(chat.tiny, `мелкие зоны нажатия ${chat.tinyWhere}`).toBe(0);

  await context.close();
});

/**
 * ИЗНАНКА КАРТОЧКИ — во всех темах и режимах, у обеих сторон рынка.
 *
 * Отдельно от проверки экранов, потому что фон у изнанки свой: она светлая
 * там, где лицевая сторона тёмная, и цвета, выверенные для багрового
 * градиента, на ней ведут себя иначе. Один раз это уже стоило дефекта —
 * белые подписи кнопок на светлой изнанке пропадали совсем.
 *
 * До этой проверки изнанку мерили только в тёмной теме, и светлая со
 * старым крупным режимом оставались без присмотра.
 */
const BACK_CASES: Array<[string, { width: number; height: number }, Record<string, string>]> = [
  ["светлая тема", { width: 390, height: 844 }, {}],
  ["тёмная тема", { width: 390, height: 844 }, { ss_theme: "dark" }],
  ["крупный шрифт", { width: 390, height: 844 }, { ss_large: "1" }],
  ["крупный и тёмная", { width: 390, height: 844 }, { ss_large: "1", ss_theme: "dark" }],
  ["дешёвый андроид", { width: 320, height: 568 }, {}],
  ["дешёвый андроид, тёмная", { width: 320, height: 568 }, { ss_theme: "dark" }],
];

for (const [name, size, extra] of BACK_CASES) {
  test(`изнанка карточки читается — ${name}`, async ({ browser, request }) => {
    const seed = 847_000 + size.width + Object.keys(extra).length * 7;
    const emp = await login(request, "employer", seed, "Дрова");
    await fillProfile(request, emp, {
      company_name: "Кофейня «Дрова»",
      city: "Москва",
      address: "ул. Льва Толстого, 16",
      contact_phone: `+799900${seed % 100000}`,
    });
    await publishShift(request, emp);
    const seeker = await login(request, "seeker", seed + 1, "Мария");
    await fillProfile(request, seeker, {
      name: "Мария", city: "Москва", district: "Хамовники",
      roles: ["barista", "waiter"], birth_date: "1998-04-12", med_book: "yes",
      self_employed: true, about: "Работала в сетевой кофейне два года.",
      experience_tags: ["experienced", "cashRegister"],
    });

    // Обе стороны: у работника изнанка смены, у заведения — человека. Содержимое
    // разное, и цвета на них проверять надо порознь.
    for (const [who, кто] of [[seeker, "работник"], [emp, "заведение"]] as const) {
      const { context, page } = await openApp(browser, who, extra);
      await page.setViewportSize(size);
      await page.goto("/#/feed");
      await waitForStableLayout(page, ".page");
      await page.locator(".swipe-card").first().click({ position: { x: 60, y: 120 } });
      await expect(page.locator(".swipe-card.is-flipped")).toBeVisible();
      // Переворот 0,45 с; мерить надо по неподвижной картинке.
      await page.waitForTimeout(700);

      const p = await sweep(page);
      expect(p.checked, `${кто}: на изнанке должен быть текст`).toBeGreaterThan(6);
      expect(p.contrast, `${кто}, изнанка (${name}):\n${report(p.contrast)}`).toEqual([]);
      expect(p.overflowX, `${кто}: изнанка не должна ездить вбок`).toBe(0);
      expect(p.tiny, `${кто}: мелкие зоны нажатия ${p.tinyWhere}`).toBe(0);
      await context.close();
    }
  });
}
