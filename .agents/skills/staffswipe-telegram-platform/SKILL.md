---
name: staffswipe-telegram-platform
description: Telegram Mini App platform integration review for StaffSwipe1. Use for Telegram SDK, initData, theme, viewport, safe area, BackButton, MainButton, haptics, deep links, launch params, keyboard, lifecycle, share/invite, bot handoff, or Telegram-specific UX changes.
---

# StaffSwipe1 Telegram Mini App platform

StaffSwipe is a Telegram Mini App, not a generic mobile web page. Platform integrations should feel native while preserving server-side security boundaries.

Use the currently installed Telegram Mini App SDK/API surface in the repository. Verify exact SDK APIs from the installed version before coding; do not copy obsolete examples from memory.

## Security boundary

Telegram client APIs are UX inputs, not trusted identity proof.

- Never authenticate from `initDataUnsafe` or client-provided user objects.
- Send signed init data to the backend and validate it server-side according to `staffswipe-security`.
- Do not trust theme, launch params, viewport, or client storage for authorization or money decisions.
- Deep-link payloads and start params are untrusted input and require validation, expiry/state checks where relevant, and safe parsing.

## Initialization

At app start:

- initialize only supported Telegram capabilities;
- tolerate development/browser mode where the project intentionally supports it;
- avoid blocking first paint on optional platform features;
- apply theme and safe-area information before expensive UI work when possible;
- keep initialization idempotent so React re-renders do not register duplicate listeners.

Clean up platform event listeners on unmount/re-registration.

## Viewport and safe areas

Handle:

- Telegram viewport height changes;
- iOS bottom safe area/home indicator;
- top inset/header differences;
- keyboard opening and closing;
- short screens where fixed bottom actions can cover content;
- orientation/resize events when supported.

Do not rely blindly on `100vh`. Prefer the project/platform-provided viewport variables and safe-area tokens where available.

Critical bottom actions must remain reachable with the keyboard open.

## BackButton

Use Telegram BackButton when navigation has a meaningful previous state.

Rules:

- one effective back handler at a time;
- handler must follow app navigation semantics, not browser history blindly;
- hide it on root screens where back would exit unexpectedly;
- avoid rendering a duplicate top-left back action unless platform/browser fallback requires it;
- close modal/sheet/detail state before popping major navigation when that matches user expectation.

Test repeated navigation so listeners do not stack.

## MainButton / secondary platform actions

Use Telegram platform buttons only when they improve the screen rather than duplicating existing primary actions.

- label must reflect the current action/state;
- disable while submission is unsafe/repeated;
- show progress only for real in-flight work;
- unregister/hide on route change;
- never let a stale callback submit the previous screen's form;
- server remains authoritative for action eligibility.

If the design system already has a clearer in-app CTA for a swipe/card interaction, do not force MainButton usage merely because Telegram provides it.

## Haptic feedback

Haptics reinforce visible state; they never replace it.

Suggested semantics:

- light selection for filter/toggle changes;
- light/medium impact for swipe commitment;
- success notification for match or completed action;
- error notification only for meaningful failed actions, not every validation keystroke.

Avoid repeated haptics during drag gestures and rapid lists. Respect platform capability and fail gracefully when unavailable.

## Theme integration

StaffSwipe has its own brand theme. Telegram theme values can influence chrome/background compatibility, but must not destroy StaffSwipe's design tokens.

- map platform theme data into controlled variables/tokens;
- maintain contrast in both StaffSwipe light and dark modes;
- avoid white flashes during startup;
- update if Telegram theme changes while the app is open when supported;
- keep semantic colors independent from Telegram accent color.

Coordinate visual decisions with `staffswipe-visual-design`.

## Keyboard and chat UX

For chat/forms:

- keep the focused field visible;
- keep send/submit controls reachable;
- avoid layout jump when the visual viewport changes;
- preserve scroll position sensibly;
- do not auto-scroll away from a user's reading position simply because a WebSocket message arrives;
- restore bottom anchoring when the user explicitly returns to newest messages.

## Launch params, deep links, share and referral

For start parameters and shared shift/referral links:

- use compact opaque identifiers or signed short-lived payloads where sensitive state is involved;
- never put secrets, phone, INN, precise private location, or auth tokens in Telegram URLs;
- validate referenced resources server-side after launch;
- handle expired/deleted/private resources with a useful fallback screen;
- attribute referrals server-side according to `staffswipe-growth` and `staffswipe-trust-safety`.

## Bot handoff and notifications

When moving between bot messages and Mini App:

- deep links should land on a useful state, not a blank root when context exists;
- notification actions must be idempotent and state-aware;
- opening an outdated shift/match should explain the new state;
- bot text must not imply an action succeeded until the backend confirms it.

## Storage and lifecycle

- Treat local/session/cloud storage as convenience state only.
- Do not store long-lived secrets or sensitive personal data in client storage.
- Namespaced versioned keys are preferred for theme/UI preferences.
- Handle resume/reopen by refetching authoritative time-sensitive state.
- Avoid assuming the Mini App process remains alive between interactions.

## Performance

Telegram startup speed matters.

- keep initialization small;
- lazy-load secondary routes/assets;
- compress venue images and avoid oversized animation assets;
- avoid loading full candidate lists before first interaction;
- use cached/query state carefully but refetch stale critical state;
- coordinate with `staffswipe-performance`.

## Platform review checklist

- Is every Telegram API call supported by the installed SDK version?
- Is init data verified only on the server?
- Are BackButton/MainButton listeners cleaned up?
- Does the screen work with keyboard + short viewport + safe area?
- Does haptic feedback match visible state and fail gracefully?
- Does theme switching preserve StaffSwipe contrast/brand?
- Are deep links/referrals validated server-side?
- Does reopening the Mini App recover authoritative state?

## Verification

Test in browser fallback plus real Telegram clients when possible, including iOS and Android behavior for viewport, safe area, keyboard, theme, BackButton, MainButton, haptics, and deep links. Run TMA lint/typecheck/tests/build and relevant E2E tests. Apply `staffswipe-security`, `staffswipe-visual-design`, and `staffswipe-performance` for overlapping changes.
