import { expect, test } from "@playwright/test";

import { login, openApp, waitForStableLayout } from "../harness/app";

test("обращение поддержки получает номер и переживает перезагрузку", async ({
  browser,
  request,
}) => {
  const seeker = await login(request, "seeker", 856_001, "Светлана");
  const { context, page } = await openApp(browser, seeker);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/#/support");
  await waitForStableLayout(page, ".page");
  await expect(
    page.getByRole("heading", { name: "Сообщить о проблеме" }),
  ).toBeVisible();

  await page.getByLabel("Тема обращения").selectOption("payment");
  await page
    .getByLabel("Опишите проблему")
    .fill("Не вижу подтверждение оплаты по последней смене");
  await page.getByRole("button", { name: "Отправить обращение" }).click();

  const myCases = page.getByRole("region", { name: "Мои обращения" });
  const firstCase = myCases.locator("article").first();
  await expect(firstCase).toContainText(
    "Не вижу подтверждение оплаты по последней смене",
  );
  const number = (await firstCase.locator("b").first().textContent())?.trim();
  expect(number).toMatch(/^SS-[A-Z0-9]{8}$/);

  await page.reload();
  await waitForStableLayout(page, ".page");
  await expect(
    page.getByRole("region", { name: "Мои обращения" }).getByText(number!),
  ).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await context.close();
});
