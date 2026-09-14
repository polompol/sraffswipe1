# StaffSwipe Production-Readiness Design

Date: 2026-09-14
Branch: `codex/staffswipe-production-readiness`
Base: `codex/staffswipe-financial-hardening` (`fe4be25a1721d83dd3938c00e668ef25ca8d6470`)

## Purpose

Bring the existing StaffSwipe Telegram Mini App to a release-candidate level where product behavior, money flows, messaging, safety, admin operations and UX are coherent, testable and fail-safe. The work extends the current architecture instead of rewriting the product.

The primary product rule is user convenience: each screen must make the next correct action obvious, minimize cognitive load, preserve progress through poor connectivity, and never require users to understand internal states or retry semantics.

This design does not claim that CI alone proves production readiness. Real Telegram device checks, provider test traffic and production infrastructure remain separate release gates.

## Non-goals

- No ground-up frontend or backend rewrite.
- No new visual language that replaces the approved StaffSwipe design system.
- No production deployment or real-money operation as part of implementation PRs.
- No weakening of financial, authorization or audit guarantees for UX convenience.
- No unrelated refactors outside touched release-critical flows.

## Integration strategy

Use one release-candidate line with vertically scoped hardening branches. Every subsystem is implemented and verified independently, then integrated into `codex/staffswipe-release-candidate` only after review and green CI.

Order:
1. integrate financial hardening;
2. messaging reliability and chat UX;
3. end-to-end shift state machine and action authorization;
4. swipe/feed UX and resilient navigation;
5. Trust & Safety plus support/admin operations;
6. accessibility, Telegram WebView and device-behavior hardening;
7. observability, backup/recovery and release gate automation;
8. full release-candidate audit.

A later stage may depend on an earlier stage, but no stage may silently weaken an earlier invariant.

## Existing foundation to preserve

### Backend

- FastAPI + SQLAlchemy 2 + Pydantic v2 + Alembic.
- PostgreSQL production target; SQLite remains supported for development/tests.
- Redis is used for shared state and cross-process chat broadcast.
- Existing server-side role and participant checks remain authoritative.
- Existing chat server already supports message `client_message_id`, duplicate suppression, history pagination, Redis broadcast and periodic WebSocket access revalidation.
- Financial hardening branch adds provider verification, exactly-once wallet credit, provider-linked refunds, refund reservation/reconciliation and financial account-deletion guards.

### Telegram Mini App

- React 18 + TypeScript + Vite.
- `@tma.js/sdk-react` v3, TanStack Query, Zustand, HashRouter.
- Existing feature areas include auth/onboarding, feed, matches, chat, profile, vacancy, invitations, support, analytics and admin.
- Approved color and interaction system is retained.

## Product UX principles

1. **One obvious primary action.** Each state exposes the one action that most users should take next; secondary actions are visually subordinate.
2. **Never lose work.** Drafts, unfinished forms and outbound chat messages survive temporary disconnects and app backgrounding where practical.
3. **Immediate feedback.** Every user action has a visible pending/success/error state; destructive actions require explicit confirmation.
4. **No hidden dead ends.** Empty states explain why there is nothing to show and what the user can do next.
5. **Retry without duplication.** Network retries must not create duplicate messages, matches, payments, refunds, commissions or shift transitions.
6. **Mobile-first ergonomics.** Touch targets, safe areas, keyboard avoidance, Telegram BackButton/MainButton and haptics are handled deliberately.
7. **Consistent language.** UI wording is short, warm, concrete and role-aware; error messages explain recovery, not internal implementation.
8. **Accessibility by default.** Reduced motion, sufficient contrast, semantic labels and keyboard/focus behavior are part of Definition of Done.

## Stage 1 — Financial integration gate

PR #60 remains the source of truth for money hardening. Before integration:

- review exactly-once top-up semantics;
- review refund reservation and concurrent reconciliation behavior;
- confirm Alembic migration has one head and clean upgrade/downgrade behavior;
- verify PostgreSQL, SQLite, E2E and Security again on the integration head;
- keep PR draft until review findings are resolved.

After integration, no subsequent stage may bypass the hardened financial paths.

## Stage 2 — Messaging reliability and chat UX

### Server behavior

Preserve the existing server `client_message_id` idempotency contract and access revalidation. Extend only where evidence shows gaps.

Required guarantees:
- REST and WebSocket send use the same logical receipt identity;
- retrying the same client message never creates a second message or second notification;
- reconnect cannot expose a revoked chat;
- history pagination is stable and cannot loop or skip due to timestamp ties;
- cross-process delivery through Redis degrades safely when Redis is unavailable;
- unread/read state, if persisted, is server-authoritative and participant-scoped.

### Client outbox

Introduce a small outbox abstraction owned by the chat feature:
- generate a UUID before first send;
- render the message optimistically with `pending` state;
- send using the same id through WS or REST fallback;
- on success, replace optimistic metadata with server message data;
- on timeout/network failure, keep the item as retryable `error` instead of deleting it;
- explicit retry reuses the same id;
- reconnect flushes only unsent/failed entries that remain valid for the current match;
- client deduplicates incoming server messages by server id and client id.

### Drafts

Persist draft text per match locally. Draft is cleared only after confirmed successful send. Switching chats or closing/reopening the Mini App must not silently erase unfinished text.

### UI decomposition

If `ChatPage.tsx` remains too large during implementation, split by behavior rather than styling:
- `MessageList` / pagination;
- `MessageComposer` / draft and send state;
- `ChatConnectionState` / offline/reconnecting banner;
- `useChatOutbox` / delivery state machine;
- existing `useChatSocket` and `useChatHistory` remain focused hooks.

No visual redesign is required merely to achieve smaller files.

### Chat user states

The chat surface must explicitly handle:
- initial loading;
- loading older history;
- empty new chat;
- connected;
- reconnecting;
- offline;
- message pending;
- message failed with retry;
- access revoked / shift no longer accessible;
- rate limited;
- server unavailable.

## Stage 3 — Shift lifecycle as an explicit state machine

The full worker/employer flow is treated as one domain state machine:

`onboarding → discover → interest → match → negotiation/chat → confirmed shift → arrival/evidence → in-progress/completion → confirmation/dispute/no-show → settlement/commission → rating/closed`.

### Server authority

For every state, backend exposes which actions are legal for each role. The client does not infer permissions solely from local UI state.

All transition endpoints must be:
- authenticated;
- role/participant checked;
- idempotent where a repeat request is plausible;
- transactional for state plus financial side effects;
- auditable for dispute-sensitive actions.

### UX behavior

Each role sees:
- current status in plain language;
- the next primary action;
- what the other side is waiting for, if relevant;
- deadlines or consequences when relevant;
- a clear path to report a problem.

No state should expose contradictory CTAs across feed, match detail and chat.

## Stage 4 — Swipe, feed and navigation hardening

### Swipe integrity

- one gesture produces at most one server decision;
- stale async responses never mutate a newer deck generation;
- retry returns the card only when the server did not record a decision;
- destructive/irreversible decisions are not silently replayed;
- reduced-motion mode replaces large physics animations with short fades/transitions;
- loading the next card must not shift controls or cause accidental taps.

### Feed UX

- filters retain intentional user choices;
- changing role/filter invalidates only relevant query data;
- empty states distinguish “no results”, “filters too narrow”, “offline” and “profile incomplete”;
- photo galleries, shift terms and trust signals are visible without forcing excessive navigation;
- primary swipe controls remain reachable on small-height devices.

### Navigation

- stable bottom navigation for top-level user areas;
- Telegram BackButton maps to meaningful in-app history, not browser accidents;
- modal/detail flows restore the prior list position when returning;
- keyboard and safe-area never cover primary controls.

## Stage 5 — Trust & Safety, support and admin

### User safety flows

Provide context-aware reporting from chat, match and completed shift. A report captures the target entity and relevant shift/match context without requiring the user to retype identifiers.

Support the operational states:
- submitted;
- under review;
- action taken;
- closed/rejected;
- user-visible explanation where policy allows.

### No-show and dispute handling

No-show and disputes must be based on evidence already available to the platform (match, confirmation, arrival code, timestamps, messages, role actions) plus explicit user statements. Arrival code remains evidence, not an independent financial trigger.

### Abuse controls

Maintain or add server-side controls for:
- repeated spam/swipe abuse;
- multi-account patterns where technically reliable;
- blocked accounts;
- fake venue reports;
- suspicious review/rating manipulation;
- admin privilege escalation attempts.

Avoid invasive data collection that is not necessary to enforce product rules.

### Admin principles

- server-side authorization only;
- least privilege;
- immutable/auditable log for security- or money-sensitive actions;
- reason required for destructive/account/financial moderation actions;
- financial corrections remain distinguishable from provider refunds;
- support cases link to relevant user/match/shift records without exposing unrelated personal data.

## Stage 6 — Telegram WebView, accessibility and resilient mobile behavior

Test and harden:
- Telegram light/dark themes;
- safe-area top/bottom insets;
- virtual keyboard opening/closing;
- app background/foreground;
- network loss and recovery;
- Telegram BackButton/MainButton;
- haptic actions that improve confidence without becoming noisy;
- iPhone small/large sizes and representative Android sizes;
- dynamic viewport changes;
- reduced motion;
- screen-reader labels for controls and important status changes.

Automated browser coverage is required but does not replace real-device smoke tests.

## Stage 7 — Reliability, observability and operations

### Application observability

Add structured, privacy-safe telemetry for:
- authentication failures;
- payment/refund/reconciliation outcomes;
- message send/retry failures;
- WebSocket reconnect rate;
- state-transition failures;
- background scheduler failures;
- high-severity moderation/admin actions.

Do not log secrets, payment credentials, Telegram auth payloads or unnecessary personal data.

### Health and readiness

Production readiness checks must distinguish:
- process alive;
- database reachable;
- Redis reachable when required;
- migrations current;
- scheduler operational;
- external provider configuration present.

### Backup and recovery

Document and automate a reproducible PostgreSQL backup/restore exercise. Release is blocked if a backup exists but restore has never been demonstrated.

## Stage 8 — Release candidate verification

A release candidate is eligible for pilot only when all applicable gates are green.

### Automated gates

Backend:
- Ruff;
- full FastAPI/SQLite tests;
- full PostgreSQL tests;
- Alembic one-head validation and migration smoke test.

Frontend/TMA:
- ESLint;
- TypeScript no-emit;
- unit/component tests;
- production build.

End-to-end:
- worker onboarding → swipe → match → chat → shift completion;
- employer onboarding → publish → match → chat → shift completion;
- retries/offline for chat and state-changing actions;
- dispute/no-show/report flows;
- critical admin flows.

Security:
- gitleaks;
- dependency audits;
- CodeQL Python and JavaScript/TypeScript;
- existing critical-findings gate;
- targeted authorization tests around admin, chat, financial and shift-transition endpoints.

### External release gates

These cannot be truthfully proven by repository CI alone:
- Telegram bot/Mini App production settings;
- real iOS and Android Telegram WebView smoke test;
- YooKassa test-environment payment webhook and refund smoke test;
- HTTPS/domain/certificate production configuration;
- production backup destination and restore exercise;
- owner/admin recovery access and credential custody.

If any external gate is untested, status is “code-complete, release blocked”, not “100% production”.

## Testing strategy

Use test-driven changes for every bugfix or new state transition:
1. add a failing regression test that demonstrates the missing guarantee;
2. implement the smallest change that passes it;
3. run affected local/CI slice;
4. run the full subsystem suite;
5. run complete release gates before integration.

Concurrency-sensitive money, messaging and lifecycle actions require PostgreSQL coverage in addition to SQLite.

## Security invariants

- Never trust role/ownership checks performed only on the client.
- Never use read-modify-write for balances or critical counters when an atomic operation is possible.
- Never duplicate provider refunds or wallet credits on retry.
- Never erase financial obligations/history through account deletion.
- Never broadcast chat content to a user whose access has been revoked.
- Never let scheduler failure silently make settled shifts disappear from business logic.
- Never expose sensitive personal fields in public feeds or logs.

## Data migration rules

- Every persistent model change has an Alembic migration.
- Migration chain must keep one head unless an intentional documented merge revision is required.
- Backfills must be bounded and safe to resume.
- New constraints must account for existing data before enforcement.
- Downgrade behavior is implemented when technically safe; irreversible migrations are explicitly documented and require release approval.

## Definition of Done for a subsystem

A subsystem is complete only when:
- happy path works;
- loading/empty/error/retry/disabled/success states exist;
- server authorization and trust boundaries are tested;
- retries are idempotent where appropriate;
- accessibility and mobile layout are verified;
- telemetry does not leak secrets or unnecessary personal data;
- relevant SQLite/PostgreSQL/frontend/E2E tests pass;
- security checks pass;
- documentation and Project Brain checkpoint are updated;
- review finds no unresolved Critical or Important issue.

## Final production status vocabulary

Use precise status labels:

- **Implementation in progress** — code is still changing.
- **Code-complete** — all planned repository work and automated checks pass.
- **Release blocked** — code-complete but at least one external gate is unverified or failed.
- **Pilot-ready** — code-complete plus all required external pilot gates pass.
- **Production-ready** — pilot evidence, operational monitoring, backups/recovery and production configuration are verified.

The project must never be called “100% production-ready” while any required external gate is unknown.
