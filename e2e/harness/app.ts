import type { APIRequestContext, Browser, BrowserContext, Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";

import { API_URL } from "./env";

export interface Session {
  token: string;
  id: string;
  role: "seeker" | "employer";
}

/** Вход как конкретный человек Telegram.
 *
 *  В браузере настоящей подписи Telegram взять негде, поэтому сервер запущен
 *  в режиме разработки и принимает неподписанные initData. Идентичность при
 *  этом берётся из тех же полей, что и в бою (`user` внутри initData), — то
 *  есть у каждой стороны свой Telegram-аккаунт, как у живых людей. Без этого
 *  оба участника оказались бы одним человеком, и сервер отказался бы
 *  создавать мэтч с самим собой.
 */
export async function login(
  request: APIRequestContext,
  role: "seeker" | "employer",
  tgId: number,
  firstName: string,
): Promise<Session> {
  const user = encodeURIComponent(
    JSON.stringify({ id: tgId, first_name: firstName }),
  );
  const res = await request.post(`${API_URL}/auth/telegram`, {
    data: { init_data: `user=${user}`, role },
  });
  if (!res.ok()) {
    throw new Error(`вход не удался (${res.status()}): ${await res.text()}`);
  }
  // Сервер отвечает в snake_case — в camelCase их переименовывает клиент,
  // а тест ходит к серверу напрямую.
  const body = await res.json();
  return { token: body.access_token, id: body.user_id, role };
}

/** Заголовок для прямых обращений к серверу из теста. */
export function auth(s: Session): Record<string, string> {
  return { Authorization: `Bearer ${s.token}` };
}

/**
 * Окно приложения от имени этого человека.
 *
 *  Токен кладётся в localStorage ровно теми ключами, какими его кладёт само
 *  приложение после входа: дальше оно ведёт себя как после обычного запуска.
 *  Подсказка о свайпе гасится — она одноразовая и в тестах только мешает
 *  ловить карточку.
 */
export async function openApp(
  browser: Browser,
  s: Session,
  extra: Record<string, string> = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await context.addInitScript(
    ([session, more]) => {
      localStorage.setItem("ss_jwt", session.token);
      localStorage.setItem("ss_role", session.role);
      localStorage.setItem("ss_uid", session.id);
      localStorage.setItem("ss_consent", "1");
      localStorage.setItem("ss_swipe_hinted", "1");
      for (const [k, v] of Object.entries(more)) localStorage.setItem(k, v);
    },
    [s, extra] as const,
  );
  const page = await context.newPage();
  return { context, page };
}

/** Смена через N дней — в формате, который принимает сервер. */
export function inDays(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export const SHIFT = {
  rate: 400,
  start_time: 10 * 60,
  end_time: 18 * 60,
  pay: 400 * 8,
  fee: (400 * 8) / 10,
};

/** Опубликовать смену от имени заведения (подготовка сцены, не проверка). */
export async function publishShift(
  request: APIRequestContext,
  emp: Session,
  opts: { role?: string; days?: number; city?: string } = {},
): Promise<{ id: string; date: string }> {
  const res = await request.post(`${API_URL}/vacancies`, {
    headers: auth(emp),
    data: {
      role: opts.role ?? "barista",
      date: inDays(opts.days ?? 2),
      start_time: SHIFT.start_time,
      end_time: SHIFT.end_time,
      rate: SHIFT.rate,
      rate_type: "perHour",
      city: opts.city ?? "Москва",
      address: "ул. Льва Толстого, 16",
      lat: 55.75,
      lng: 37.61,
      pay_method: "card",
      tips: "shared",
      description: "Нужен бариста на утро. Дресс-код: чёрный верх.",
    },
  });
  if (!res.ok()) {
    throw new Error(`смену не опубликовать (${res.status()}): ${await res.text()}`);
  }
  const v = await res.json();
  return { id: v.id, date: v.date };
}

/** Заполнить анкету — как после онбординга. */
export async function fillProfile(
  request: APIRequestContext,
  s: Session,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await request.put(`${API_URL}/me`, { headers: auth(s), data });
  if (!res.ok()) {
    throw new Error(`анкета не сохранилась (${res.status()}): ${await res.text()}`);
  }
}

/** Дождаться, пока экран перестанет двигаться.
 *
 *  Карточка появляется с анимацией: страница выезжает снизу (`pageIn`),
 *  колода расставляет карты пружинами. `toBeVisible()` срабатывает раньше —
 *  элемент уже виден, но ещё едет, и замеры геометрии ловят промежуточный
 *  кадр. Раз в несколько прогонов из-за этого падала проверка раскладки на
 *  дешёвом андроиде: доля экрана под карточкой оказывалась меньше порога.
 *
 *  Ждём, пока прямоугольник перестанет меняться три кадра подряд, — этого
 *  достаточно и для CSS-анимаций, и для пружин, которые Web Animations не
 *  используют вовсе.
 */
export async function waitForStableLayout(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const w = window as unknown as { __ss?: { box: string; same: number } };
      const box = JSON.stringify(el.getBoundingClientRect());
      const prev = w.__ss;
      if (!prev || prev.box !== box) {
        w.__ss = { box, same: 0 };
        return false;
      }
      prev.same += 1;
      return prev.same >= 3;
    },
    selector,
    { polling: "raf", timeout: 10_000 },
  );
}

/** Перемотать смену в прошлое — чтобы её можно было закрыть.
 *
 *  Закрыть смену, отметить неявку и уточнить часы можно только ПОСЛЕ её
 *  окончания: без этого правила пара сговорившихся аккаунтов набивала бы себе
 *  закрытые смены и рейтинг за минуты, а работник мог получить ложную неявку
 *  ещё до того, как выйдет на работу.
 *
 *  Живому браузеру время не перемотать, поэтому дату смены двигаем прямо в
 *  базе — той самой, что создана для этого прогона. Служебных ручек ради
 *  тестов в приложении заводить нельзя: любая такая ручка живёт и в бою.
 *
 *  Двигаем на СУТКИ С ЗАПАСОМ, а не «на вчера»: в час ночи вчерашняя смена
 *  10:00–18:00 закончилась семь часов назад, а расчёту нужно двенадцать — и
 *  тест падал бы по ночам при исправном коде.
 */
export function ageShift(matchId: string, days = 2): void {
  const file = process.env.E2E_DB;
  if (!file) throw new Error("не задан путь к базе прогона (E2E_DB)");
  const db = new DatabaseSync(file);
  try {
    const row = db
      .prepare("SELECT vacancy_id FROM matches WHERE id = ?")
      .get(matchId) as { vacancy_id?: string } | undefined;
    if (!row?.vacancy_id) throw new Error(`смена ${matchId} не найдена`);
    const past = new Date(Date.now() - days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    db.prepare("UPDATE vacancies SET date = ? WHERE id = ?").run(past, row.vacancy_id);
  } finally {
    db.close();
  }
}

/** Короткая ссылка на документ — та же, что берёт приложение.
 *
 *  Полный токен в адресе больше не принимается: он живёт днями, а адрес
 *  оседает в истории браузера и в логах сервера. Документы открывает
 *  отдельный токен на пять минут (POST /auth/doc-token).
 */
export async function docToken(
  request: APIRequestContext,
  s: Session,
): Promise<string> {
  const res = await request.post(`${API_URL}/auth/doc-token`, { headers: auth(s) });
  if (!res.ok()) {
    throw new Error(`токен на документ не выдан (${res.status()})`);
  }
  return (await res.json()).token;
}
