import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = "http://127.0.0.1:4173";
const out = new URL("./screenshots/", import.meta.url);
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function newPhone() {
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  return { context, page };
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1300);
}

async function shot(page, name, route) {
  await page.goto(`${base}/#${route}`);
  await settle(page);
  await page.screenshot({ path: new URL(`${name}.png`, out), fullPage: true });
}

// Public / pre-auth flow.
{
  const { context, page } = await newPhone();
  await shot(page, "00-onboarding", "/onboarding");
  await page.goto(`${base}/#/role`);
  await settle(page);
  const consent = page.locator('input[type="checkbox"]');
  if (await consent.count()) await consent.check();
  await page.screenshot({ path: new URL("01-role-picker.png", out), fullPage: true });
  await context.close();
}

async function captureRole(role) {
  const { context, page } = await newPhone();
  await page.goto(`${base}/#/role`);
  await settle(page);
  const consent = page.locator('input[type="checkbox"]');
  if (await consent.count()) await consent.check();

  const roleButton = role === "seeker"
    ? page.getByText("Я ищу подработку", { exact: true })
    : page.getByText("Я ищу сотрудников", { exact: true });
  await roleButton.click();
  await page.waitForURL(/#\/welcome/);
  await settle(page);
  await page.screenshot({ path: new URL(`${role}-02-welcome.png`, out), fullPage: true });

  const common = [
    ["feed", "/feed"],
    ["matches", "/matches"],
    ["profile", "/profile"],
    ["profile-edit", "/profile/edit"],
    ["settings", "/settings"],
    ["support", "/support"],
    ["chat", "/chat/demo-match"],
    ["funnel", "/funnel"],
    ["admin", "/admin"],
  ];

  const seekerOnly = [
    ["favorites", "/favorites"],
    ["invites", "/invites"],
  ];

  const employerOnly = [
    ["vacancies", "/vacancy/my"],
    ["vacancy-new", "/vacancy/new"],
    ["workers", "/workers"],
    ["applicants", "/applicants"],
  ];

  for (const [name, route] of [...common, ...(role === "seeker" ? seekerOnly : employerOnly)]) {
    await shot(page, `${role}-${name}`, route);
  }

  await context.close();
}

await captureRole("seeker");
await captureRole("employer");
await browser.close();
