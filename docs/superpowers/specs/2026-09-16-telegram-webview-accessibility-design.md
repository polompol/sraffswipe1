# Telegram WebView, Accessibility & Device Behavior Design

## Goal

Harden StaffSwipe for real Telegram Mini App usage on modern iOS and Android devices without replacing the existing navigation, theme, or Telegram SDK architecture.

This stage focuses on device behavior and accessibility only. It must not alter marketplace logic, financial invariants, moderation policy, matching logic, or backend authorization.

## Existing Architecture To Preserve

- Telegram integration remains centralized in `tma/src/telegram/sdk.ts`.
- `@tma.js/sdk-react` remains the Telegram SDK layer.
- Existing `showBackButton()` back-stack remains the single Telegram BackButton abstraction.
- Existing safe-area CSS variables remain the basis for layout insets.
- Existing `watchKeyboard()` / `visualViewport` handling remains the keyboard abstraction.
- Existing app theme and large-text mode remain intact.
- Existing React Router structure remains intact.
- Existing bottom navigation remains the primary app navigation.

No new global Telegram/layout state store is introduced.

## Scope

### 1. Telegram viewport and safe-area behavior

The app must remain usable when Telegram reports top, bottom, left, or right safe-area values.

Requirements:

- page content must not render underneath Telegram chrome or device cutouts;
- bottom navigation and fixed controls must stay above the bottom safe area;
- overlays and sheets must respect the same safe areas;
- the app must not introduce horizontal scrolling when left/right safe areas are non-zero;
- `100dvh`-based screens must remain stable when the Telegram viewport changes height;
- existing `viewport.expand()` behavior is retained.

The preferred implementation is CSS-token hardening and focused layout fixes, not a new React provider.

### 2. On-screen keyboard behavior

The existing `visualViewport` strategy remains the source of truth for keyboard overlap.

Requirements:

- chat composer remains visible above the keyboard;
- focused support/admin/profile form fields remain reachable by scrolling;
- keyboard opening must not create permanent excess bottom padding after close;
- Android resize behavior and iOS overlay behavior must both remain safe;
- browsers without `visualViewport` must continue with graceful fallback.

No draft text is persisted solely to solve viewport behavior.

### 3. Telegram BackButton hierarchy

The Telegram BackButton must always operate on the top-most logical UI state.

Priority order:

1. close an active modal/sheet/overlay;
2. close a card-detail or nested in-page state;
3. navigate back from the current route;
4. hide when there is no meaningful in-app back action.

The existing back-stack implementation is preserved. New code should register/unregister handlers rather than bypass the stack or attach directly to Telegram SDK objects.

### 4. Accessibility

The stage hardens accessibility without changing StaffSwipe's visual identity.

Requirements:

- interactive targets remain at least 44×44 CSS px where practical for touch controls;
- keyboard focus must remain visibly discoverable;
- form controls need explicit accessible labels;
- modal/sheet behavior must expose the active dialog semantics and a clear close action;
- status/error feedback that matters to task completion must be accessible to assistive technology;
- large-text mode must not clip primary actions, headers, card content, support forms, or admin controls;
- horizontal overflow is not allowed on supported mobile widths;
- semantic buttons/links must be used for interactive controls instead of click-only non-interactive elements.

This stage does not attempt a wholesale screen-reader redesign or introduce a third-party component library.

### 5. Reduced motion

Respect `prefers-reduced-motion: reduce` at the CSS layer.

When reduced motion is enabled:

- non-essential transition/entrance animations should be effectively disabled or shortened to near-zero duration;
- swipe functionality itself must remain usable;
- loading indicators may continue to communicate activity but should not depend on large motion;
- no user preference is stored separately: the operating-system/browser media query is authoritative.

### 6. Device/browser test matrix

Automated coverage should include representative mobile geometries rather than attempting to emulate every phone model.

Required browser viewport coverage:

- 320×568 — minimum supported compact phone;
- 390×844 — representative modern iPhone/Android phone;
- 430×932 — large modern phone.

Required modes:

- normal text;
- StaffSwipe large-text mode;
- simulated non-zero top/bottom/left/right safe areas;
- reduced-motion media preference;
- keyboard/visualViewport behavior where the current harness can model it;
- no horizontal overflow on core screens.

The existing Playwright layout, keyboard, overlay, appearance, feed-large-layout, and support suites should be extended instead of creating duplicate full-app suites when possible.

## Real-device boundary

Browser automation does not prove the behavior of the actual Telegram WebView.

Repository completion for this stage requires green automated tests, but production release still requires separate real-device smoke testing in Telegram on at least one recent iOS device and one recent Android device.

The real-device smoke should verify:

- Mini App expands correctly;
- Telegram BackButton behavior;
- safe areas around notch/home indicator;
- chat/support form behavior with the keyboard open;
- bottom navigation accessibility;
- large-text mode;
- swipe gestures do not accidentally collapse the Mini App;
- theme/chrome colors remain visually coherent.

This remains an external release gate and must not be reported as independently completed from repository CI.

## Error handling and compatibility

- Telegram SDK calls remain wrapped in safe fallbacks so browser/dev mode keeps working.
- Missing `visualViewport`, unsupported Telegram methods, or zero safe-area values are valid states, not errors.
- Accessibility hardening must not turn unsupported platform APIs into fatal startup failures.
- Any new device-specific behavior must have a browser-safe fallback.

## Testing strategy

Implementation follows TDD.

1. Add focused RED tests for each proven gap before changing production behavior.
2. Prefer unit tests for pure/back-stack/device helper behavior.
3. Use Playwright for geometry, safe-area, reduced-motion, keyboard and overflow behavior.
4. Run TMA CI after frontend changes.
5. Run the full four PR workflows on one final SHA: TMA CI, Backend CI including PostgreSQL, E2E, and Security.
6. Keep PR #62 Draft and unmerged at the end of this stage.

## Non-goals

This stage does not:

- redesign StaffSwipe screens;
- add a new navigation framework;
- replace React Router;
- add a new global state store;
- change marketplace/business rules;
- change payment or moderation behavior;
- add device fingerprinting;
- claim real Telegram iOS/Android verification from browser CI.

## Acceptance criteria

Repository stage is complete only when:

- safe-area tests pass for compact, standard and large mobile dimensions;
- no tested core screen has unintended horizontal overflow;
- keyboard overlap coverage passes;
- Telegram BackButton stack coverage passes for route + nested UI states;
- reduced-motion behavior is covered and passes;
- large-text coverage passes on compact and large phones;
- TMA CI is green;
- Backend CI including PostgreSQL is green;
- E2E is green;
- Security is green;
- all four workflows are green on the same final SHA;
- PR #62 remains Draft and unmerged;
- real Telegram iOS/Android smoke remains explicitly documented as an external release gate.
