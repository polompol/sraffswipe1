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
 * Крупный текст — отдельная геометрия ленты.
 *
 * Обычный режим layout.spec.ts уже проверяет девять телефонов. Здесь держим
 * только две крайности: самый низкий поддерживаемый экран и самый высокий.
 * На 320×568 карточка закономерно занимает меньшую долю экрана, потому что
 * подписи/кнопки крупнее; это допустимо. Недопустимы потерянный текст,
 * горизонтальный скролл, перекрытие действий и тач-зоны меньше 44px.
 */
const EXTREMES = [
  { name: "старый iPhone SE", w: 320, h: 568, minDeckShare: 45 },
  { name: "iPhone 15 Pro Max", w: 430, h: 932, minDeckShare: 55 },
];

test.describe("лента с крупным текстом", () => {
  test.beforeAll(async ({ request }) => {
    const emp = await login(request, "employer", 831_001, "Большая кухня");
    await fillProfile(request, emp, {
      company_name: "Кофейня «Большая кухня на Покровке»",
      city: "Санкт-Петербург",
      address: "ул. Льва Толстого, 16",
      contact_phone: "+79990000031",
    });
    await publishShift(request, emp, { city: "Санкт-Петербург" });

    const seeker = await login(request, "seeker", 831_002, "Мария");
    await fillProfile(request, seeker, {
      name: "Мария",
      city: "Санкт-Петербург",
      district: "Басманный",
      roles: ["barista"],
      birth_date: "1998-04-12",
      med_book: "yes",
      about: "Опыт в кофейне, знаю профессиональные кофемашины и кассу.",
    });
    await request.post(`${API_URL}/me/available`, {
      headers: auth(seeker),
      data: { available: true },
    });
  });

  for (const phone of EXTREMES) {
    test(`${phone.name} ${phone.w}×${phone.h}`, async ({ browser, request }) => {
      const seeker = await login(request, "seeker", 831_002, "Мария");
      const { context, page } = await openApp(browser, seeker, { ss_large: "1" });
      await page.setViewportSize({ width: phone.w, height: phone.h });
      await page.goto("/#/feed");
      await expect(page.locator(".swipe-card").first()).toBeVisible();
      await waitForStableLayout(page, ".deck");

      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const deck = document.querySelector(".deck")!.getBoundingClientRect();
        const body = document.querySelector(".swipe-body") as HTMLElement;
        const acts = document.querySelector(".actions")!.getBoundingClientRect();
        const tabbar = document.querySelector(".tabbar")!.getBoundingClientRect();

        let underButtons = 0;
        for (const child of Array.from(body.children)) {
          const r = child.getBoundingClientRect();
          if (r.height > 0 && r.bottom > acts.top) {
            underButtons = Math.max(underButtons, Math.round(r.bottom - acts.top));
          }
        }

        const actionButtons = Array.from(
          document.querySelectorAll<HTMLElement>(".actions .act"),
        );
        const reachable = actionButtons.every((a) => {
          const r = a.getBoundingClientRect();
          const hit = document.elementFromPoint(
            r.left + r.width / 2,
            r.top + r.height / 2,
          );
          return !!hit && !!hit.closest(".act");
        });
        const minActionSize = Math.min(
          ...actionButtons.map((a) => {
            const r = a.getBoundingClientRect();
            return Math.min(r.width, r.height);
          }),
        );

        const card = document.querySelector(".swipe-card")!.getBoundingClientRect();
        const detailsHit = document.elementFromPoint(card.left + 40, card.top + 60);

        return {
          large: document.body.dataset.large,
          overflowX: de.scrollWidth - de.clientWidth,
          deckShare: Math.round((deck.height / window.innerHeight) * 100),
          clipped: body.scrollHeight - body.clientHeight,
          underButtons,
          reachable,
          minActionSize: Math.round(minActionSize),
          detailsReachable: !!detailsHit && !!detailsHit.closest(".swipe-card"),
          actionsAboveTabbar: acts.bottom <= tabbar.top + 1,
        };
      });

      expect(m.large, "тест обязан реально включить крупный режим").toBe("1");
      expect(m.overflowX, "экран не должен ездить вбок").toBe(0);
      expect(m.deckShare, "карточка остаётся главным предметом экрана")
        .toBeGreaterThanOrEqual(phone.minDeckShare);
      expect(m.clipped, "важный текст карточки не должен обрезаться")
        .toBeLessThanOrEqual(4);
      expect(m.underButtons, "текст не должен уходить под кнопки")
        .toBeLessThanOrEqual(4);
      expect(m.reachable, "обе кнопки действия должны нажиматься").toBe(true);
      expect(m.minActionSize, "тач-зона действия не меньше 44px")
        .toBeGreaterThanOrEqual(44);
      expect(m.detailsReachable, "карточка должна принимать касание").toBe(true);
      expect(m.actionsAboveTabbar, "действия не должны прятаться под таббар")
        .toBe(true);

      await context.close();
    });
  }
});
