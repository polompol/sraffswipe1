# GPT-6 Astra — start here for StaffSwipe

Read in this order before changing code:

1. `AGENTS.md` — project invariants, architecture and AI rules.
2. `CLAUDE.md` — domain rules that must not be broken.
3. `docs/UX_BLUEPRINT_V3_150.md` — canonical 150-screen UX/state registry mirrored from Canva.
4. `docs/SWIPE_UI_V2.md` — detailed swipe interaction rules.
5. `DESIGN_SYSTEM.md`, then `tma/src/theme/theme.css` and `tma/src/index.css` — visual tokens/components.
6. `tma/src/App.tsx` — real routes and role-specific navigation.
7. `tma/src/api/endpoints.ts` and `tma/src/types/domain.ts` — actual client API/data contract.

## Implementation rule

Resolve the target `S-ID` in `docs/UX_BLUEPRINT_V3_150.md`, then map it to the existing route/component/API/state before writing code. Do not invent a new backend field because it appears visually useful in a mockup.

## UX ergonomics V3

- reference frame: 390×844;
- touch target: at least 52 px;
- primary bottom CTA: 60–64 px;
- bottom navigation: 68–72 px;
- one filled primary CTA per screen;
- destructive actions require confirmation;
- swipe cards keep the existing SwipeDeck rollback/accessibility/haptic/reduced-motion behaviour.

## Role navigation

Worker: `Лента / Мои смены / Профиль`.
Employer: `Лента / Люди / Смены / Профиль`.

## Money and safety

- StaffSwipe commission is currently 10% only after a completed/closed shift.
- Check-in code is evidence, not a payment trigger.
- Explicit `not-held` is the path for a shift that did not happen.
- Verification badge is operator-controlled.
- Do not store document/medical-book photos; store statuses.
- Do not expose sensitive profile data in public feed cards.

## Definition of done

Do not claim implementation is complete until relevant lint, TypeScript, unit/build checks and E2E for changed flows are green.
