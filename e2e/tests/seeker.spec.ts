import { expect, test } from "@playwright/test";
import { API_URL } from "../harness/env";
import {
  SHIFT,
  auth,
  fillProfile,
  login,
  openApp,
  publishShift,
} from "../harness/app";

/**
 * ПУТЬ СОИСКАТЕЛЯ В НАСТОЯЩЕМ БРАУЗЕРЕ.
 *
 * Сквозные тесты на сервере уже проверяют, что данные ходят правильно. Здесь
 * проверяется то, чего с сервера не видно: доходят ли эти данные до экрана,
 * и можно ли пальцем пройти путь до конца. Ровно на этом стыке ломалось
 * больше всего: кнопка «Детали смены» была накрыта невидимым штампом и не
 * нажималась, низ карточки уезжал под кнопки, «Мои смены» показывали
 * безымянное «Заведение».
 *
 * Сервер — настоящий, приложение — собранное (то же, что уедет на сервер).
 */
test.describe("человек находит смену и доходит до чата", () => {
  test("лента → детали → отклик → взаимно → чат → мои смены", async ({
    browser,
    request,
  }) => {
    // Сцена: заведение с опубликованной сменой и человек с анкетой.
    const emp = await login(request, "employer", 810_001, "Дрова");
    await fillProfile(request, emp, {
      company_name: "Кофейня «Дрова»",
      city: "Москва",
      address: "ул. Льва Толстого, 16",
      contact_phone: "+79990000001",
    });
    const vac = await publishShift(request, emp);

    const seeker = await login(request, "seeker", 810_002, "Мария");
    await fillProfile(request, seeker, {
      name: "Мария",
      city: "Москва",
      district: "Басманный",
      roles: ["barista"],
      birth_date: "1998-04-12",
      med_book: "yes",
      about: "Опыт в кофейне.",
    });

    const { context, page } = await openApp(browser, seeker);
    await page.goto("/#/feed");

    // 1. Карточка видна, и на ней есть то, ради чего её открывают.
    const card = page.locator(".swipe-card").first();
    await expect(card).toBeVisible();
    await expect(card).toContainText("Кофейня «Дрова»");
    await expect(card).toContainText(`${SHIFT.pay.toLocaleString("ru-RU")}`);
    // Адреса на ЛИЦЕВОЙ стороне больше нет — он на изнанке, вместе с описанием
    // и чаевыми. Раньше карточка дословно повторяла подробности, и на экране,
    // где решение принимают за три секунды, стояло семь строк текста.
    // Проверяем именно отсутствие: иначе адрес вернётся назад незамеченным.
    const front = card.locator(".flip-front");
    await expect(front).not.toContainText("ул. Льва Толстого, 16");

    // 2. Подробности — на изнанке карточки, касанием. Не шторка поверх экрана:
    //    шторка уводила карточку под себя, и связь «это та же смена» держалась
    //    только на памяти. Переворот её показывает.
    await card.click({ position: { x: 40, y: 60 } });
    await expect(card).toHaveClass(/is-flipped/);
    const back = card.locator(".flip-back");
    await expect(back).toBeVisible();
    await expect(back).toContainText("Сколько заплатят");
    await expect(back).toContainText("Что взять с собой");
    // Адрес не пропал из продукта — он на касание. Эта проверка и проверка
    // выше держат правило с двух сторон: на лицевой стороне нет, внутри есть.
    await expect(back).toContainText("ул. Льва Толстого, 16");

    // 3. Решение принимают, не возвращая карточку: кнопки под колодой лежат
    //    поверх неё и работают с любой стороны. Раньше ради отклика надо было
    //    закрыть шторку и заново тянуться к сердцу — ровно в этот момент
    //    решение и остывает.
    await page.getByRole("button", { name: "Отклик" }).click();

    // Отклик дошёл до сервера — мэтча пока нет, заведение не отвечало.
    await expect
      .poll(async () => {
        const r = await request.get(`${API_URL}/employer/applicants`, {
          headers: auth(emp),
        });
        return (await r.json()).length;
      })
      .toBe(1);

    // 4. Заведение отвечает согласием — человек видит «Взаимно!».
    await request.post(`${API_URL}/swipes`, {
      headers: auth(emp),
      data: {
        target_id: seeker.id,
        target_type: "user",
        direction: "like",
        vacancy_id: vac.id,
      },
    });

    // Приложение узнаёт о мэтче, когда человек возвращается к ленте.
    await page.goto("/#/matches");
    const shift = page.locator(".card").first();
    await expect(shift).toBeVisible();
    // 5. В «Моих сменах» видно ЗАВЕДЕНИЕ и ДОЛЖНОСТЬ — раньше сервер их
    //    не отдавал вовсе, и строка была безымянной.
    await expect(shift).toContainText("Кофейня «Дрова»");
    await expect(shift).toContainText("Бариста");
    await expect(shift).toContainText(`${SHIFT.pay.toLocaleString("ru-RU")}`);

    // 6. Из смены открывается чат, и в нём можно написать.
    await shift.getByRole("button", { name: /Открыть чат/ }).click();
    await expect(page).toHaveURL(/#\/chat\//);
    const input = page.getByPlaceholder(/Сообщение|Написать/i).first();
    await input.fill("Здравствуйте! Приду к 10:00");
    await page.getByRole("button", { name: /Отправить/i }).click();
    await expect(page.locator("body")).toContainText("Приду к 10:00");

    // 7. Вторая сторона видит это же сообщение — переписка одна на двоих.
    await expect
      .poll(async () => {
        const r = await request.get(
          `${API_URL}/matches/${(await matchId(request, emp))}/messages`,
          { headers: auth(emp) },
        );
        return (await r.json()).map((m: { text: string }) => m.text);
      })
      .toContain("Здравствуйте! Приду к 10:00");

    await context.close();
  });
});

/** Идентификатор единственной смены этой стороны. */
async function matchId(
  request: import("@playwright/test").APIRequestContext,
  s: import("../harness/app").Session,
): Promise<string> {
  const r = await request.get(`${API_URL}/matches`, { headers: auth(s) });
  const rows = await r.json();
  return rows[0].id;
}

test("сообщение собеседника приходит само, без обновления экрана", async ({
  browser,
  request,
}) => {
  /**
   * Живой чат держится на сокете. Проверка нужна именно сквозная: сокет
   * рвётся от любой мелочи — метро, лифт, переход с вайфая на мобильный, — и
   * когда-то после обрыва чат замолкал навсегда. Человек писал в пустоту и
   * видел ответы, только если закрывал и открывал экран заново.
   *
   * Поэтому здесь никто ничего не обновляет руками: экран открыт, вторая
   * сторона пишет с сервера, сообщение обязано появиться само.
   */
  const emp = await login(request, "employer", 831_101, "Дрова");
  await fillProfile(request, emp, {
    company_name: "Кофейня «Дрова»",
    city: "Москва",
    address: "ул. Льва Толстого, 16",
    contact_phone: "+79990000031",
  });
  const vac = await publishShift(request, emp);

  const seeker = await login(request, "seeker", 831_102, "Мария");
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
  expect(matchId, "мэтч должен создаться").toBeTruthy();

  const { context, page } = await openApp(browser, seeker);
  await page.goto(`/#/chat/${matchId}`);
  await expect(page.locator(".page.chat")).toBeVisible();

  // Заведение пишет с сервера — экран у работника никто не трогает.
  await request.post(`${API_URL}/matches/${matchId}/messages`, {
    headers: auth(emp),
    data: { text: "Приходите к десяти, спросите Олю" },
  });

  await expect(page.getByText("Приходите к десяти, спросите Олю")).toBeVisible({
    timeout: 5000,
  });

  await context.close();
});

test("«Здравствуйте!» не предлагают, когда человек уже написал сам", async ({
  browser,
  request,
}) => {
  /**
   * Подсказки в чате нужны против чистого листа: человек открыл переписку с
   * незнакомым заведением и не знает, с чего начать. Как только он написал
   * сам, кнопка «Здравствуйте!» под его же репликой выглядит так, будто
   * приложение не заметило разговора.
   *
   * Остальные подсказки — настоящие вопросы («Какой адрес?», «Что взять с
   * собой?»), они полезны и на третий день.
   */
  const emp = await login(request, "employer", 831_201, "Дрова");
  await fillProfile(request, emp, {
    company_name: "Кофейня «Дрова»",
    city: "Москва",
    address: "ул. Льва Толстого, 16",
    contact_phone: "+79990000071",
  });
  const vac = await publishShift(request, emp);
  const seeker = await login(request, "seeker", 831_202, "Мария");
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

  const { context, page } = await openApp(browser, seeker);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/chat/${matchId}`);
  await expect(page.locator(".page.chat")).toBeVisible();

  const hello = page.getByRole("button", { name: "Здравствуйте!", exact: true });
  await expect(hello, "пока человек молчит — подсказка нужна").toBeVisible();

  await page.getByPlaceholder(/Сообщение/i).fill("Добрый день, буду вовремя");
  await page.getByRole("button", { name: /Отправить/i }).click();
  await expect(page.getByText("Добрый день, буду вовремя")).toBeVisible();

  await expect(hello, "человек написал сам — здороваться уже поздно").toBeHidden();
  // А настоящие вопросы остаются: они полезны и потом.
  await expect(page.getByRole("button", { name: "Какой адрес?" })).toBeVisible();

  await context.close();
});
