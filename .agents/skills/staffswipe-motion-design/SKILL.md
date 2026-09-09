---
name: staffswipe-motion-design
description: Motion and interaction choreography for StaffSwipe1. Use for swipe physics, gestures, transitions, sheets, match/success moments, loading feedback, haptics, and reduced-motion behavior in the Telegram Mini App.
---

# StaffSwipe1 motion design

Motion is a product signal, not decoration. It must explain gesture intent, state change, hierarchy, success, or failure while keeping the Telegram Mini App fast.

## Source of truth

Use the existing React motion stack first: `@react-spring/web` and `@use-gesture/react`. Do not add another animation framework for a single effect. Coordinate with `staffswipe-visual-design`, `staffswipe-performance`, `staffswipe-accessibility`, and `staffswipe-telegram-platform`.

## Motion principles

- Direct manipulation: the card follows the finger before it follows a spring.
- Continuity: objects should appear to move between states rather than teleport when practical.
- Speed: common transitions should feel immediate and never block the next action.
- Restraint: only match and completed-shift/payment moments may be celebratory.
- Reversibility: accidental gestures should not commit before the decision threshold.
- Accessibility: every motion-dependent state needs a non-motion equivalent.

## Swipe choreography

For the primary swipe deck:

1. card tracks drag position and rotation with bounded values;
2. like/pass affordance appears progressively, not as a sudden flash;
3. crossing the decision threshold produces one light haptic cue when supported;
4. release below threshold springs back cleanly;
5. release above threshold commits once and flies out in the gesture direction;
6. the next card is already stable underneath to avoid layout flash;
7. network confirmation must not create a second visual commit;
8. failed persistence must recover predictably without duplicating a swipe.

Do not let animation state become the source of truth for business state.

## Gesture safety

- Keep an explicit button alternative for like/pass.
- Do not trigger destructive/report/block actions from ambiguous swipes.
- Avoid vertical gesture capture that fights Telegram scrolling.
- Ignore tiny accidental movement before gesture activation.
- Prevent double-submit from button plus gesture racing.

## Match moment

A match animation should be short, branded, and one-time:

- two identities/cards converge or resolve into one match state;
- use the StaffSwipe burgundy/ivory/gold semantics, not neon dating-app effects;
- primary CTA becomes chat/open match;
- celebration must not obscure names, venue, shift, or next action;
- repeated navigation to an existing match must not replay the full celebration.

## Completion/payment moment

Celebrate the product outcome, not money gambling-like behavior:

- completed shift may use a brief premium success motion;
- commission/wallet changes must remain legible and factual;
- never use slot-machine, loot-box, spinning-wheel, or variable-reward visuals;
- payment failure uses calm error feedback, not aggressive shaking loops.

## Navigation and surfaces

- sheets/dialogs: consistent entrance and exit direction;
- route transitions: subtle and secondary to content readiness;
- keyboard: do not animate inputs away from the visible viewport;
- toasts: short, non-blocking, and stable;
- skeletons: reserve final geometry to avoid content jump;
- refresh/retry: show progress without freezing navigation.

## Haptics

Haptics reinforce a visible event; they never replace it.

Use sparingly for:

- swipe threshold crossing;
- match success;
- shift confirmation;
- meaningful error/destructive confirmation when platform conventions allow.

Avoid haptic spam during continuous drag or list scrolling.

## Reduced motion

Under `prefers-reduced-motion` or the project equivalent:

- remove large travel, rotation, confetti/rain, and parallax;
- replace with opacity/state changes or instant placement;
- preserve confirmation text/icons and focus movement;
- do not make reduced motion slower than normal mode.

## Performance guardrails

- prefer transform/opacity over layout-heavy properties;
- do not animate large blur/shadow filters continuously;
- avoid per-frame React state updates when spring/gesture values can stay outside render;
- clean up listeners/springs on unmount;
- never preload heavy celebration assets on critical startup unless measured worthwhile;
- verify low-end Android behavior in Telegram before approving complex effects.

## Review checklist

- Does motion explain something the user needs to understand?
- Is there exactly one visual commit for one business action?
- Can the interaction be completed without the gesture?
- Does reduced-motion mode preserve meaning?
- Does the next card/screen remain stable with no flash or jump?
- Are haptics sparse and synchronized with visible feedback?
- Did we reuse the existing spring/gesture stack?

## Verification

Run TMA lint, typecheck, tests, and build. Add focused tests for commit thresholds, double-submit prevention, reduced-motion branches, and state recovery when motion is tied to critical interaction logic.
