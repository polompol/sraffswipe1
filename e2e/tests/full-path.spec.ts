import { expect, test } from "@playwright/test";
import { API_URL } from "../harness/env";
import {
  SHIFT,
  ageShift,
  auth,
  docToken,
  fillProfile,
  login,
  openApp,
  publishShift,
  waitForStableLayout,
} from "../harness/app";

/**
 * ВЕСЬ ПУТЬ ЦЕЛИКОМ — ОТ РЕГИСТРАЦИИ ДО ДЕНЕГ И АКТА.
 *
 * Сквозные проверки на сервере разбирают каждый шаг по отдельности и делают
 * это дотошнее. Но между «каждый шаг работает» и «человек дошёл до конца»
 * есть разница: экран может не показать нужную кнопку, состояние может не
 * обновиться, а данные — не доехать до карточки. Этот тест идёт пальцем по
 * приложению один раз, но насквозь.
 *
 * Смену приходится перематывать в прошлое: закрыть её можно только после
 * окончания, а живому браузеру время не перемотать (см. ageShift).
 */
test.describe("весь путь целиком", () => {
  test("работник: регистрация → смена → чат → код прихода → закрытие → акт", async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);

    // ── Сцена: заведение со сменой ──────────────────────────────────────
    const emp = await login(request, "employer", 900_001, "Дрова");
    await fillProfile(request, emp, {
      company_name: "Кофейня «Дрова»",
      city: "Москва",
      address: "ул. Льва Толстого, 16",
      contact_phone: "+79990000101",
    });
    const vac = await publishShift(request, emp);

    // ── 1. Регистрация работника и анкета ───────────────────────────────
    const seeker = await login(request, "seeker", 900_002, "Мария");
    await fillProfile(request, seeker, {
      name: "Мария",
      city: "Москва",
      district: "Басманный",
      roles: ["barista"],
      birth_date: "1998-04-12",
      med_book: "yes",
      about: "Опыт в кофейне два года.",
    });

    const { context, page } = await openApp(browser, seeker);

    // ── 2. Поиск: смена видна в ленте со всем, что нужно для решения ────
    await page.goto("/#/feed");
    const card = page.locator(".swipe-card").first();
    await expect(card).toBeVisible();
    await waitForStableLayout(page, ".deck");
    // Смотрим ИМЕННО лицевую сторону: у карточки теперь есть изнанка, и она
    // лежит в той же разметке — проверка по всей карточке нашла бы адрес там
    // и прошла бы, ничего не проверив.
    const front = card.locator(".flip-front");
    await expect(front).toContainText("Кофейня «Дрова»");
    await expect(front, "видно, сколько заплатят").toContainText(
      `${SHIFT.pay.toLocaleString("ru-RU")}`,
    );
    // Адрес переехал на изнанку — на лицевой стороне его быть не должно.
    // Что он там есть, проверяет seeker.spec.ts на том же сценарии.
    await expect(front, "адрес — на касание, а не на лицевой стороне")
      .not.toContainText("ул. Льва Толстого, 16");

    // ── 3. Фильтр: «Сегодня» сужает ленту и снимается обратно ───────────
    const cityChip = page.locator(".chip").first();
    const before = (await cityChip.innerText()).trim();
    await page.getByRole("button", { name: "Сегодня", exact: true }).click();
    await expect(
      page.locator(".chip", { hasText: "Сегодня" }),
      "включённое условие видно",
    ).toHaveClass(/chip-on/);
    await expect
      .poll(async () => (await cityChip.innerText()).trim(),
            { message: "счётчик найденного изменился" })
      .not.toBe(before);
    // «Сегодня» — переключатель, а не выбор из списка: снимается тем же
    // нажатием. Крестик есть только у условий, которые выбирают в шторке.
    await page.getByRole("button", { name: "Сегодня", exact: true }).click();
    await expect
      .poll(async () => (await cityChip.innerText()).trim(),
            { message: "условие снято — лента вернулась" })
      .toBe(before);
    await expect(page.locator(".swipe-card").first()).toBeVisible();

    // ── 4. Отклик свайпом ───────────────────────────────────────────────
    await page.getByRole("button", { name: "Отклик" }).click();
    await expect
      .poll(async () => {
        const r = await request.get(`${API_URL}/matches`, { headers: auth(seeker) });
        return (await r.json()).length;
      }, { message: "отклик ушёл, но взаимности пока нет" })
      .toBe(0);

    // ── 5. Заведение зовёт в ответ → совпадение ─────────────────────────
    const out = await (
      await request.post(`${API_URL}/swipes`, {
        headers: auth(emp),
        data: {
          target_id: seeker.id,
          target_type: "user",
          direction: "like",
          vacancy_id: vac.id,
        },
      })
    ).json();
    expect(out.matched, "взаимный интерес").toBe(true);
    const matchId: string = out.match_id;

    // ── 6. Смена появилась в «Моих сменах» с названием и деньгами ───────
    await page.goto("/#/matches");
    const row = page.locator(".card").first();
    await expect(row).toContainText("Кофейня «Дрова»");
    await expect(row).toContainText("Бариста");
    await expect(row, "видно, сколько заплатят").toContainText("3 200");

    // ── 7. Чат: пишем и видим ответ ─────────────────────────────────────
    await page.goto(`/#/chat/${matchId}`);
    const input = page.getByLabel("Текст сообщения");
    await expect(input).toBeVisible();
    await input.fill("Здравствуйте! Во сколько подойти?");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.locator(".bubble.mine").last()).toContainText("Во сколько подойти");

    await request.post(`${API_URL}/matches/${matchId}/messages`, {
      headers: auth(emp),
      data: { text: "К десяти. Спросите администратора на входе." },
    });
    await expect(page.locator(".bubble.theirs").last()).toContainText("К десяти", {
      timeout: 15_000,
    });

    // ── 8. Подтверждение смены обеими сторонами ─────────────────────────
    await page.getByRole("button", { name: /Подтвердить смену/ }).click();
    await expect(
      page.getByRole("button", { name: /Ждём ответа заведения/ }),
      "своё подтверждение отправлено, ждём вторую сторону",
    ).toBeVisible();

    await request.post(`${API_URL}/matches/${matchId}/confirm`, { headers: auth(emp) });

    // ── 9. Смена прошла. Работник называет код прихода ──────────────────
    ageShift(matchId);
    const code: string = (
      await (await request.get(`${API_URL}/matches`, { headers: auth(emp) })).json()
    )[0].checkin_code;
    expect(code, "код прихода видит только заведение").toMatch(/^\d{6}$/);

    await page.goto("/#/matches");
    const codeField = page.getByLabel("Код прихода");
    await expect(codeField, "поле кода — в день смены").toBeVisible();
    await codeField.fill("000000");
    await page.getByRole("button", { name: "Отметиться" }).click();
    await expect(
      page.getByText(/Код не подошёл/),
      "чужой код не проходит, и человеку сказано что делать",
    ).toBeVisible();

    await codeField.fill(code);
    await page.getByRole("button", { name: "Отметиться" }).click();
    await expect(page.getByText(/Код принят/)).toBeVisible({ timeout: 15_000 });

    // ── 10. Заведение подтверждает выход — смена закрывается ────────────
    await request.post(`${API_URL}/matches/${matchId}/attendance`, {
      headers: auth(emp),
      data: { attended: true },
    });

    // ── 11. Комиссия: ровно одна и ровно 10% ────────────────────────────
    const bill = await (
      await request.get(`${API_URL}/billing/commission`, { headers: auth(emp) })
    ).json();
    expect(bill.pendingShifts, "одна закрытая смена").toBe(1);
    expect(bill.pendingRub, "десять процентов от смены").toBe(SHIFT.fee);

    // ── 12. Акт: работник может скачать документ по закрытой смене ──────
    await page.reload();
    await expect(
      page.getByRole("button", { name: /Скачать акт/ }),
      "по закрытой смене есть документ",
    ).toBeVisible({ timeout: 15_000 });

    const act = await request.get(
      `${API_URL}/matches/${matchId}/act.pdf?token=${await docToken(request, seeker)}`,
    );
    expect(act.status(), "акт отдаётся").toBe(200);
    expect(act.headers()["content-type"]).toContain("pdf");
    expect((await act.body()).slice(0, 4).toString()).toBe("%PDF");

    await context.close();
  });

  test("заведение: смена → кандидаты → позвать → чат → выход → комиссия → счёт", async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);

    // ── Сцена: свободный работник ───────────────────────────────────────
    //
    // Город у этого теста СВОЙ, и это не прихоть. Лента кандидатов показывает
    // всех свободных людей города, а тесты идут парами параллельно и заводят
    // своих работников. В общей Москве наверху колоды иногда оказывался чужой
    // человек — и проверка «в карточке Пётр» падала через раз, а «Позвать»
    // звало не того. Свой город даёт ленту, в которой лежит ровно один
    // кандидат — тот, которого завёл этот тест.
    //
    // Города не закрытый список (см. backend/app/cities.py): незнакомый
    // работает по поясу по умолчанию, и для теста этого достаточно.
    const seeker = await login(request, "seeker", 900_011, "Пётр");
    await fillProfile(request, seeker, {
      name: "Пётр",
      city: "Кострома",
      district: "Хамовники",
      roles: ["waiter"],
      birth_date: "1995-06-06",
      med_book: "yes",
      about: "Официант, работал в баре.",
    });
    await request.post(`${API_URL}/me/available`, {
      headers: auth(seeker),
      data: { available: true },
    });

    // ── 1. Регистрация заведения и его профиль ──────────────────────────
    const emp = await login(request, "employer", 900_012, "Полночь");
    await fillProfile(request, emp, {
      company_name: "Бар «Полночь»",
      city: "Кострома",
      address: "Покровка, 12",
      contact_phone: "+79990000102",
    });

    const { context, page } = await openApp(browser, emp);

    // ── 2. Создание смены прямо в форме ─────────────────────────────────
    await page.goto("/#/vacancy/new");
    await expect(page.getByRole("heading", { name: "Новая смена" })).toBeVisible();
    await page.getByRole("button", { name: "Официант", exact: true }).click();
    const inDays = (n: number) =>
      new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    await page.locator('input[type="date"]').fill(inDays(2));
    await page.locator("#city-picker").fill("Кострома");
    await page.locator('input[inputmode="numeric"]').first().fill("400");
    await expect(
      page.locator(".hint", { hasText: /августа|января|февраля|марта|апреля|мая|июня|июля|сентября|октября|ноября|декабря/ }),
      "выбранный день повторён словами — формат поля задаёт телефон",
    ).toBeVisible();
    await page.getByRole("button", { name: /Разместить смену/ }).click();
    await expect(page.getByRole("heading", { name: "Смена размещена" })).toBeVisible();

    // ── 3. Кандидаты: работник виден в ленте со всем, что нужно ─────────
    await page.getByRole("button", { name: "Посмотреть, кто свободен" }).click();
    const card = page.locator(".swipe-card").first();
    await expect(card).toBeVisible();
    await waitForStableLayout(page, ".deck");
    await expect(card).toContainText("Пётр");
    await expect(card, "готовность выйти сегодня видна").toContainText("Может сегодня");
    await expect(card).toContainText("Медкнижка");

    // ── 4. «Позвать» — главное действие заведения ───────────────────────
    await page.getByRole("button", { name: "Позвать" }).click();
    // Приглашение ушло, но смены ещё нет: человек не отвечал. Это и есть
    // разница между «позвал» и «договорились».
    await expect
      .poll(async () => {
        const r = await request.get(`${API_URL}/matches`, { headers: auth(emp) });
        return (await r.json()).length;
      }, { message: "пока только приглашение" })
      .toBe(0);

    // ── 5. Работник видит приглашение и отвечает согласием ──────────────
    const invites = await (
      await request.get(`${API_URL}/vacancies/invites`, { headers: auth(seeker) })
    ).json();
    expect(invites.length, "смена лежит в «Кто меня зовёт»").toBe(1);
    expect(invites[0].company_name).toBe("Бар «Полночь»");

    const back = await (
      await request.post(`${API_URL}/swipes`, {
        headers: auth(seeker),
        data: { target_id: invites[0].id, target_type: "vacancy", direction: "like" },
      })
    ).json();
    expect(back.matched, "ответное согласие даёт смену сразу").toBe(true);
    const matchId: string = back.match_id;

    // ── 6. Чат: заведение пишет первым ──────────────────────────────────
    await page.goto(`/#/chat/${matchId}`);
    const input = page.getByLabel("Текст сообщения");
    await input.fill("Ждём вас к десяти, форма — чёрный верх.");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.locator(".bubble.mine").last()).toContainText("к десяти");

    // ── 7. Обе стороны подтверждают смену ───────────────────────────────
    await page.getByRole("button", { name: /Подтвердить смену/ }).click();
    await expect(page.getByRole("button", { name: /Ждём ответа работника/ })).toBeVisible();
    await request.post(`${API_URL}/matches/${matchId}/confirm`, { headers: auth(seeker) });

    // ── 8. Смена прошла: работник назвал код, заведение отмечает выход ──
    ageShift(matchId);
    const code: string = (
      await (await request.get(`${API_URL}/matches`, { headers: auth(emp) })).json()
    )[0].checkin_code;
    await request.post(`${API_URL}/matches/${matchId}/checkin`, {
      headers: auth(seeker),
      data: { code },
    });

    await page.goto("/#/matches");
    await page.getByRole("button", { name: /Подтвердить выход/ }).click();
    await expect(
      page.getByText(/Отметили: человек вышел/),
      "заведение видит, что отметка принята",
    ).toBeVisible({ timeout: 15_000 });

    // ── 9. Комиссия начислена ровно одна и ровно 10% ────────────────────
    // Смену завели через форму, и часы у неё свои — считаем от того, что
    // реально записано в смене, а не от константы сцены.
    const closed = await (
      await request.get(`${API_URL}/matches`, { headers: auth(emp) })
    ).json();
    const fee = Math.round(closed[0].shift_pay / 10);

    const bill = await (
      await request.get(`${API_URL}/billing/commission`, { headers: auth(emp) })
    ).json();
    expect(bill.pendingShifts).toBe(1);
    expect(bill.pendingRub, "десять процентов от смены").toBe(fee);

    // ── 10. В профиле заведение видит ту же сумму к оплате ──────────────
    await page.goto("/#/profile");
    await expect(page.getByText(/Комиссия сервиса/)).toBeVisible();
    await expect(
      page.locator(".card", { hasText: "Комиссия сервиса" }),
      "сумма на экране совпадает с той, что в счёте",
    ).toContainText(String(fee));

    // ── 11. Документы для бухгалтерии ──────────────────────────────────
    //
    // Счёт и акт за месяц выставляются от лица сервиса, и для этого нужны его
    // собственные реквизиты — в прогоне их нет. Проверяем не «PDF отдался», а
    // то, что отказ не молчаливый: заведение должно понять причину, иначе
    // бухгалтер будет жать кнопку и звонить в поддержку.
    for (const kind of ["invoice", "act"]) {
      const doc = await request.get(
        `${API_URL}/billing/${kind}.pdf?token=${await docToken(request, emp)}`,
      );
      expect(doc.status(), `${kind}: без реквизитов сервис не выставляет документ`)
        .toBe(503);
      expect(
        (await doc.json()).detail,
        "и объясняет почему, а не отдаёт пустой файл",
      ).toContain("Реквизиты");
    }

    // А вот акт по самой смене реквизитов сервиса не требует — это документ
    // между заведением и работником, и он должен быть доступен сразу.
    const shiftAct = await request.get(
      `${API_URL}/matches/${matchId}/act.pdf?token=${await docToken(request, seeker)}`,
    );
    expect(shiftAct.status(), "акт по закрытой смене отдаётся").toBe(200);
    expect((await shiftAct.body()).slice(0, 4).toString()).toBe("%PDF");

    await context.close();
  });
});
