import { expect, test } from "@playwright/test";

import {
  fillProfile,
  login,
  openApp,
  publishShift,
  waitForStableLayout,
} from "../harness/app";

function durationMs(value: string): number[] {
  return value.split(",").map((part) => {
    const v = part.trim();
    if (v.endsWith("ms")) return Number.parseFloat(v);
    if (v.endsWith("s")) return Number.parseFloat(v) * 1000;
    return Number.NaN;
  });
}

test("reduced motion делает движения мгновенными, но лента остаётся рабочей", async ({
  browser,
  request,
}) => {
  const city = "Кострома";
  const emp = await login(request, "employer", 862_001, "Маяк");
  await fillProfile(request, emp, {
    company_name: "Кофейня «Маяк»",
    city,
    address: "Советская, 7",
    contact_phone: "+79998620001",
  });
  await publishShift(request, emp, { city });

  const seeker = await login(request, "seeker", 862_002, "Анна");
  await fillProfile(request, seeker, {
    name: "Анна",
    city,
    district: "Центр",
    roles: ["barista"],
    birth_date: "1997-02-11",
    med_book: "yes",
  });

  const { context, page } = await openApp(browser, seeker);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/feed");
  await expect(page.locator(".swipe-card").first()).toBeVisible();
  await waitForStableLayout(page, ".deck");

  const motion = await page.evaluate(() => {
    const flip = document.querySelector(".flip") as HTMLElement;
    const actions = document.querySelector(".actions") as HTMLElement;
    const tab = document.querySelector(".tab") as HTMLElement;
    return {
      flip: getComputedStyle(flip).transitionDuration,
      actions: getComputedStyle(actions).transitionDuration,
      tab: getComputedStyle(tab).transitionDuration,
    };
  });

  for (const [name, value] of Object.entries(motion)) {
    const durations = durationMs(value);
    expect(durations.length, `${name}: transition-duration должен быть задан`).toBeGreaterThan(0);
    expect(
      durations.every((ms) => Number.isFinite(ms) && ms <= 1),
      `${name}: reduced-motion оставил движение ${value}`,
    ).toBe(true);
  }

  const decide = page.getByRole("button", {
    name: "Откликнуться — хочу здесь работать",
  });
  await expect(decide).toBeVisible();
  await expect(decide).toBeEnabled();
  const box = await decide.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  await context.close();
});