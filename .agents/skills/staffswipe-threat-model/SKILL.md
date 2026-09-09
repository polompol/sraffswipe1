---
name: staffswipe-threat-model
description: Adversarial threat-modeling for StaffSwipe1. Use for auth, Telegram identity, payments, wallets, shifts/matches, admin, PII, webhooks, codes, or externally reachable services.
---

# StaffSwipe1 threat modeling

Before security-sensitive changes, model the attacker, asset, trust boundary, entry point, abuse case, mitigation, and regression test.

## Assets
- Telegram identity and `tg_id`
- JWT/session credentials
- phone/INN and private venue/worker data
- shifts, matches, and arrival codes
- wallet balance, commissions, and payments
- admin capabilities
- bot/webhook credentials
- database and deployment secrets

## Trust boundaries
- Telegram client -> TMA/backend
- TMA -> API
- worker/venue -> shared match/shift resources
- backend -> payment provider
- payment provider -> webhook
- bot/scheduler -> backend/DB
- public internet -> Caddy/API

## Required abuse cases
- forge or replay Telegram auth/init data
- IDOR/cross-tenant access by guessing IDs
- privilege escalation to admin
- brute-force or replay arrival codes
- duplicate settlement/webhook causing double credit or charge
- manipulate amount, commission, or wallet state
- race two requests through a state transition
- publish or positive-swipe despite overdue venue debt
- disclose phone/INN or sensitive venue/worker data
- SSRF, path traversal, injection, or unsafe file handling where relevant
- abuse rate limits, pagination, expensive endpoints, or scheduler jobs
- leak secrets through logs, errors, builds, or dependency scripts

## For each finding
Record: precondition, attacker action, expected impact, existing control, and regression test. Prefer server-side controls. Never accept a UI-only mitigation for a security boundary.

## Business-logic checks
- A worker confirmation can be sufficient for settlement according to the documented shift state machine; venue silence must not create a free-shift loophole.
- Arrival code is evidence, not a payment trigger; it must be short-lived, rate-limited, and replay-resistant.
- Commission accrual must be idempotent by `match_id`.
- Wallet changes must remain atomic and journaled.
- Payment webhooks must be authenticated/validated, amount-checked, and idempotent.
- Admin relink must never move an account onto an admin Telegram ID.

## Verification
Run relevant unit/API/E2E security tests and the project's security workflow. For auth, payment, wallet, or state-machine changes, explicitly test duplicate, replay, race, ownership, and privilege-escalation cases.
