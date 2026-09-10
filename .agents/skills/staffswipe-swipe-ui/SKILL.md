---
name: staffswipe-swipe-ui
description: Guidance for the two core StaffSwipe swipe feeds: seeker browsing shifts and employer browsing candidates. Use for visual redesign, card hierarchy, actions, gesture feedback, card stack, feed density, or swipe accessibility.
---

# StaffSwipe Swipe UI

## Mission

Сделать swipe-ленту сердцем StaffSwipe: быстро читаемой, визуально сильной, рабочей и доверительной — без превращения в dating-app.

## Read first

1. `/AGENTS.md`
2. `/CLAUDE.md`
3. `/DESIGN_SYSTEM.md`
4. `/docs/SWIPE_UI_V2.md`
5. Actual code in `tma/src/features/feed/`

Code + tests win over docs if they disagree.

## Do not rewrite working core behavior

`SwipeDeck.tsx` already handles:

- visible card stack;
- drag + fling;
- right = positive, left = skip;
- server rejection returns a card;
- restacking;
- haptic;
- flip/details;
- keyboard accessibility;
- one-time gesture hint;
- reduced-motion considerations.

Change it only when a task truly requires gesture mechanics.

## Main files for visual work

- `tma/src/features/feed/Cards.tsx`
- `tma/src/features/feed/FeedPage.tsx`
- `tma/src/index.css`
- `tma/src/swipe-v2.css`
- `tma/src/theme/theme.css`

## Product hierarchy

### Seeker sees a shift

Read order:

1. venue photo;
2. pay per shift;
3. venue + verification;
4. role;
5. date/time;
6. urgency/distance;
7. rating/completed shifts when available;
8. pay method / medbook / slots;
9. details;
10. positive action.

### Employer sees a candidate

Read order:

1. portrait;
2. name + age;
3. primary role;
4. rating;
5. reliability/history;
6. available today;
7. district;
8. medbook status;
9. secondary roles / experience tags;
10. details;
11. positive action.

## Action language

Seeker:
- left: `Пропустить`
- right: `Откликнуться`
- right swipe stamp: `ОТКЛИК` / existing compatible copy

Employer:
- left: `Пропустить` or `Не подходит`
- right: `Позвать`
- right swipe stamp: `ЗОВУ`

Avoid romantic copy: LIKE, LOVE, chemistry, hearts as the core semantic language.

## Visual identity

Use project tokens only.

- crimson brand: `--gold`, `--gold-fill`
- ivory: `--bg`
- card/surface tokens
- semantic gold: `--super`
- success: `--success`
- display type: `--font-display` (Prata)

Never introduce a blue/purple/neon redesign.

## One primary CTA

Favorite is already a secondary control on the shift card. Do not create three equal-weight buttons under the deck. Positive action is the one primary branded CTA; skip is secondary.

## Never invent data for visual richness

Before adding a badge, check `types/domain.ts` and the endpoint response.

Do not show as fact unless implemented:

- response time like `5 минут`;
- live online;
- exact arrival ETA;
- escrow;
- guaranteed payment;
- verified-document status beyond actual model semantics;
- paid boost / Pro subscription.

If needed, define it as a future field and list backend + migration + API + TS + mock + tests work.

## Accessibility

- touch targets >= 44px;
- visible focus;
- action label and `aria-label` mean the same thing;
- keyboard can open details and choose actions;
- large mode still fits;
- dark mode still has contrast;
- reduced motion is respected.

## Acceptance checks

After UI changes:

```bash
cd tma
npm run lint
npx tsc --noEmit
npx vitest run
npm run build
cd ..
bash scripts/e2e.sh
```

Manually inspect at least narrow/short, regular iPhone-like, dark theme, and large mode.
