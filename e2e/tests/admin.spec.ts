import { expect, test } from "@playwright/test";
import { API_URL } from "../harness/env";
import { report, sweep } from "../harness/paint";
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

test("оператор читает переписку по спорной смене", async ({ browser, request }) => {
  /**
   * Жалобы бывают ровно про написанное: «мошенничество», «абьюз», «спам».
   * Раньше оператор открывал такую жалобу и видел всё, кроме самой
   * переписки, — и решал по одному тексту заявителя.
   */
  const emp = await login(request, "employer", 845_021, "Дрова");
  await fillProfile(request, emp, {
    company_name: "Кофейня «Дрова»",
    city: "Москва",
    address: "ул. Льва Толстого, 16",
    contact_phone: "+79990000022",
  });
  const vac = await publishShift(request, emp);

  const seeker = await login(request, "seeker", 845_022, "Мария");
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
  const like = await request.post(`${API_URL}/swipes`, {
    headers: auth(emp),
    data: {
      target_id: seeker.id,
      target_type: "user",
      direction: "like",
      vacancy_id: vac.id,
    },
  });
  const matchId = (await like.json()).match_id as string;

  // Настоящая переписка, а потом спор.
  await request.post(`${API_URL}/matches/${matchId}/messages`, {
    headers: auth(emp),
    data: { text: "Приходите к десяти, спросите Олю" },
  });
  await request.post(`${API_URL}/matches/${matchId}/messages`, {
    headers: auth(seeker),
    data: { text: "Я на месте, но здесь закрыто" },
  });
  await request.post(`${API_URL}/matches/${matchId}/dispute`, {
    headers: auth(seeker),
    data: { note: "заведение не открылось" },
  });

  const admin = await login(request, "seeker", 0, "Оператор");
  // Тёмная тема: у неё свои цвета, и разбор спора оператор часто открывает
  // вечером.
  const { context, page } = await openApp(browser, admin, { ss_theme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/admin");
  await waitForStableLayout(page, ".page");

  // Переписка не открывается сама — оператор нажимает.
  await expect(page.getByText("Я на месте, но здесь закрыто")).toHaveCount(0);
  await page.getByRole("button", { name: "Показать переписку" }).first().click();

  await expect(page.getByText("Приходите к десяти, спросите Олю")).toBeVisible();
  await expect(page.getByText("Я на месте, но здесь закрыто")).toBeVisible();
  // Видно, кто говорит и когда: без этого переписка не доказательство.
  await expect(page.getByText(/Мария · работник · \d{2}\.\d{2} \d{2}:\d{2}/)).toBeVisible();

  // Это рабочий экран оператора: он читает его каждый день и по нему решает
  // споры о деньгах. Читаемость проверяем так же, как у экранов людей.
  const m = await sweep(page);
  expect(m.contrast, `разбор спора:\n${report(m.contrast)}`).toEqual([]);
  expect(m.overflowX, "панель не должна ездить вбок").toBe(0);
  expect(m.tiny, `мелкие зоны нажатия ${m.tinyWhere}`).toBe(0);

  await context.close();
});

test("остановленный планировщик виден оператору сразу", async ({
  browser,
  request,
}) => {
  /**
   * Самая тихая поломка сервиса. Планировщик — отдельный процесс, и если он
   * перестал запускаться, на вид не сломалось ничего: приложение работает,
   * смены публикуются, люди переписываются. Не закрываются только смены — а
   * значит не идёт комиссия. Через две недели такие смены закроются уже без
   * денег, и выручку за простой не догнать.
   *
   * В прогоне планировщик не запускался ни разу — ровно тот случай.
   */
  const admin = await login(request, "seeker", 0, "Оператор");
  const { context, page } = await openApp(browser, admin);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/admin");
  await waitForStableLayout(page, ".page");

  const alarm = page.getByRole("alert").filter({ hasText: "Планировщик не работает" });
  await expect(alarm).toBeVisible();
  await expect(alarm).toContainText("комиссия не начисляется");
  await expect(alarm).toContainText("Закрытие смен");

  await context.close();
});
