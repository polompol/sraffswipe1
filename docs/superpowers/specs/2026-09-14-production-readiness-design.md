# StaffSwipe Production-Readiness Design

Date: 2026-09-14
Branch: `codex/staffswipe-production-readiness`
Base: `codex/staffswipe-financial-hardening` (`fe4be25a1721d83dd3938c00e668ef25ca8d6470`)

## Purpose

Bring the existing StaffSwipe Telegram Mini App to a release-candidate level where product behavior, money flows, messaging, safety, admin operations and UX are coherent, testable and fail-safe. Extend the current architecture instead of rewriting it.

The primary product rule is user convenience: every screen must make the next correct action obvious, preserve user progress through poor connectivity, and hide internal retry/state complexity from the user.

CI alone does not prove production readiness. Real Telegram device checks, provider test traffic and production infrastructure remain separate release gates.

## Non-goals

- no ground-up frontend/backend rewrite;
- no replacement of the approved StaffSwipe visual language;
- no production deploy or real-money operation from implementation PRs;
- no weakening of financial, authorization or audit guarantees for convenience;
- no unrelated refactors.

## Delivery model and decomposition

This document is the **master architecture**, not one giant implementation plan. The work is intentionally decomposed into independently reviewable release blocks. Each block gets its own implementation plan (and, when the block changes architecture/interfaces, its own focused spec) before code changes.

Order:

1. **Financial integration gate** — finish review/integration of PR #60.
2. **Messaging reliability and chat UX** — client outbox, drafts, reconnect/retry states, unread/read semantics and chat decomposition where needed.
3. **Shift lifecycle** — explicit server-authoritative state machine and role-specific legal actions.
4. **Swipe/feed/navigation UX** — resilient gestures, filters, navigation, reduced motion, small-screen behavior.
5. **Trust & Safety/support/admin** — contextual reporting, disputes/no-show, abuse controls, least-privilege admin and audit.
6. **Telegram WebView/accessibility/device hardening** — safe areas, keyboard, themes, background/foreground, real device matrix.
7. **Reliability/observability/backup/recovery** — health/readiness, scheduler visibility, privacy-safe telemetry and proven restore.
8. **Release-candidate audit** — full automated and external release gates.

A later block may depend on an earlier block, but must not silently weaken an earlier invariant. Integration target remains `codex/staffswipe-release-candidate`.

## Existing foundation to preserve

### Backend

- FastAPI + SQLAlchemy 2 + Pydantic v2 + Alembic.
- PostgreSQL production target; SQLite supported for dev/tests.
- Redis for shared state and cross-process chat broadcast.
- Server-side role/participant checks remain authoritative.
- Chat already supports `client_message_id`, duplicate suppression, stable history pagination, Redis broadcast and periodic WebSocket access revalidation.
- Financial hardening adds provider verification, exactly-once wallet credit, provider-linked refunds, refund reservation/reconciliation and account-deletion financial guards.

### Telegram Mini App

- React 18 + TypeScript + Vite.
- `@tma.js/sdk-react` v3, TanStack Query, Zustand, HashRouter.
- Existing feature areas: auth/onboarding, feed, matches, chat, profile, vacancy, invitations, support, analytics and admin.
- Existing approved color and interaction system is retained.

## Product UX principles

1. **One obvious primary action.** Secondary actions are visually subordinate.
2. **Never lose work.** Drafts/forms/outbound messages survive temporary disconnects/backgrounding where practical.
3. **Immediate feedback.** Pending/success/error is visible for every meaningful action.
4. **No hidden dead ends.** Empty/error states explain what happened and what to do next.
5. **Retry without duplication.** Retries cannot duplicate messages, matches, payments, refunds, commissions or transitions.
6. **Mobile-first ergonomics.** Safe areas, keyboard avoidance, touch targets, Telegram BackButton/MainButton and restrained haptics are deliberate.
7. **Consistent language.** Short, warm, concrete Russian UI copy with recovery-oriented errors.
8. **Accessibility by default.** Reduced motion, sufficient contrast, semantic labels and correct focus behavior are Definition-of-Done requirements.

## Block 1 — Financial integration gate

PR #60 remains the source of truth for financial hardening. Before integration:

- review exactly-once top-up semantics;
- review concurrent refund reservation/reconciliation;
- confirm Alembic single-head and migration upgrade/downgrade behavior;
- verify SQLite/FastAPI, PostgreSQL, E2E and Security on integration head;
- resolve all Critical/Important review findings;
- keep the PR draft until review is complete.

No later block may bypass the hardened financial paths.

## Block 2 — Messaging reliability and chat UX

Detailed design is maintained in the focused chat spec for this block.

Required product guarantees:

- REST/WS retries reuse the same logical receipt;
- retry never creates a second message or notification;
- revoked access closes or blocks active sockets;
- reconnect cannot expose a revoked chat;
- history pagination remains stable;
- Redis failure degrades safely;
- client outbox preserves pending/error messages and uses the same id on retry;
- drafts persist per match and clear only after confirmed send;
- optimistic and server messages deduplicate by server id/client id;
- UI handles initial loading, older-history loading, empty, connected, reconnecting, offline, pending, failed/retry, revoked, rate-limited and unavailable states.

If `ChatPage.tsx` remains oversized, split by behavior, not cosmetic layers: message list, composer/draft, connection state and outbox hook.

## Block 3 — Shift lifecycle state machine

Treat the full flow as one domain state machine:

`onboarding → discover → interest → match → negotiation/chat → confirmed shift → arrival/evidence → in-progress/completion → confirmation/dispute/no-show → settlement/commission → rating/closed`.

Backend is authoritative for legal actions. For every state and role it exposes/derives allowed actions; the client never relies only on local guesses.

Transition endpoints must be authenticated, participant/role checked, idempotent where repeat is plausible, transactional for state plus financial effects, and auditable for dispute-sensitive actions.

UX for both roles always shows current status, one primary next action, what the other side is waiting for when relevant, deadlines/consequences, and a clear problem-reporting path. Feed, match detail and chat must not expose contradictory actions.

## Block 4 — Swipe, feed and navigation

### Swipe integrity

- one gesture produces at most one server decision;
- stale async replies never mutate a newer deck generation;
- retry returns a card only when the server did not record the decision;
- irreversible actions are never silently replayed;
- reduced-motion replaces large physics with short transitions;
- next-card loading cannot move controls into an accidental tap.

### Feed UX

- filters retain intentional choices;
- role/filter changes invalidate only relevant data;
- empty states distinguish no-results, narrow-filters, offline and incomplete-profile cases;
- shift terms, photo/gallery and trust signals are visible without excessive navigation;
- primary swipe controls remain reachable on short screens.

### Navigation

- stable top-level bottom navigation;
- Telegram BackButton maps to meaningful in-app history;
- returning from detail restores prior list/deck context;
- keyboard/safe-area never covers primary controls.

## Block 5 — Trust & Safety, support and admin

### Reporting and disputes

Reports originate from the relevant chat/match/completed shift and include platform-known context automatically. User does not retype internal IDs.

Operational report states: submitted, under review, action taken, closed/rejected, with a user-visible explanation where policy allows.

No-show/disputes use platform evidence (match, confirmations, timestamps, arrival evidence, role actions, relevant messages) plus user statements. Arrival code remains evidence, not a standalone financial trigger.

### Abuse controls

Maintain/add server-side controls for spam/swipe abuse, blocked accounts, fake venue reports, reliable multi-account signals, rating manipulation and admin escalation attempts. Do not introduce invasive data collection without a clear enforcement need.

### Admin

- server-side authorization only;
- least privilege;
- immutable/auditable security- and money-sensitive operations;
- reason required for destructive/account/financial moderation actions;
- internal balance correction remains clearly distinct from provider refund;
- support cases link only relevant records and do not reveal unrelated personal data.

## Block 6 — Telegram WebView, accessibility and mobile resilience

Harden and verify:

- Telegram light/dark theme;
- safe-area top/bottom;
- virtual keyboard open/close;
- app background/foreground;
- network loss/recovery;
- Telegram BackButton/MainButton;
- restrained confidence-building haptics;
- small/large iPhone sizes and representative Android sizes;
- dynamic viewport changes;
- reduced motion;
- screen-reader labels and important status announcements.

Automated browser coverage is required but never substitutes for real-device smoke tests.

## Block 7 — Reliability, observability and operations

### Observability

Privacy-safe structured telemetry for authentication failures, payment/refund/reconciliation outcomes, message send/retry failures, WebSocket reconnects, state-transition failures, scheduler failures and high-severity moderation/admin actions.

Never log secrets, payment credentials, Telegram auth payloads or unnecessary personal data.

### Health/readiness

Distinguish process liveness from readiness. Readiness must surface database reachability, required Redis reachability, migration currency, scheduler health and required provider configuration.

### Backup/recovery

Document and automate a reproducible PostgreSQL backup/restore exercise. A backup that has never been restored does not satisfy the release gate.

## Block 8 — Release-candidate verification

### Automated gates

Backend:
- Ruff;
- full FastAPI/SQLite;
- full PostgreSQL;
- Alembic one-head and migration smoke.

Frontend/TMA:
- ESLint;
- TypeScript no-emit;
- unit/component tests;
- production build.

E2E:
- worker onboarding → swipe → match → chat → shift completion;
- employer onboarding → publish → match → chat → shift completion;
- retries/offline for chat and state-changing actions;
- dispute/no-show/report;
- critical admin flows.

Security:
- gitleaks;
- dependency audits;
- CodeQL Python and JavaScript/TypeScript;
- critical-findings gate;
- targeted authorization tests around admin, chat, finance and lifecycle transitions.

### External release gates

Repository CI cannot prove:

- Telegram bot/Mini App production settings;
- real iOS/Android Telegram WebView smoke tests;
- YooKassa test-environment payment webhook/refund smoke tests;
- domain/HTTPS/certificate production configuration;
- production backup destination plus successful restore;
- owner/admin recovery access and credential custody.

If an external gate is unknown, status is **code-complete, release blocked**, not “100% production”.

## Testing strategy

Use TDD for every bugfix/new transition:

1. add a failing regression test that proves the missing guarantee;
2. implement the smallest correct change;
3. run the affected slice;
4. run the full subsystem suite;
5. run complete release gates before integration.

Concurrency-sensitive money, messaging and lifecycle actions require PostgreSQL coverage in addition to SQLite.

## Security invariants

- never trust client-only role/ownership checks;
- never use unsafe read-modify-write for balances/critical counters;
- never duplicate provider refunds or wallet credits on retry;
- never erase financial obligations/history through account deletion;
- never broadcast chat content after access is revoked;
- never let scheduler failure silently bypass settlement/business rules;
- never expose sensitive personal data in public feeds/logs.

## Data migration rules

- every persistent model change gets an Alembic migration;
- migration chain remains one head unless a documented merge revision is intentional;
- backfills are bounded and resumable;
- constraints account for existing data before enforcement;
- safe downgrades are implemented; irreversible migrations require explicit release approval and documentation.

## Definition of Done per block

A block is complete only when:

- happy path works;
- loading/empty/error/retry/disabled/success states are covered where relevant;
- server authorization/trust boundaries are tested;
- retries are idempotent where appropriate;
- accessibility/mobile layout is verified;
- telemetry leaks no secrets/unnecessary personal data;
- relevant SQLite/PostgreSQL/frontend/E2E suites pass;
- Security passes;
- docs and Project Brain are updated;
- no unresolved Critical/Important review findings remain.

## Production status vocabulary

- **Implementation in progress** — repository work is still changing.
- **Code-complete** — planned repository work and automated gates pass.
- **Release blocked** — code-complete but an external gate is unknown/failed.
- **Pilot-ready** — code-complete and all pilot external gates pass.
- **Production-ready** — pilot evidence, monitoring, backup/recovery and production configuration are verified.

Never call StaffSwipe “100% production-ready” while a required external gate is unknown.