# StaffSwipe E2E & QA

## Mission
Validate user-visible behavior across the real TMA, API, database, authentication, matching, attendance, disputes, payments, and recovery paths.

## Critical journeys
1. Telegram authentication -> profile -> feed.
2. Employer publishes shift -> seeker discovers -> mutual match.
3. Confirmation -> arrival/check-in evidence -> attendance -> settlement.
4. Worker no-show / employer not-held -> correct terminal state with no illicit commission.
5. Venue silence -> configured timeout -> held/expired behavior according to policy.
6. Debt -> blocked publication/positive swipe -> unblock after valid payment.
7. YuKassa top-up -> verified webhook -> one wallet credit.
8. Admin support action -> authorization -> journal/audit trail.

## Test dimensions
Run happy path, duplicate submission, refresh/reconnect, expired token/code, unauthorized actor, wrong owner, offline/slow network, concurrent requests, mobile viewport, keyboard/accessibility path, and localization-sensitive UI states.

## Rule
Tests must assert outcomes and invariants, not implementation details. Financial and authorization regressions are release blockers.
