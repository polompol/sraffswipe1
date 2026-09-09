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
- `staffswipe-visual-design` — brand/design-system consistency, motion, components and assets.
- `staffswipe-telegram-platform` — Telegram Mini App SDK, init data, viewport, safe areas, BackButton/MainButton, haptics, themes and deep links.
- `staffswipe-growth` — activation, referral, lifecycle, retention and experiments.
- `staffswipe-matchmaking` — feed eligibility, retrieval, ranking, cold start, diversity and recommendation quality.

## Recommended combinations

| Change | Apply at least |
| --- | --- |
| Login / Telegram identity | `staffswipe-security` + `staffswipe-telegram-platform` + `staffswipe-privacy` |
| Swipe/feed ranking | `staffswipe-matchmaking` + `staffswipe-performance` + `staffswipe-trust-safety` |
| New UI screen/card | `staffswipe-visual-design` + `staffswipe-product-ux` + `staffswipe-accessibility` + `staffswipe-telegram-platform` |
| Referral/reward | `staffswipe-growth` + `staffswipe-trust-safety` + `staffswipe-financial-integrity` |
| Reviews/reputation/no-show | `staffswipe-trust-safety` + `staffswipe-security` + `staffswipe-privacy` |
| Payment/commission | `staffswipe-financial-integrity` + `staffswipe-security` + `staffswipe-incident-response` |
| Production outage/emergency fix | `staffswipe-incident-response` + `staffswipe-observability` + `staffswipe-production` + relevant domain skill |
| DB schema change | `staffswipe-database` + `staffswipe-backend` + relevant domain skill |

## Routing rule

A feature is not complete merely because its main-domain skill passes. If it changes authentication, personal data, money, production operations, or public marketplace exposure, also apply the corresponding security/privacy/financial/trust/production reviews.

Skills are review and implementation guidance, not permission to weaken repository policies. `SECURITY.md`, `DESIGN_SYSTEM.md`, `CLAUDE.md`, the actual application code, and automated tests remain authoritative where applicable.
