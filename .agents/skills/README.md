# StaffSwipe agent skills

Project-specific skills live under `.agents/skills/*/SKILL.md`. Agents should apply the narrowest relevant skill and combine overlapping reviews when a change crosses boundaries.

## Core engineering

- `staffswipe-backend` — FastAPI/backend conventions.
- `staffswipe-database` — schema, migrations, query integrity.
- `staffswipe-api-contract` — API compatibility and client/server contracts.
- `staffswipe-e2e-qa` — end-to-end behavior and regression coverage.
- `staffswipe-ci-release` — CI and release safety.
- `staffswipe-production` — production deployment/operations.
- `staffswipe-performance` — startup/runtime/query performance.
- `staffswipe-observability` — logs, Sentry, metrics, diagnosis.

## Safety, privacy, money

- `staffswipe-security` — auth, authorization, secrets, payments, endpoint security.
- `staffswipe-privacy` — personal-data minimization and disclosure review.
- `staffswipe-financial-integrity` — wallet, commissions, refunds, YooKassa integrity.
- `staffswipe-trust-safety` — fraud, no-show, reports, fake venues, multi-accounting, reputation, enforcement and appeals.
- `staffswipe-incident-response` — leaks, attacks, DB/Redis/provider outages, payment incidents, rollback and recovery.

## Product and experience

- `staffswipe-product-ux` — product UX flows and interaction clarity.
- `staffswipe-accessibility` — accessible interaction and readability.
- `staffswipe-visual-design` — top-level brand/design-system guardrail, components, themes and visual consistency.
- `staffswipe-art-direction` — photography, illustration, iconography, badges, empty states and visual identity.
- `staffswipe-card-system` — worker/venue/shift card architecture, hierarchy, trust signals, tags and actions.
- `staffswipe-motion-design` — swipe physics, transitions, match/success moments, haptics and reduced motion.
- `staffswipe-visual-qa` — rendered-state QA across themes, viewports, long content, loading/error and gestures.
- `staffswipe-design-reviewer` — final PASS / NEEDS FIX / BRAND DRIFT gate before substantial UI merges.
- `staffswipe-telegram-platform` — Telegram Mini App SDK, init data, viewport, safe areas, BackButton/MainButton, haptics, themes and deep links.
- `staffswipe-growth` — activation, referral, lifecycle, retention and experiments.
- `staffswipe-matchmaking` — feed eligibility, retrieval, ranking, cold start, diversity and recommendation quality.

## Recommended combinations

| Change | Apply at least |
| --- | --- |
| Login / Telegram identity | `staffswipe-security` + `staffswipe-telegram-platform` + `staffswipe-privacy` |
| Swipe/feed ranking | `staffswipe-matchmaking` + `staffswipe-performance` + `staffswipe-trust-safety` |
| New general UI screen | `staffswipe-visual-design` + `staffswipe-product-ux` + `staffswipe-accessibility` + `staffswipe-telegram-platform` + `staffswipe-visual-qa` |
| New swipe/shift/candidate card | `staffswipe-card-system` + `staffswipe-visual-design` + `staffswipe-product-ux` + `staffswipe-trust-safety` + `staffswipe-privacy` + `staffswipe-visual-qa` |
| Swipe/match/transition animation | `staffswipe-motion-design` + `staffswipe-visual-design` + `staffswipe-accessibility` + `staffswipe-performance` + `staffswipe-telegram-platform` |
| Photography / illustrations / badges / empty states | `staffswipe-art-direction` + `staffswipe-visual-design` + `staffswipe-performance` + `staffswipe-accessibility` + relevant safety/privacy skill |
| Substantial UI PR before merge | `staffswipe-visual-qa` + `staffswipe-design-reviewer` + relevant UI/domain skills |
| Referral/reward | `staffswipe-growth` + `staffswipe-trust-safety` + `staffswipe-financial-integrity` |
| Reviews/reputation/no-show | `staffswipe-trust-safety` + `staffswipe-security` + `staffswipe-privacy` |
| Payment/commission | `staffswipe-financial-integrity` + `staffswipe-security` + `staffswipe-incident-response` |
| Production outage/emergency fix | `staffswipe-incident-response` + `staffswipe-observability` + `staffswipe-production` + relevant domain skill |
| DB schema change | `staffswipe-database` + `staffswipe-backend` + relevant domain skill |

## Visual review pipeline

For substantial UI work, prefer this sequence rather than letting one agent improvise everything:

1. `staffswipe-product-ux` defines the user task and action hierarchy.
2. `staffswipe-visual-design` enforces the design system and StaffSwipe brand contract.
3. `staffswipe-card-system` or `staffswipe-art-direction` applies when the change touches core cards or assets.
4. `staffswipe-motion-design` defines gesture/transition behavior when motion is involved.
5. `staffswipe-accessibility`, `staffswipe-performance`, and `staffswipe-telegram-platform` validate platform constraints.
6. `staffswipe-visual-qa` checks rendered edge states.
7. `staffswipe-design-reviewer` gives the final `PASS`, `NEEDS FIX`, or `BRAND DRIFT` verdict.

## Routing rule

A feature is not complete merely because its main-domain skill passes. If it changes authentication, personal data, money, production operations, public marketplace exposure, or user trust signals, also apply the corresponding security/privacy/financial/trust/production reviews.

Visual polish never overrides safety, privacy, accessibility, or financial correctness. Skills are review and implementation guidance, not permission to weaken repository policies. `SECURITY.md`, `DESIGN_SYSTEM.md`, `CLAUDE.md`, the actual application code, and automated tests remain authoritative where applicable.
