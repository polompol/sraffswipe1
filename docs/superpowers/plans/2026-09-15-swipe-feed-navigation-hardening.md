# Swipe / Feed / Navigation Hardening Plan

Goal: close the remaining swipe/feed/navigation reliability gaps without redesigning the current feed.

Architecture: keep SwipeDeck, React Router, Telegram back-stack, existing server swipe idempotency, and responsive CSS. Add Telegram BackButton ownership while a card is flipped, add request-level single-flight deduplication for identical swipe requests, and extend layout regression coverage. No business-rule changes.

Constraints:
- Work only on codex/staffswipe-production-readiness.
- Do not merge PR #62 in this stage.
- Failed swipes must restore the card.
- Gesture and action buttons continue through the same SwipeDeck -> onSwipe -> sendSwipe path.
- Telegram BackButton closes transient UI before leaving the screen.
- Preserve the current visual design.
- Finish with TMA, Backend/PostgreSQL, E2E, and Security checks on one exact SHA.

## Task 1 — BackButton for flipped cards
Files: tma/src/features/feed/SwipeDeck.tsx and new SwipeDeckBackButton.test.tsx.
Test first: flip a card, assert one Telegram BackButton handler is registered, invoke it, assert card returns to front, assert cleanup unregisters the handler.
Implementation: while flipped is non-null, register showBackButton(() => setFlipped(null)); clean up on unflip/unmount.

## Task 2 — Single-flight identical swipes
Files: new tma/src/lib/singleFlight.ts, new singleFlight.test.ts, modify tma/src/api/endpoints.ts.
Test first: concurrent calls with the same key share one underlying call; different keys run independently; rejection clears the key so retry runs again.
Implementation: singleFlightByKey(fn, keyOf) backed by a private Map. Wrap only the backend sendSwipe path. Key includes targetId, targetType, direction, and vacancyId.

## Task 3 — Extreme layout regression
File: e2e/tests/layout.spec.ts.
Add large-text feed coverage at 320x568 and 430x932 using existing geometry assertions. No CSS change unless the regression test proves a defect.

## Task 4 — Full verification
Run TMA, Backend SQLite/PostgreSQL, E2E, and Security on one exact head SHA. PR #62 remains Draft; Trust & Safety/support/admin is the next stage.
