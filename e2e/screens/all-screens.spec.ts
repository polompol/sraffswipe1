import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../screenshots");
mkdirSync(OUT, { recursive: true });

async function shot(page: Page, path: string, name: string) {
  await page.goto(`/#${path}`);
  await expect(page.locator(".app")).toBeVisible();
  await page.waitForTimeout(650);
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true });
}

async function setRole(page: Page, role: "seeker" | "employer") {
  await page.goto("/#/onboarding");
  await page.evaluate((r: string) => {
    localStorage.setItem("ss_jwt", "mock");
    localStorage.setItem("ss_role", r);
    localStorage.setItem("ss_uid", "me");
    localStorage.setItem("ss_consent", "1");
    localStorage.setItem("ss_swipe_hinted", "1");
  }, role);
  // Zustand reads auth/role from localStorage when the app module is loaded.
  // Reload so the browser session hydrates the role we just selected before
  // navigating to protected routes for screenshots.
  await page.reload();
}

test("capture all current StaffSwipe route screens", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/#/onboarding");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Смены рядом с домом — на один день")).toBeVisible();
  await page.screenshot({ path: resolve(OUT, "00-onboarding-1.png"), fullPage: true });
  await page.getByRole("button", { name: "Далее" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, "01-onboarding-2.png"), fullPage: true });
  await page.getByRole("button", { name: "Далее" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, "02-onboarding-3.png"), fullPage: true });

  await page.goto("/#/role");
  await expect(page.getByText("С чего начнём?")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.screenshot({ path: resolve(OUT, "03-role-picker.png"), fullPage: true });

  await setRole(page, "seeker");
  await shot(page, "/welcome", "10-seeker-welcome");
  await shot(page, "/feed", "11-seeker-feed");
  await shot(page, "/matches", "12-seeker-my-shifts");
  await shot(page, "/chat/demo-match", "13-seeker-chat");
  await shot(page, "/favorites", "14-seeker-favorites");
  await shot(page, "/profile", "15-seeker-profile");
  await shot(page, "/profile/edit", "16-seeker-profile-edit");
  await shot(page, "/invites", "17-seeker-invites");
  await shot(page, "/settings", "18-seeker-settings");
  await shot(page, "/support", "19-seeker-support");

  await setRole(page, "employer");
  await shot(page, "/welcome", "20-employer-welcome");
  await shot(page, "/feed", "21-employer-feed");
  await shot(page, "/matches", "22-employer-people");
  await shot(page, "/vacancy/my", "23-employer-shifts");
  await shot(page, "/vacancy/new", "24-employer-new-shift");
  await shot(page, "/workers", "25-employer-workers");
  await shot(page, "/applicants", "26-employer-applicants");
  await shot(page, "/chat/demo-match", "27-employer-chat");
  await shot(page, "/profile", "28-employer-profile");
  await shot(page, "/profile/edit", "29-employer-profile-edit");
  await shot(page, "/invites", "30-employer-invites");
  await shot(page, "/settings", "31-employer-settings");
  await shot(page, "/support", "32-employer-support");
  await shot(page, "/funnel", "33-analytics-funnel");
  await shot(page, "/admin", "34-admin");
});
