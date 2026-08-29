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
 * АДМИН-ПАНЕЛЬ — рабочее место оператора.
 *
 * Ею пользуется живой человек: разбирает споры, зачисляет оплату, снимает
 * блокировки. Экран большой и состоит из четырёх вкладок, у каждой свои
 * запросы к серверу. Поэтому проверка простая, но важная: все четыре
 * открываются, каждая показывает свои разделы и ни одна не падает.
 *
 * Оператор здесь — вход с tg_id 0: именно он записан в ADMIN_TG_IDS у
 * тестового сервера (см. playwright.config.ts).
 */
test("оператор проходит все четыре вкладки", async ({ browser, request }) => {
  // Немного жизни в базе, чтобы вкладки были не пустыми.
  const emp = await login(request, "employer", 845_001, "Дрова");
  await fillProfile(request, emp, {
    company_name: "Кофейня «Дрова»",
    city: "Москва",
    address: "ул. Льва Толстого, 16",
    contact_phone: "+79990000021",
  });
  const vac = await publishShift(request, emp);
  const seeker = await login(request, "seeker", 845_002, "Мария");
  await fillProfile(request, seeker, {
    name: "Мария",
    city: "Москва",
    roles: ["barista"],
    birth_date: "1998-04-12",
    med_book: "yes",
  });
  await request.post(`${API_URL}/swipes`, {
    headers: auth(seeker),
    data: { target_id: vac.id, target_type: "vacancy", direction: "like" },
  });

  const admin = await login(request, "seeker", 0, "Оператор");
  // Один заблокированный, чтобы раздел «Заблокированные» был на экране: он
  // показывается только когда есть кого разблокировать.
  await request.post(`${API_URL}/admin/users/${seeker.id}/block`, {
    headers: auth(admin),
  });

  const { context, page } = await openApp(browser, admin);
  await page.setViewportSize({ width: 390, height: 844 });

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/#/admin");
  await waitForStableLayout(page, ".page");
  await expect(page.getByRole("heading", { name: "Админ-панель" })).toBeVisible();

  // «Сегодня»: сводка, ежедневные задачи, жалобы и споры.
  await expect(page.getByText("Смены в ленте")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Каждый день" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Жалобы и споры" })).toBeVisible();

  await page.getByRole("button", { name: "Деньги", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Доход" })).toBeVisible();

  await page.getByRole("button", { name: "Люди", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Найти человека или заведение" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Заблокированные" })).toBeVisible();

  await page.getByRole("button", { name: "Рост", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Источники регистраций" }),
  ).toBeVisible();

  // И обратно на первую — вкладки переключаются в обе стороны.
  await page.getByRole("button", { name: "Сегодня", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Каждый день" })).toBeVisible();

  expect(errors, `ошибки на странице: ${errors.join("; ")}`).toEqual([]);
  await context.close();
});

test("поиск человека в панели находит по имени", async ({ browser, request }) => {
  const seeker = await login(request, "seeker", 845_011, "Валентина");
  await fillProfile(request, seeker, {
    name: "Валентина",
    city: "Москва",
    roles: ["waiter"],
    birth_date: "1997-03-03",
    med_book: "yes",
  });

  const admin = await login(request, "seeker", 0, "Оператор");
  const { context, page } = await openApp(browser, admin);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/admin");
  await waitForStableLayout(page, ".page");
  await page.getByRole("button", { name: "Люди", exact: true }).click();

  // Поиск идёт по нижнему регистру — на SQLite это отдельная история
  // (см. app/db.py), поэтому ищем строчными буквами намеренно.
  await page.getByPlaceholder(/Поиск/i).fill("валентина");
  await expect(page.getByText("Валентина").first()).toBeVisible();

  await context.close();
});
