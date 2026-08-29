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

async function scene(request: Parameters<typeof login>[0]) {
  const emp = await login(request, "employer", 840_001, "Дрова");
  await fillProfile(request, emp, {
    company_name: "Кофейня «Дрова»",
    city: "Москва",
    address: "ул. Льва Толстого, 16",
    contact_phone: "+79990000011",
  });
  // Две смены: на одну работник откликается сам (получается мэтч), вторая
  // остаётся приглашением — иначе экран «Кто меня зовёт» пустой, и проверять
  // на нём нечего.
  const vac = await publishShift(request, emp);
  const other = await publishShift(request, emp, { role: "waiter", days: 3 });

  const seeker = await login(request, "seeker", 840_002, "Мария");
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
  const applicant = await login(request, "seeker", 840_003, "Игорь");
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
      const { seeker } = await scene(request);
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
      const { emp } = await scene(request);
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
  const { seeker } = await scene(request);
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
