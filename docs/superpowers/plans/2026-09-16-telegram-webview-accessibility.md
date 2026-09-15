# Telegram WebView, Accessibility & Device Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and harden StaffSwipe behavior in Telegram WebView across safe-area changes, software keyboard movement, reduced-motion preferences, large-text mode and representative phone sizes without introducing a new navigation or viewport architecture.

**Architecture:** Preserve the existing `telegram/sdk.ts` adapter, CSS safe-area tokens, `visualViewport` keyboard helper and BackButton stack. This is an audit-and-hardening vertical: add deterministic unit/browser coverage first, then change production code only when a test demonstrates a real defect.

**Tech Stack:** React 18, TypeScript, `@tma.js/sdk-react` 3.0.23, Vitest, Testing Library, Playwright, CSS custom properties, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-telegram-webview-accessibility-design.md`

## Global Constraints

- Keep `@tma.js/sdk-react` at `3.0.23` during this stage; it is the current npm latest React binding as of 2026-09-16.
- Keep direct Telegram platform access inside `tma/src/telegram/sdk.ts`.
- Keep the existing `createBackStack` navigation ownership model; do not add a second BackButton system.
- Keep safe areas CSS-driven through TMA.js `viewport.bindCssVars()`.
- TMA.js 3.x default viewport CSS names are `--tg-viewport-*`; do not replace them with Telegram raw `--tg-safe-area-*` names while this binding remains in use.
- Keep browser/dev fallbacks functional when Telegram APIs or `visualViewport` are unavailable.
- Do not redesign product screens or change business, payment, matching or moderation behavior.
- Do not claim physical Telegram iOS/Android verification from Playwright.
- PR #62 remains Draft and unmerged throughout this stage.

---

### Task 1: Lock the TMA.js safe-area and reduced-motion CSS contracts

**Files:**
- Modify: `tma/src/theme/css.test.ts`
- Read-only reference: `tma/src/theme/theme.css`
- Read-only reference: `tma/src/index.css`

**Interfaces:**
- Consumes the existing CSS tokens `--app-safe-top`, `--app-safe-bottom`, `--app-safe-left`, `--app-safe-right`.
- Produces regression tests proving those tokens still depend on the TMA.js viewport-bound inset names and browser `env(safe-area-inset-*)` fallback.

- [ ] **Step 1: Add a focused CSS contract test**

Extend `describe("таблицы стилей", ...)` with:

```ts
it("safe-area tokens follow TMA.js viewport CSS variables", () => {
  const css = read("./theme.css");
  expect(css).toContain("--tg-viewport-safe-area-inset-top");
  expect(css).toContain("--tg-viewport-safe-area-inset-bottom");
  expect(css).toContain("--tg-viewport-content-safe-area-inset-top");
  expect(css).toContain("--tg-viewport-content-safe-area-inset-bottom");
  expect(css).toContain("env(safe-area-inset-top)");
  expect(css).toContain("env(safe-area-inset-bottom)");
});
```

Keep the existing `prefers-reduced-motion` assertion unchanged.

- [ ] **Step 2: Run the focused CSS test**

Run: `cd tma && npm test -- --run src/theme/css.test.ts`

Expected: PASS if the existing platform contract is intact. If it fails, inspect the exact token mismatch before changing CSS; do not rename variables based only on Telegram raw API documentation because StaffSwipe consumes TMA.js-bound names.

- [ ] **Step 3: Commit the characterization guard**

Commit message: `test(tma): lock Telegram safe-area CSS contract`

---

### Task 2: Characterize the visualViewport keyboard observer

**Files:**
- Create: `tma/src/lib/keyboard.test.ts`
- Modify only if a test proves a defect: `tma/src/lib/keyboard.ts`

**Interfaces:**
- Consumes: `watchKeyboard(): () => void`.
- Produces: deterministic tests for `--kb`, event refresh and cleanup.

- [ ] **Step 1: Create the visualViewport test double**

In `keyboard.test.ts`, install a minimal fake object with mutable `height`/`offsetTop` and listener sets for `resize` and `scroll`:

```ts
const listeners = {
  resize: new Set<() => void>(),
  scroll: new Set<() => void>(),
};

const viewport = {
  height: 500,
  offsetTop: 0,
  addEventListener(type: "resize" | "scroll", fn: () => void) {
    listeners[type].add(fn);
  },
  removeEventListener(type: "resize" | "scroll", fn: () => void) {
    listeners[type].delete(fn);
  },
};
```

Define it as `window.visualViewport` for the test and restore the original descriptor afterward.

- [ ] **Step 2: Test keyboard height, threshold, both events and cleanup**

With `window.innerHeight` set to `844`:

```ts
const stop = watchKeyboard();
expect(document.documentElement.style.getPropertyValue("--kb")).toBe("344px");

viewport.height = 840;
listeners.resize.forEach((fn) => fn());
expect(document.documentElement.style.getPropertyValue("--kb")).toBe("0px");

viewport.height = 600;
viewport.offsetTop = 20;
listeners.scroll.forEach((fn) => fn());
expect(document.documentElement.style.getPropertyValue("--kb")).toBe("224px");

stop();
expect(document.documentElement.style.getPropertyValue("--kb")).toBe("");
expect(listeners.resize.size).toBe(0);
expect(listeners.scroll.size).toBe(0);
```

Also add one test where `visualViewport` is unavailable and verify `watchKeyboard()` returns a cleanup function without writing `--kb`.

- [ ] **Step 3: Run the focused test and classify the result**

Run: `cd tma && npm test -- --run src/lib/keyboard.test.ts`

Expected: PASS on the current implementation. If any assertion fails, treat that exact assertion as the RED reproduction and modify only `keyboard.ts` enough to satisfy it.

- [ ] **Step 4: Re-run the focused test after any proven fix**

Run: `cd tma && npm test -- --run src/lib/keyboard.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `test(tma): cover visual viewport keyboard offsets`

If production code was required, use `fix(tma): stabilize visual viewport keyboard offsets` instead.

---

### Task 3: Add safe-area geometry coverage on compact and large phones

**Files:**
- Create: `e2e/tests/telegram-webview.spec.ts`
- Modify only if a browser test proves a defect: `tma/src/theme/theme.css`, `tma/src/index.css`, or the single affected component.

**Interfaces:**
- Consumes: existing login/openApp harness and CSS variables bound by TMA.js.
- Produces: browser evidence for non-zero top/bottom/left/right safe areas and no horizontal overflow.

- [ ] **Step 1: Add a helper that injects TMA.js viewport inset variables**

```ts
async function setTelegramInsets(page: Page) {
  await page.evaluate(() => {
    const s = document.documentElement.style;
    s.setProperty("--tg-viewport-safe-area-inset-top", "47px");
    s.setProperty("--tg-viewport-safe-area-inset-bottom", "34px");
    s.setProperty("--tg-viewport-safe-area-inset-left", "24px");
    s.setProperty("--tg-viewport-safe-area-inset-right", "26px");
    s.setProperty("--tg-viewport-content-safe-area-inset-top", "59px");
    s.setProperty("--tg-viewport-content-safe-area-inset-bottom", "48px");
    s.setProperty("--tg-viewport-content-safe-area-inset-left", "28px");
    s.setProperty("--tg-viewport-content-safe-area-inset-right", "31px");
  });
}
```

- [ ] **Step 2: Test compact and large phone geometry**

For `{width: 320, height: 568}` and `{width: 430, height: 932}`:

1. log in a seeker with the existing harness;
2. open `/#/support`;
3. call `setTelegramInsets(page)`;
4. wait for stable layout;
5. assert computed `.app` top padding is at least `59px`;
6. assert `.page` left/right padding is at least `28px`/`31px`;
7. assert document horizontal overflow is `0`;
8. scroll to the end and assert the last visible page content is not hidden below the bottom tabbar/safe area.

Do not require exact pixel equality where browser `env()` may be larger; use minimum comparisons.

- [ ] **Step 3: Repeat the compact case in StaffSwipe large-text mode**

Open the app with `{ ss_large: "1" }` and assert:

- no horizontal overflow;
- `Тема обращения`, `Опишите проблему`, and `Отправить обращение` remain visible/reachable;
- the submit button bounding box has height ≥44px.

- [ ] **Step 4: Run the focused E2E test**

Run the existing E2E command targeting `telegram-webview.spec.ts` according to the repository Playwright harness.

Expected: PASS. If it fails, record the exact measured geometry first, then make the smallest CSS/component fix that addresses that measurement.

- [ ] **Step 5: Re-run focused E2E after any proven fix**

Expected: PASS on both 320×568 and 430×932 plus compact large-text mode.

- [ ] **Step 6: Commit**

Commit message: `test(e2e): cover Telegram safe-area geometry`

If production CSS changed, use `fix(tma): respect Telegram safe areas on mobile`.

---

### Task 4: Prove reduced-motion behavior in the browser

**Files:**
- Modify: `e2e/tests/appearance.spec.ts`
- Modify only if a test proves a defect: `tma/src/index.css`

**Interfaces:**
- Consumes existing `prefers-reduced-motion: reduce` CSS.
- Produces runtime browser evidence rather than static string-only coverage.

- [ ] **Step 1: Add a reduced-motion browser case**

Use `page.emulateMedia({ reducedMotion: "reduce" })`, open a screen with standard buttons and the swipe feed, then inspect computed styles:

```ts
const motion = await page.evaluate(() => {
  const button = document.querySelector(".ui-btn") as HTMLElement | null;
  const flip = document.querySelector(".flip") as HTMLElement | null;
  return {
    buttonTransition: button ? getComputedStyle(button).transitionDuration : "",
    flipTransition: flip ? getComputedStyle(flip).transitionDuration : "",
  };
});
```

Parse comma-separated duration values and assert every effective transition is `0.01ms`, `0s`, or otherwise ≤1ms.

- [ ] **Step 2: Verify the feed remains interactive**

With reduced motion still enabled, assert the visible top-card decision control remains enabled and its bounding box is non-zero. Do not require animation events.

- [ ] **Step 3: Run the focused appearance E2E**

Expected: PASS on current CSS. If runtime computed motion is longer, change only the relevant reduced-motion rule and re-run.

- [ ] **Step 4: Commit**

Commit message: `test(e2e): verify reduced motion behavior`

---

### Task 5: Re-verify BackButton and accessibility invariants

**Files:**
- Read/re-run: `tma/src/lib/backStack.test.ts`
- Read/re-run: `tma/src/features/feed/SwipeDeckBackButton.test.tsx`
- Read/re-run: `e2e/tests/keyboard.spec.ts`
- Read/re-run: `e2e/tests/feed-large-layout.spec.ts`
- Read/re-run: `e2e/tests/support.spec.ts`

**Interfaces:**
- No new navigation API.
- Existing `showBackButton()` / `createBackStack()` remains the only Telegram BackButton contract.

- [ ] **Step 1: Run the two BackButton unit suites**

Run:

```bash
cd tma && npm test -- --run \
  src/lib/backStack.test.ts \
  src/features/feed/SwipeDeckBackButton.test.tsx
```

Expected: PASS, including top-layer ownership, double-cleanup safety and one Telegram subscription.

- [ ] **Step 2: Run focused accessibility/device E2E suites**

Run the repository Playwright command for:

- `keyboard.spec.ts`;
- `feed-large-layout.spec.ts`;
- `support.spec.ts`;
- `telegram-webview.spec.ts`;
- the reduced-motion case in `appearance.spec.ts`.

Expected: PASS.

- [ ] **Step 3: Do not add a new BackButton abstraction if these pass**

No production change is required when existing stack behavior is already green.

---

### Task 6: Document the real Telegram device smoke gate

**Files:**
- Create: `docs/superpowers/verification/2026-09-16-telegram-device-smoke.md`

**Interfaces:**
- Produces a manual release checklist only; it does not mark any physical-device result as passed.

- [ ] **Step 1: Add the physical iOS/Android checklist**

The document must start with:

```md
# Telegram Physical Device Smoke — PENDING

This checklist is an external release gate. Browser CI does not satisfy it.
```

Include separate iOS and Android sections with checks for:

- launch from the real bot/Mini App entry point;
- initial full-height expansion;
- notch/header/home-indicator clearance;
- BackButton through route → card detail/sheet → route;
- chat keyboard open/close and composer visibility;
- support form keyboard open/close and submit visibility;
- large-text mode at the smallest practical font/display setting supported by the device;
- Telegram light/dark theme switch while the Mini App is open;
- swipe cards without accidental Telegram minimize/close;
- reopen/reload without broken safe-area padding.

Each row has `PENDING | PASS | FAIL`, device model, OS version, Telegram version and notes.

- [ ] **Step 2: Commit the checklist**

Commit message: `docs: add Telegram physical-device smoke gate`

---

### Task 7: Run final repository gates on one SHA

**Files:**
- No product changes unless a failing gate proves a defect.

**Interfaces:**
- Final evidence for Stage 6 repository completion.

- [ ] **Step 1: Run/observe TMA CI on the final head SHA**

Required conclusion: `success` for lint, typecheck, all Vitest tests and production build.

- [ ] **Step 2: Run/observe Backend CI on the same SHA**

Required conclusion: `success` for FastAPI/SQLite and PostgreSQL jobs.

- [ ] **Step 3: Run/observe E2E on the same SHA**

Required conclusion: `success`, including the new Telegram WebView/safe-area/reduced-motion coverage.

- [ ] **Step 4: Run/observe Security on the same SHA**

Required conclusion: `success` for gitleaks, production npm audit, pip-audit and both CodeQL languages.

- [ ] **Step 5: Verify PR #62 metadata**

Confirm:

- PR state `open`;
- `draft = true`;
- `merged = false`;
- final head SHA matches the four successful workflow runs.

- [ ] **Step 6: Report the external boundary explicitly**

Repository Stage 6 may be reported green only if all four workflows pass on one SHA. Physical Telegram iOS/Android smoke remains `PENDING` until a person executes the committed checklist; do not convert PR #62 to Ready and do not merge it in this task.