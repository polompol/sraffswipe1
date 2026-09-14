import { expect, test } from "@playwright/test";
import { fillProfile, login, openApp } from "../harness/app";

// Геометрия настоящего приложения. Telegram передаёт insets через SDK;
// здесь проверяем их применение, а не выдаём браузер за реальный Telegram.
for (const size of [
  { width: 320, height: 568, large: false },
  { width: 844, height: 390, large: false },
  { width: 1024, height: 768, large: true },
]) {
  test(`безопасные края ${size.width}×${size.height}`, async ({ browser, request }) => {
    const emp = await login(request, "employer", 860_001, "Белла");
    await fillProfile(request, emp, {
      company_name: "Bella Tavola", city: "Москва", address: "Тверская, 12",
      contact_phone: "+79990000009",
    });
    const { context, page } = await openApp(browser, emp, size.large ? { ss_large: "1" } : {});
    await page.setViewportSize(size);
    await page.goto("/#/profile");
    await expect(page.getByText("Bella Tavola", { exact: true }).first()).toBeVisible();
    await page.evaluate(() => {
      const style = document.documentElement.style;
      style.setProperty("--tg-viewport-content-safe-area-inset-left", "44px");
      style.setProperty("--tg-viewport-content-safe-area-inset-right", "28px");
      style.setProperty("--tg-viewport-content-safe-area-inset-top", "24px");
      style.setProperty("--tg-viewport-safe-area-inset-bottom", "34px");
    });
    const bounds = await page.evaluate(() => {
      const content = getComputedStyle(document.querySelector(".page")!);
      const nav = getComputedStyle(document.querySelector(".tabbar")!);
      return {
        left: parseFloat(content.paddingLeft), right: parseFloat(content.paddingRight),
        navLeft: parseFloat(nav.paddingLeft), navRight: parseFloat(nav.paddingRight),
        navBottom: parseFloat(nav.paddingBottom),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(44);
    expect(bounds.right).toBeGreaterThanOrEqual(28);
    expect(bounds.navLeft).toBeGreaterThanOrEqual(44);
    expect(bounds.navRight).toBeGreaterThanOrEqual(28);
    expect(bounds.navBottom).toBeGreaterThanOrEqual(34);
    expect(bounds.overflow).toBe(0);
    await context.close();
  });
}

test("подтверждение пополнения помещается в Telegram-шторку", async ({ browser, request }, info) => {
  const emp = await login(request, "employer", 860_002, "Белла");
  await fillProfile(request, emp, {
    company_name: "Bella Tavola", city: "Москва", address: "Тверская, 12",
    contact_phone: "+79990000009",
  });
  const { context, page } = await openApp(browser, emp);
  await page.setViewportSize({ width: 390, height: 844 });
  // Реальный платёж не создаём. Только ответ чтения доступности провайдера.
  await page.route("**/billing/commission", (route) => route.fulfill({ json: {
    pct: 10, pending_rub: 0, pending_shifts: 0, balance_rub: 0,
    overdue: false, topup_available: true, docs_available: false, due_days: 14,
  } }));
  let paymentRequests = 0;
  await page.route("**/billing/wallet/topup", (route) => {
    paymentRequests += 1;
    return route.abort();
  });
  await page.goto("/#/profile");
  await page.getByRole("button", { name: /3\s*000\s*₽/ }).click();
  const dialog = page.getByRole("dialog", { name: "Пополнить баланс" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("не оплата работы сотрудника");
  expect(paymentRequests).toBe(0);
  await page.screenshot({ path: info.outputPath("payment-confirm.jpg"), scale: "css", animations: "disabled" });

  // Поворот телефона и безопасные края во время открытой шторки.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--tg-viewport-content-safe-area-inset-left", "44px");
    document.documentElement.style.setProperty("--tg-viewport-content-safe-area-inset-right", "28px");
    document.documentElement.style.setProperty("--tg-viewport-safe-area-inset-bottom", "21px");
  });
  const footer = await page.locator(".sheet-foot").evaluate((el) => {
    const s = getComputedStyle(el);
    return { left: parseFloat(s.paddingLeft), right: parseFloat(s.paddingRight) };
  });
  expect(footer.left).toBeGreaterThanOrEqual(44);
  expect(footer.right).toBeGreaterThanOrEqual(28);
  await expect(dialog.getByRole("button", { name: "Перейти к оплате" })).toBeInViewport();
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toHaveCount(0);
  expect(paymentRequests).toBe(0);
  await context.close();
});
