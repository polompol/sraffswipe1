import { expect, test } from "@playwright/test";
import { API_URL } from "../harness/env";
import { auth, fillProfile, inDays, login, openApp } from "../harness/app";

/**
 * ПУТЬ ЗАВЕДЕНИЯ В НАСТОЯЩЕМ БРАУЗЕРЕ.
 *
 * Смена публикуется через форму — руками, как это делает владелец кофейни, а
 * не запросом к серверу. Дальше — экран после публикации, лента кандидатов,
 * «Позвать», экран «Взаимно!» и переход в чат.
 *
 * Закрытие смены и деньги проверяются на сервере (backend/tests/
 * test_e2e_flows.py): там смену можно честно перемотать в прошлое, а в
 * браузере пришлось бы подгадывать под часы — тест начал бы падать по ночам
 * при исправном коде.
 */
test.describe("заведение публикует смену и зовёт человека", () => {
  test("форма → опубликовано → кандидаты → позвать → взаимно → чат", async ({
    browser,
    request,
  }) => {
    const emp = await login(request, "employer", 820_001, "Грядка");
    await fillProfile(request, emp, {
      company_name: "Ресторан «Грядка»",
      city: "Казань",
      address: "Покровка, 12",
      contact_phone: "+79990000002",
    });

    // Человек, который уже готов выйти сегодня, — его заведение и увидит.
    const seeker = await login(request, "seeker", 820_002, "Иван");
    await fillProfile(request, seeker, {
      name: "Иван",
      city: "Казань",
      district: "Басманный",
      roles: ["waiter"],
      birth_date: "1996-02-02",
      med_book: "yes",
    });
    await request.post(`${API_URL}/me/available`, {
      headers: auth(seeker),
      data: { available: true },
    });

    const { context, page } = await openApp(browser, emp);

    // 1. Публикация смены через форму.
    await page.goto("/#/vacancy/new");
    await expect(page.getByRole("heading", { name: "Новая смена" })).toBeVisible();
    await page.getByRole("button", { name: "Официант", exact: true }).click();
    await page.locator('input[type="date"]').fill(inDays(2));
    await page.locator("#city-picker").fill("Казань");
    await page.locator('input[inputmode="numeric"]').first().fill("400");
    await page.getByRole("button", { name: /Разместить смену/ }).click();

    // 2. Экран после публикации: раньше здесь была всплывашка и прыжок назад.
    await expect(
      page.getByRole("heading", { name: "Смена размещена" }),
    ).toBeVisible();
    await expect(page.locator(".page")).toContainText("Официант");

    // 3. Оттуда — сразу к кандидатам.
    await page.getByRole("button", { name: "Посмотреть, кто свободен" }).click();
    await expect(page).toHaveURL(/#\/feed/);

    const card = page.locator(".swipe-card").first();
    await expect(card).toBeVisible();
    await expect(card).toContainText("Иван");
    await expect(card).toContainText("Может сегодня");

    // 4. Человек тем временем откликнулся на эту смену — значит «Позвать»
    //    даст совпадение. (Он делает это со своего телефона, не с этого.)
    const vac = (await (
      await request.get(`${API_URL}/vacancies?mine=1`, { headers: auth(emp) })
    ).json())[0];
    await request.post(`${API_URL}/swipes`, {
      headers: auth(seeker),
      data: {
        target_id: vac.id,
        target_type: "vacancy",
        direction: "like",
      },
    });

    // 5. «Позвать» → экран «Взаимно!», и на нём написано, ЧТО совпало.
    await page.getByRole("button", { name: /Позвать/ }).click();
    const hooray = page.getByRole("dialog");
    await expect(hooray).toBeVisible();
    await expect(hooray).toContainText("Взаимно!");
    await expect(hooray).toContainText("Иван");
    await expect(hooray).toContainText("Официант");

    // 6. Из него — прямо в чат. Раньше заведение видело только всплывашку и
    //    шло искать человека руками во вкладке «Люди».
    await hooray.getByRole("button", { name: /Перейти в чат/ }).click();
    await expect(page).toHaveURL(/#\/chat\//);
    // В шапке чата — с кем разговор и когда смена. «Чат по смене» ничего не
    // говорило: таких чатов у заведения несколько, и различить их было нечем.
    await expect(page.locator("body")).toContainText("Иван");
    await expect(page.locator("body")).toContainText("10:00–22:00");

    await context.close();
  });
});
