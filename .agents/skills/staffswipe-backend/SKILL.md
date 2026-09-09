---
name: staffswipe-backend
description: FastAPI/SQLAlchemy/Pydantic backend guidance for StaffSwipe1. Use for API, database, auth, matching, shifts, commission, wallet, webhooks, scheduler, or admin changes.
---

# StaffSwipe1 backend

Respect the existing FastAPI + SQLAlchemy 2 + Pydantic 2 architecture, SQLite for development/tests, PostgreSQL in production, Alembic migrations, and the separate aiogram bot/scheduler processes.

## Domain invariants

- `tg_id` is the user identity. Never derive authorization from client-controlled profile fields.
- A worker-confirmed matched shift can enter settlement; silence after the configured window means the shift is treated as held unless an explicit `not-held` path or dispute applies.
- The arrival code is evidence, not the payment trigger. It must be short-lived/validated and protected from brute force/replay.
- Commission is 10% and accrues only for a closed shift, idempotently by `match_id`.
- Wallet changes are atomic conditional updates with a transaction record; never use read-modify-write.
- Payment webhooks are idempotent by provider charge/event identity and verify amount/metadata before crediting.
- Unconfirmed-by-anyone shifts can expire without money; do not accidentally turn expiry into a charge.
- Overdue venue debt must preserve the existing publication/positive-swipe blocking behavior.
- New model fields require an Alembic migration and a single valid head.
- Scheduler jobs are protected against duplicate same-day execution through `job_runs`.

## API security

For every new/changed endpoint verify authentication, authorization, ownership, input validation, pagination/limits, sensitive-field filtering, transaction boundaries, error disclosure, and idempotency where state or money can change. Assume request IDs and path IDs are attacker-controlled.

## Verification

Run `ruff check . && python -m pytest -q` from `backend/`. For cross-layer changes also run the project-wide verification and E2E commands documented in `CLAUDE.md`.
