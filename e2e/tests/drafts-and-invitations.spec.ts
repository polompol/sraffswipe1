import { expect, test } from "@playwright/test";
import { API_URL } from "../harness/env";
import { auth, fillProfile, inDays, login, openApp, publishShift } from "../harness/app";

test.use({ viewport: { width: 390, height: 844 } });

test("черновик → другой сеанс → условия → потерянный ответ публикации → одна смена", async ({ browser, request }, testInfo) => {
  const emp = await login(request, "employer", 950001, "Кофейня Место");
  await fillProfile(request, emp, { company_name: "Кофейня «Место»", city: "Москва" });
  const first = await openApp(browser, emp);
  await first.page.goto("/#/vacancy/new");
  await first.page.getByLabel("Должность", { exact: true }).selectOption("barista");
  await first.page.locator("#city-picker").fill("Москва");
  // Сохраняется неполная форма: без даты, без публикации в ленту.
  await first.page.getByRole("button", { name: "Сохранить и выйти", exact: true }).click();
  await expect(first.page).toHaveURL(/vacancy\/my\?tab=drafts/);
  await expect(first.page.getByRole("article")).toContainText("Дата не выбрана");
  expect(await (await request.get(`${API_URL}/vacancies?mine=1`, { headers: auth(emp) })).json()).toHaveLength(0);
  await first.context.close();

  const second = await openApp(browser, emp);
  const page = second.page;
  await page.goto("/#/vacancy/my?tab=drafts");
  await page.getByRole("button", { name: "Продолжить заполнение", exact: true }).click();
  await expect(page.getByLabel("Должность", { exact: true })).toHaveValue("barista");
  await expect(page.locator("#city-picker")).toHaveValue("Москва");
  await page.getByLabel("Дата смены", { exact: true }).fill(inDays(2));
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.getByLabel("Ставка", { exact: true }).fill("420");
  await page.getByLabel("Описание", { exact: true }).fill("Утренняя смена. Напитки, касса и порядок на баре. Обед включён.");
  await page.getByRole("button", { name: "Сохранить и выйти", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("420 ₽/час");
  await expect(page.getByText("Черновик сохранён. Работники его пока не видят", { exact: true })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("drafts.jpg"), type: "jpeg", quality: 90, scale: "css" });
  await page.getByRole("button", { name: "Продолжить заполнение", exact: true }).click();
  await expect(page.getByLabel("Ставка", { exact: true })).toHaveValue("420");
  await expect(page.getByLabel("Описание", { exact: true })).toContainText("Обед включён");
  await page.getByRole("button", { name: "Предпросмотр смены", exact: true }).click();
  // Запрос выполнен сервером, а телефон потерял ответ. Повтор должен вернуть
  // ту же публикацию; подтверждение успеха нельзя изображать локально.
  await page.route("**/vacancy-drafts/*/publish", async route => {
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort("failed");
  }, { times: 1 });
  await page.getByRole("button", { name: "Разместить смену", exact: true }).click();
  await expect(page.getByRole("button", { name: "Проверить публикацию", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Проверить публикацию", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Смена размещена" })).toBeVisible();
  expect(await (await request.get(`${API_URL}/vacancies?mine=1`, { headers: auth(emp) })).json()).toHaveLength(1);
  expect(await (await request.get(`${API_URL}/vacancy-drafts`, { headers: auth(emp) })).json()).toHaveLength(0);
  await second.context.close();
});

test("ошибка сохранения оставляет поля; несохранённый выход и удаление требуют решения", async ({ browser, request }) => {
  const emp = await login(request, "employer", 950002, "Тест черновика");
  const { page, context } = await openApp(browser, emp);
  await page.goto("/#/vacancy/new");
  await page.getByLabel("Должность", { exact: true }).selectOption("cook");
  await page.locator("#city-picker").fill("Казань");
  await page.route("**/vacancy-drafts/*", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Временно нет связи" }) }), { times: 1 });
  await page.getByRole("button", { name: "Сохранить и выйти", exact: true }).click();
  await expect(page.getByText("Временно нет связи", { exact: true })).toBeVisible();
  await expect(page.locator("#city-picker")).toHaveValue("Казань");
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Есть несохранённые изменения", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Продолжить заполнение", exact: true }).click();
  await expect(page.getByLabel("Должность", { exact: true })).toHaveValue("cook");
  await page.getByRole("button", { name: "Сохранить и выйти", exact: true }).click();
  await page.getByRole("button", { name: "Удалить черновик", exact: true }).click();
  await sheet.getByRole("button", { name: "Оставить черновик", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("Повар");
  await page.getByRole("button", { name: "Удалить черновик", exact: true }).click();
  await sheet.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Черновиков пока нет" })).toBeVisible();
  await context.close();
});

test("второе устройство не перезаписывает свежий черновик", async ({ browser, request }) => {
  const emp = await login(request, "employer", 950003, "Два устройства");
  const ident = crypto.randomUUID();
  const initial = await (await request.put(`${API_URL}/vacancy-drafts/${ident}`, { headers: auth(emp), data: { data: { role: "barista", city: "Москва" } } })).json();
  const { page, context } = await openApp(browser, emp);
  await page.goto(`/#/vacancy/new?draft=${ident}`);
  await expect(page.locator("#city-picker")).toHaveValue("Москва");
  const newer = await request.put(`${API_URL}/vacancy-drafts/${ident}`, { headers: auth(emp), data: { version: initial.version, data: { ...initial.data, city: "Казань" } } });
  expect(newer.ok()).toBeTruthy();
  await page.locator("#city-picker").fill("Омск");
  await page.getByRole("button", { name: "Сохранить и выйти", exact: true }).click();
  await expect(page.getByText(/Черновик изменён на другом устройстве/)).toBeVisible();
  await expect(page.locator("#city-picker")).toHaveValue("Омск");
  expect((await (await request.get(`${API_URL}/vacancy-drafts/${ident}`, { headers: auth(emp) })).json()).data.city).toBe("Казань");
  await context.close();
});

test("приглашение → ответ сотрудника → журнал → чат и договорённости", async ({ browser, request }, testInfo) => {
  const emp = await login(request, "employer", 950004, "Кофейня Место");
  const seeker = await login(request, "seeker", 950005, "Анна");
  await fillProfile(request, emp, { company_name: "Кофейня «Место»", city: "Москва" });
  await fillProfile(request, seeker, { name: "Анна", city: "Москва", roles: ["barista"], birth_date: "1999-05-20" });
  const vacancy = await publishShift(request, emp, { role: "barista", days: 2, city: "Москва" });
  const invite = await request.post(`${API_URL}/swipes`, { headers: auth(emp), data: { target_id: seeker.id, target_type: "user", direction: "like" } });
  expect(invite.ok()).toBeTruthy();
  const { page, context } = await openApp(browser, emp);
  await page.goto("/#/vacancy/my");
  await page.getByRole("button", { name: "Приглашения", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("Анна");
  await expect(page.getByRole("article")).toContainText("Ждём отклика");
  await page.getByRole("button", { name: "Без ответа", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  const response = await (await request.post(`${API_URL}/swipes`, { headers: auth(seeker), data: { target_id: vacancy.id, target_type: "vacancy", direction: "like" } })).json();
  expect(response.matched).toBe(true);
  await page.getByRole("button", { name: "Ответили", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("Взаимный интерес");
  await page.screenshot({ path: testInfo.outputPath("invitations.jpg"), type: "jpeg", quality: 90, scale: "css" });
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const tabs = page.locator(".segment-tabs button");
  for (const tab of await tabs.all()) expect(await tab.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Открыть чат", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/chat/${response.match_id}`));
  await expect(page.locator("body")).toContainText("Анна");
  await page.goto("/#/invitations");
  await page.getByRole("button", { name: /Все договорённости/ }).click();
  await expect(page).toHaveURL(new RegExp(`worker=${seeker.id}`));
  await expect(page.getByRole("button", { name: "Открыть чат: Анна", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Показать всех сотрудников", exact: true }).click();
  await expect(page).not.toHaveURL(/worker=/);
  await context.close();
});
