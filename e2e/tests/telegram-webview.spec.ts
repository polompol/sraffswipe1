import { expect, test, type Page } from "@playwright/test";

import { login, openApp, waitForStableLayout } from "../harness/app";

const COMPACT = { width: 320, height: 568 };
const LARGE = { width: 430, height: 932 };

async function setTelegramInsets(page: Page) {
  await page.evaluate(() => {
    const s = document.documentElement.style;
    s.setProperty("--tg-viewport-safe-area-inset-top", "47px");
    s.setProperty("--tg-viewport-safe-area-inset-bottom", "34px");
    s.setProperty("--tg-viewport-safe-area-inset-left", "24px");
    s.setProperty("--tg-viewport-safe-area-inset-right", "26px");
    s.setProperty("--tg-viewport-content-safe-area-inset-top", "59px");
    s.setProperty("--tg-viewport-content-safe-area-inset-bottom", "48px");
    s.setProperty("--tg-viewport-content-safe-area-inset-left", "28px");
    s.setProperty("--tg-viewport-content-safe-area-inset-right", "31px");
  });
}

async function readPageInsets(page: Page) {
  return page.evaluate(() => {
    const app = document.querySelector(".app") as HTMLElement;
    const content = document.querySelector(".page") as HTMLElement;
    const appStyle = getComputedStyle(app);
    const pageStyle = getComputedStyle(content);
    return {
      top: parseFloat(appStyle.paddingTop),
      left: parseFloat(pageStyle.paddingLeft),
      right: parseFloat(pageStyle.paddingRight),
      bottom: parseFloat(pageStyle.paddingBottom),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

for (const size of [COMPACT, LARGE]) {
  test(`safe-area не перекрывает support на ${size.width}×${size.height}`, async ({
    browser,
    request,
  }) => {
    const seeker = await login(
      request,
      "seeker",
      861_000 + size.width,
      `Safe ${size.width}`,
    );
    const { context, page } = await openApp(browser, seeker);
    await page.setViewportSize(size);
    await page.goto("/#/support");
    await waitForStableLayout(page, ".page");
    await setTelegramInsets(page);

    const m = await readPageInsets(page);
    expect(m.top, "контент должен быть ниже content-safe-area сверху").toBeGreaterThanOrEqual(59);
    expect(m.left, "контент должен учитывать левый content-safe-area").toBeGreaterThanOrEqual(28);
    expect(m.right, "контент должен учитывать правый content-safe-area").toBeGreaterThanOrEqual(31);
    expect(m.bottom, "нижний отступ страницы должен включать safe-area").toBeGreaterThanOrEqual(136);
    expect(m.overflowX, "safe-area не должен создавать горизонтальный скролл").toBe(0);

    await context.close();
  });
}

test("нижняя навигация остаётся выше Telegram bottom safe-area", async ({
  browser,
  request,
}) => {
  const seeker = await login(request, "seeker", 861_500, "Bottom safe");
  const { context, page } = await openApp(browser, seeker);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/profile");
  await waitForStableLayout(page, ".page");
  await setTelegramInsets(page);

  const m = await page.evaluate(() => {
    const bar = document.querySelector(".tabbar") as HTMLElement;
    const style = getComputedStyle(bar);
    return {
      bottomPadding: parseFloat(style.paddingBottom),
      leftPadding: parseFloat(style.paddingLeft),
      rightPadding: parseFloat(style.paddingRight),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(m.bottomPadding).toBeGreaterThanOrEqual(52);
  expect(m.leftPadding).toBeGreaterThanOrEqual(28);
  expect(m.rightPadding).toBeGreaterThanOrEqual(31);
  expect(m.overflowX).toBe(0);

  await context.close();
});

test("support остаётся доступным в крупном режиме на 320×568 с safe-area", async ({
  browser,
  request,
}) => {
  const seeker = await login(request, "seeker", 861_600, "Large safe");
  const { context, page } = await openApp(browser, seeker, { ss_large: "1" });
  await page.setViewportSize(COMPACT);
  await page.goto("/#/support");
  await waitForStableLayout(page, ".page");
  await setTelegramInsets(page);

  await expect(page.getByLabel("Тема обращения")).toBeVisible();
  await expect(page.getByLabel("Опишите проблему")).toBeVisible();
  const submit = page.getByRole("button", { name: "Отправить обращение" });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeVisible();

  const box = await submit.boundingBox();
  expect(box?.height ?? 0, "главная кнопка должна иметь зону тапа минимум 44px")
    .toBeGreaterThanOrEqual(44);

  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowX, "крупный текст + safe-area не должны уводить экран вбок").toBe(0);

  await context.close();
});