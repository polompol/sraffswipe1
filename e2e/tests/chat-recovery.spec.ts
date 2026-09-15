import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { API_URL } from "../harness/env";
import {
  auth,
  fillProfile,
  login,
  openApp,
  publishShift,
  type Session,
} from "../harness/app";

async function matchedChat(
  request: APIRequestContext,
  browser: Browser,
  seed: number,
) {
  const emp = await login(request, "employer", seed, `Заведение ${seed}`);
  await fillProfile(request, emp, {
    company_name: `Кофейня ${seed}`,
    city: "Москва",
    address: "Тестовая, 1",
    contact_phone: "+79990000001",
  });
  const vac = await publishShift(request, emp);

  const seeker = await login(request, "seeker", seed + 1, `Работник ${seed}`);
  await fillProfile(request, seeker, {
    name: `Работник ${seed}`,
    city: "Москва",
    roles: ["barista"],
    birth_date: "1997-05-10",
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
  const reply = await request.post(`${API_URL}/swipes`, {
    headers: auth(seeker),
    data: {
      target_id: vac.id,
      target_type: "vacancy",
      direction: "like",
    },
  });
  expect(reply.ok()).toBeTruthy();
  const matched = await reply.json();
  expect(matched.matched).toBe(true);

  const opened = await openApp(browser, seeker);
  return {
    ...opened,
    seeker: seeker as Session,
    matchId: matched.match_id as string,
  };
}

function asMessageBody(data: unknown): { text: string; client_message_id: string } {
  const body = data as Record<string, unknown>;
  expect(typeof body.text).toBe("string");
  expect(body.client_message_id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  return body as { text: string; client_message_id: string };
}

test.describe("восстановление чата", () => {
  test("сетевой сбой → failed живёт только до reload и plaintext не сохраняется", async ({
    browser,
    request,
  }) => {
    const { context, page, seeker, matchId } = await matchedChat(
      request,
      browser,
      920_100,
    );
    const attempts: string[] = [];

    await page.route(`**/matches/${matchId}/messages`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const body = asMessageBody(route.request().postDataJSON());
      attempts.push(body.client_message_id);
      await route.abort("failed");
    });

    await page.goto(`/#/chat/${matchId}`);
    await page.getByLabel("Текст сообщения").fill("Сообщение не должно пережить перезагрузку");
    await page.getByRole("button", { name: "Отправить" }).click();

    await expect(page.getByText("Не отправилось")).toBeVisible();
    await expect(page.locator(".bubble.mine", { hasText: "не должно пережить" })).toHaveCount(1);
    expect(attempts).toHaveLength(1);

    // Неподтверждённый текст и outbox содержат чувствительный plaintext.
    // Они могут помогать только пока жив текущий JS-контекст Mini App и не
    // должны попадать ни в localStorage, ни в sessionStorage.
    const persistentChatKeys = await page.evaluate(() => [
      ...Object.keys(localStorage),
      ...Object.keys(sessionStorage),
    ].filter((key) => key.startsWith("ss_chat_v1:")));
    expect(persistentChatKeys).toEqual([]);

    await page.reload();
    await page.waitForTimeout(750);

    // Hard reload уничтожает runtime-only recovery state: приложение не имеет
    // права автоматически повторять POST, если для этого пришлось бы хранить
    // plaintext на устройстве.
    expect(attempts).toHaveLength(1);
    await expect(page.locator(".bubble.mine", { hasText: "не должно пережить" })).toHaveCount(0);
    await expect(page.getByText("Не отправилось")).toHaveCount(0);
    await expect(page.getByLabel("Текст сообщения")).toHaveValue("");

    const history = await request.get(`${API_URL}/matches/${matchId}/messages`, {
      headers: auth(seeker),
    });
    const rows = (await history.json()) as Array<{
      client_message_id?: string;
      text: string;
    }>;
    expect(rows.filter((row) => row.client_message_id === attempts[0])).toHaveLength(0);

    await context.close();
  });

  test("если сервер уже принял сообщение, history гасит outbox до нового POST", async ({
    browser,
    request,
  }) => {
    const { context, page, seeker, matchId } = await matchedChat(
      request,
      browser,
      920_200,
    );
    const pageAttempts: Array<{ text: string; client_message_id: string }> = [];

    await page.route(`**/matches/${matchId}/messages`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      pageAttempts.push(asMessageBody(route.request().postDataJSON()));
      await route.abort("failed");
    });

    await page.goto(`/#/chat/${matchId}`);
    await page.getByLabel("Текст сообщения").fill("Сервер уже сохранил это сообщение");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByText("Не отправилось")).toBeVisible();
    expect(pageAttempts).toHaveLength(1);

    // Имитируем самый опасный случай: HTTP-ответ потерялся ПОСЛЕ commit.
    // Пока браузер offline, сервер принимает тот же receipt напрямую, поэтому
    // WebSocket не может заранее убрать локальную failed-запись.
    await context.setOffline(true);
    const accepted = await request.post(`${API_URL}/matches/${matchId}/messages`, {
      headers: auth(seeker),
      data: pageAttempts[0],
    });
    expect(accepted.ok()).toBeTruthy();
    await context.setOffline(false);

    await page.reload();
    await expect(page.locator(".bubble.mine", { hasText: "Сервер уже сохранил" }))
      .toHaveCount(1);
    await expect(page.getByText("Не отправилось")).toHaveCount(0);

    // История должна быть серверной истиной. Если здесь станет 2, значит
    // outbox успел повторить POST до того, как history подтвердил receipt.
    await page.waitForTimeout(750);
    expect(pageAttempts).toHaveLength(1);

    const history = await request.get(`${API_URL}/matches/${matchId}/messages`, {
      headers: auth(seeker),
    });
    const rows = (await history.json()) as Array<{ client_message_id?: string }>;
    expect(
      rows.filter((row) => row.client_message_id === pageAttempts[0].client_message_id),
    ).toHaveLength(1);

    await context.close();
  });
});
