# StaffSwipe — GPT-6 Astra implementation handoff V3

This is the implementation handoff for the StaffSwipe Telegram Mini App. Do not implement from screenshots alone. Use this file together with `AGENTS.md`, `docs/UX_BLUEPRINT_V3_150.md`, `docs/SWIPE_UI_V2.md`, the Canva V3 design, and `StaffSwipe_GPT6_ASTRA_SCREEN_MANIFEST_V3.json`.

## Source-of-truth order
1. Working code + tests.
2. `AGENTS.md` domain invariants.
3. API/types (`tma/src/api/endpoints.ts`, `tma/src/types/domain.ts`).
4. UX screen contract (`docs/UX_BLUEPRINT_V3_150.md`).
5. Visual geometry from the V3 HTML/Canva design.

## Fixed mobile frame
- Canvas: 390×844 px.
- Page padding: 16 px left/right, 18 px top, 16 px bottom.
- Status bar: 24 px.
- App top bar: 42 px.
- Minimum interactive touch target: 52×52 px.
- Standard primary CTA: 62 px high, 16 px radius, horizontal padding 18 px.
- Swipe primary CTA: 64 px high, 20 px radius.
- Swipe secondary round actions: 62×62 px.
- Bottom navigation: 70 px high; left/right 10 px; bottom 8 px; radius 22 px.
- Sticky CTA without tab bar: bottom 18 px.
- Sticky CTA above tab bar: bottom 88 px.
- Swipe action dock: 76 px high, left/right 16 px, bottom 88 px.
- Form input: 50 px high, radius 14 px.
- Standard list row: min 52 px high.
- Chip: 30 px high. Badge: 27 px high.
- Chat composer: 58 px high, bottom 16 px; send button 58×58 px.
- Bottom sheet: top radius 28 px; side padding 16 px; bottom padding 24 px.

## Interaction placement rules
- The main next-step CTA stays in the bottom thumb zone.
- Never place a critical CTA below/behind the tab bar or Telegram safe area.
- One filled primary CTA per screen. Secondary actions are outlined/ghost unless swipe screen.
- Swipe: left action = skip; right action = positive. Show next-card peek. Card must return on API failure.
- Destructive actions (cancel shift, not held, delete vacancy, block/report where relevant) require a confirmation sheet.
- Success screens explain what happened and the next action; celebration is short (<800ms) and reduced-motion safe.

## Navigation contract
Worker (`seeker`): `/feed` Лента → `/matches` Мои смены → `/profile` Профиль.
Employer: `/feed` Лента → `/matches` Люди → `/vacancy/my` Смены → `/profile` Профиль.
Do not add a fourth worker tab just because a mockup looks balanced.

## Data contract
Use only fields actually present in `Vacancy`, `Seeker`, `MatchModel`, `Message`, `Me`, etc. A design label is not an API field. If a new visual needs new data, update backend schema/model/endpoint + TS type + mock + migration if needed + tests.

## Money and protected-shift guardrails
- Current service monetization: 10% commission on a closed shift.
- Check-in code is evidence, not the money trigger.
- Silence after an agreed shift does not let the employer avoid commission; `not-held` is the explicit exception flow.
- Actual hours can be changed by employer and disputed by worker.
- Balance mutations must stay atomic/idempotent according to backend rules.

## How to implement a screen
For every S-ID: read its role, route, component, state, API, entry, CTA, exit, guardrail from the screen manifest. Then inspect the matching Canva/HTML page. Reuse existing components before creating new ones. After implementation run frontend checks and E2E for changed user flows.

## Definition of done per screen
- Correct role and route.
- Correct empty/loading/error states.
- Exact bottom-action geometry and safe-area behavior.
- All touch targets >=52 px.
- Keyboard/reduced-motion accessibility where applicable.
- No invented fields.
- API failure state handled.
- Navigation and back behavior correct.
- Responsive to Telegram viewport/keyboard.
- Tests updated where DOM or behavior changed.
