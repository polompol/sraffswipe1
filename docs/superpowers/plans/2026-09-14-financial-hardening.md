# StaffSwipe Financial Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make top-ups and refunds retry-safe and prevent account erasure from destroying unresolved financial value or debt.

**Architecture:** Use a shared payment-application helper that acquires the unique provider-charge claim before wallet mutation, plus an isolated durable refund ledger (`RefundAllowance` + `PaymentRefund`) for real YooKassa refunds. Keep money mutations as atomic conditional SQL updates and keep provider I/O outside the reservation transaction.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, PostgreSQL/SQLite tests, urllib YooKassa client.

**Spec:** `docs/superpowers/specs/2026-09-14-financial-hardening-design.md`

## Global Constraints
- YooKassa remains the only card payment rail.
- Commission remains 10%/configured and is generated only for completed shifts.
- Wallet money changes use atomic SQL updates and immutable journal rows.
- Provider webhook data is not trusted until provider-owned payment data is verified.
- Repeated requests, process restarts, or webhook/reconcile races must not duplicate money movement.
- No production deployment or real provider charge/refund is executed in this plan.

---

### Task 1: Red tests for exactly-once top-up application

**Files:** `backend/tests/test_financial_hardening.py`, `backend/tests/test_money_operations.py`

- [x] Add tests proving the same provider charge cannot credit twice and invalid currency/metadata amount is rejected by reconciliation.
- [x] Commit tests before implementation.
- [x] Confirm Backend CI fails for the intended missing behavior/API.

### Task 2: Implement shared verified top-up application

**Files:** `backend/app/financial_hardening.py`, `backend/app/reconcile.py`, route bootstrap files.

**Interfaces:** `validated_wallet_topup(payment) -> tuple[str, str, int]` and `apply_verified_topup(db, payment, *, note) -> bool`.

- [x] Validate provider `status`, amount/currency and metadata in one helper.
- [x] Insert/flush `Purchase` inside a savepoint before wallet credit; catch unique-charge `IntegrityError` as duplicate.
- [x] Use the same helper from webhook and reconciliation.
- [x] Preserve purchase + wallet + journal as one outer transaction.

### Task 3: Red tests for real provider refund reservations

**Files:** `backend/tests/test_financial_hardening.py`

**Interfaces:**
- API: `POST /admin/payments/{purchase_id}/refund` body `{request_id, amount_rub, note}`.
- Data: `RefundAllowance`, `PaymentRefund`.

- [x] Add tests for retrying the same request id, insufficient wallet, total refund cap, explicit provider rejection rollback, and ambiguous transport failure remaining pending.
- [x] Confirm the tests fail before the refund API/model exists.

### Task 4: Implement durable bank refund flow

**Files:**
- `backend/app/financial_models.py`
- `backend/app/financial_hardening.py`
- `backend/migrations/versions/a4d9c2e1f7b6_refund_reservations.py`
- route/bootstrap files

**Interfaces:**
- `RefundAllowance(purchase_id, reserved_amount)` is the atomic per-purchase refund cap.
- `PaymentRefund` stores retry identity, provider id, amount, status and operator audit fields.
- `_create_yookassa_refund(charge_id, amount, request_id)` returns `succeeded|rejected|unknown` plus provider id where known.

- [x] Add schema/model with one migration head.
- [x] Reserve purchase refundable amount and wallet balance atomically before provider I/O.
- [x] Claim/reuse a unique `request_id` without a second reservation/provider operation.
- [x] Use deterministic YooKassa idempotence key from request id.
- [x] On success mark refund succeeded; on definitive rejection restore both reservations; on unknown keep pending/fail-closed.

### Task 5: Protect account erasure from financial loss

**Files:** `backend/tests/test_financial_hardening.py`, `backend/app/financial_hardening.py`

- [x] Add tests for positive wallet, pending commission and pending provider refund blockers.
- [x] Add explicit preflight blockers before the existing anonymization path.
- [x] Ensure a positive advance cannot be silently zeroed by account erasure.

### Task 6: Documentation and release verification

**Files:**
- `docs/PROJECT_BRAIN.md`
- `SECURITY.md`
- `docs/ТЕКСТЫ.md`
- this plan and design spec

- [x] Regenerate the project-owned user-text catalogue after new API messages.
- [x] Align design/plan with the isolated refund ledger actually implemented.
- [ ] Update financial-integrity/security docs and Project Brain checkpoint.
- [ ] Run/inspect Backend CI on SQLite/FastAPI and PostgreSQL, E2E, and Security workflows on the final branch head.
- [ ] Review final diff for secrets, unrelated changes, migration-head conflicts and money-state inconsistencies.
- [ ] Open a draft PR targeting `codex/staffswipe-release-candidate`; do not merge or deploy automatically.