---
name: staffswipe-card-system
description: Card architecture for StaffSwipe1. Use for worker, venue, shift, match, saved, and swipe cards; information hierarchy; card actions; badges; tags; trust signals; and role-specific card variants.
---

# StaffSwipe1 card system

Cards are the core product surface. A user should understand the opportunity or person within seconds, then know exactly what to do next.

Coordinate with `staffswipe-visual-design`, `staffswipe-product-ux`, `staffswipe-trust-safety`, `staffswipe-privacy`, `staffswipe-matchmaking`, and `staffswipe-accessibility`.

## Card families

Maintain distinct but related families:

- shift card shown to workers;
- candidate card shown to venues;
- match summary card;
- saved/favorite compact card;
- upcoming/completed shift card;
- administrative moderation card only where needed.

Do not force every use case into one giant universal card with dozens of conditional branches.

## Shift card hierarchy

First glance:

1. role;
2. pay or expected shift earnings;
3. date and time;
4. venue identity;
5. visual/photo context.

Second glance:

- distance/area;
- duration;
- key requirements;
- verified/trust state;
- critical benefits such as meal/taxi/uniform/payment timing.

Details screen/sheet:

- full description;
- address detail where privacy/product rules permit;
- cancellation terms;
- venue history/reviews;
- requirements and documents;
- dispute/shift rules.

## Candidate card hierarchy

First glance:

1. first name/display identity permitted by privacy rules;
2. target role;
3. relevant experience;
4. availability/distance context;
5. photo where allowed and present.

Second glance:

- completed shifts;
- reliability/trust indicators;
- verified attributes;
- relevant skills;
- rate expectation if part of the flow.

Never surface phone, INN, precise private location, hidden moderation data, raw risk score, or internal enforcement reason on a marketplace card.

## Trust presentation

Trust information must be factual and explainable.

Prefer human-readable evidence such as:

- `18 смен`;
- `0 невыходов`;
- `Подтверждённое заведение`;
- `Обычно отвечает быстро` only if the metric is actually supported.

Do not invent pseudo-precision or expose internal fraud scores. Coordinate negative labels with `staffswipe-trust-safety` to avoid unfair permanent stigma.

## Tags and badges

- tags describe attributes; buttons perform actions;
- verification badges must have one stable meaning;
- keep the visible tag count small and prioritize high-information tags;
- collapse secondary attributes into details rather than wrapping five rows;
- do not use emoji as the only semantic icon system;
- never create a gold/verified badge that visually implies a government credential unless it truly is one.

## Action model

Swipe cards:

- like/pass remain the dominant decision actions;
- explicit buttons mirror gesture actions;
- report/block live behind a clear secondary menu, not beside like/pass;
- details are discoverable without accidentally committing a swipe.

Non-swipe cards:

- one primary action;
- secondary actions have lower weight;
- status replaces action when the workflow is already complete.

## Layout resilience

Cards must survive:

- long Russian venue names;
- long role labels;
- 4-5 digit and larger pay values;
- missing photos;
- missing optional tags;
- large-text mode;
- narrow Telegram viewport;
- dark mode;
- loading and stale states.

Use line clamping only when the full value is available in details or an accessible label. Never truncate pay, critical time, or safety-relevant state.

## Photo composition

- photo supports identity/context; it must not bury pay/time/role;
- maintain a stable aspect ratio per card family;
- define fallback when no image exists;
- use overlays only when text contrast is guaranteed in both themes;
- avoid stacking multiple translucent gradients and decorative filters.

## Ranking independence

Card appearance must not secretly encode recommendation score in a way that manipulates the user. Matchmaking may determine ordering; card design should present comparable information consistently across items.

## Review checklist

- Can the user answer “what, when, where, how much, how trustworthy?” quickly?
- Is the primary action unambiguous?
- Are trust signals factual and privacy-safe?
- Is optional metadata moved out of the first-glance layer?
- Does the card remain coherent with no photo and with long text?
- Are worker and venue variants optimized for their actual decisions?
- Does the card look like StaffSwipe rather than Tinder with restaurant labels pasted on?

## Verification

Review representative fixtures for worker and venue roles, long content, no-photo content, verified/unverified states, dark mode, large text, reduced motion, and narrow viewport. Run the normal TMA checks before approval.
