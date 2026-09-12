---
name: staffswipe-growth
description: Product growth, activation, retention, referral, lifecycle, funnel, experiment, and marketplace growth review for StaffSwipe1. Use for onboarding, referrals, saved searches, notifications, activation, repeat usage, retention, monetization-adjacent growth, lifecycle messaging, or analytics changes.
---

# StaffSwipe1 growth

Grow successful completed shifts, not vanity activity. Optimize the marketplace loop:

`signup -> role/profile ready -> first meaningful browse/swipe -> match -> chat -> confirmed shift -> completed shift -> review/repeat/referral`

Treat workers and venues as distinct funnels with different activation events and constraints.

## North-star and guardrails

Primary outcome candidates should be grounded in real marketplace value, such as:

- completed shifts;
- repeat completed shifts;
- time to successful fill;
- percentage of posted shifts filled;
- percentage of active workers completing a shift.

Do not optimize raw swipes, notifications sent, screen time, or registrations if they do not improve successful shifts.

Guardrails must include:

- no-show rate;
- cancellation rate;
- dispute/report rate;
- notification opt-out/mute rate where measurable;
- support burden;
- fraud/referral abuse;
- payment/commission integrity;
- performance and crash regressions.

## Funnel instrumentation

Every important funnel event should be consistently named and server-trustworthy where possible. Prefer events for:

- onboarding started/completed;
- role selected;
- profile readiness achieved;
- venue verification started/completed;
- shift created/published;
- feed viewed;
- filter applied;
- first swipe/like/pass;
- match created;
- chat opened/first message;
- shift confirmation by each side;
- shift completed/closed;
- dispute opened/resolved;
- review submitted;
- repeat invite/rebook;
- referral shared/accepted/activated;
- saved-search alert opened and converted.

Never log raw secrets, tokens, chat content, phone, INN, or unnecessary precise personal data in analytics.

## Activation definitions

Worker activation should be more meaningful than registration. Prefer a state such as:

- profile sufficiently complete;
- at least one relevant feed interaction;
- first match or confirmed shift depending on the analysis horizon.

Venue activation should consider:

- venue profile created;
- first valid shift published;
- first qualified worker interaction/match;
- first confirmed or completed shift.

Keep leading and lagging activation metrics separate.

## Referral system

Referrals must reward genuine marketplace value rather than account creation.

- Attribute referral server-side.
- Prevent self-referral and obvious circular abuse.
- Avoid paying/rewarding until a meaningful qualification event occurs, such as first completed eligible shift.
- Keep worker-to-worker, venue-to-venue, and cross-side referrals distinct if economics differ.
- Record attribution source, inviter, invitee, qualification event, reward state, and reversals.
- Coordinate abuse prevention with `staffswipe-trust-safety` and money movement with `staffswipe-financial-integrity`.

## Lifecycle messaging

Use Telegram notifications only when they help complete a user goal.

Good examples:

- saved search has a strong new match;
- upcoming confirmed shift reminder;
- venue still needs a worker before a near-term shift;
- chat/match needs a response;
- post-shift completion/review flow;
- user has a clear incomplete onboarding step.

Avoid generic daily engagement spam. Respect mute/preferences and do not send repeated reminders when the state has already changed.

## Marketplace liquidity

When supply/demand is imbalanced, prefer interventions that improve the weak side:

- worker scarcity: target relevant saved-search alerts, repeat-worker invites, availability capture;
- venue scarcity: reduce publishing friction, reactivation for prior venues, clear value messaging;
- poor match quality: improve ranking/filters before increasing notification volume;
- too many unfilled shifts: expose urgency honestly, never fake scarcity or popularity.

Coordinate recommendation logic with `staffswipe-matchmaking`.

## Experiment rules

For any growth experiment:

1. State hypothesis and target segment.
2. Define primary metric and guardrails before implementation.
3. Prefer user-level stable assignment.
4. Do not contaminate financial, legal, security, or safety behavior for experiment convenience.
5. Avoid simultaneous overlapping experiments on the same critical surface unless interaction is understood.
6. Record experiment id/variant in analytics without leaking it into user-visible state unnecessarily.
7. Set a stopping/review criterion.
8. Interpret novelty effects and small samples cautiously.

## Monetization boundary

Current StaffSwipe value proposition charges for successful outcomes. Growth work must not silently introduce dark patterns, fake ranking boosts, or pay-to-win feed placement unless product strategy explicitly changes and is documented.

When proposing monetization changes, analyze:

- effect on fill rate;
- worker trust;
- venue CAC/LTV;
- fraud incentives;
- marketplace fairness;
- support complexity;
- legal/accounting implications.

## Repeat loop

After a successful shift, make the next valuable action easy:

- review/reliability feedback;
- save/favorite the counterparty when allowed;
- invite the same worker again;
- clone/repeat a similar shift;
- capture worker availability;
- recommend the next relevant shift.

Do not force all actions into one blocking screen.

## Growth review checklist

- What exact marketplace outcome improves?
- Which side of the marketplace is constrained?
- What is the activation event for this segment?
- Could this increase low-quality matches, no-shows, or spam?
- Is attribution server-side enough to resist simple abuse?
- Are notification frequency and eligibility state-aware?
- Are experiments measurable and reversible?
- Does the feature improve repeat completed shifts, not just clicks?

## Verification

Add analytics/funnel tests where practical, verify event privacy, and run relevant backend/TMA/E2E checks. Apply `staffswipe-privacy`, `staffswipe-trust-safety`, and `staffswipe-matchmaking` for overlapping changes.
