# StaffSwipe Financial Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make top-ups and refunds retry-safe and prevent account erasure from destroying unresolved financial value or debt.

**Architecture:** Introduce a shared payment-application helper that acquires the unique provider-charge claim before wallet mutation, and a durable `PaymentRefund` reservation record for real YooKassa refunds. Keep money mutations as atomic conditional SQL updates and keep provider I/O outside the reservation transaction.

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

**Files:**
- Modify: `backend/tests/test_money_operations.py`
- Later modify: `backend/app/routers/billing.py`
- Later modify: `backend/app/reconcile.py`

**Interfaces:**
- Produces test contract for a shared `apply_verified_topup(db, payment) -> tuple[bool, int]` helper where bool indicates newly credited.

- [ ] Add tests proving the same provider charge cannot credit twice and invalid currency/metadata amount is rejected by reconciliation.
- [ ] Commit tests only.
- [ ] Confirm Backend CI fails for the intended missing behavior/API.

### Task 2: Implement shared verified top-up application

**Files:**
- Modify: `backend/app/routers/billing.py`
- Modify: `backend/app/reconcile.py`

**Interfaces:**
- Produces: `validated_wallet_topup(payment: dict) -> tuple[str, str, int]` and `apply_verified_topup(db: Session, payment: dict, *, note: str) -> bool`.

- [ ] Validate provider `status`, amount/currency and metadata in one helper.
- [ ] Insert/flush `Purchase` inside a savepoint before wallet credit; catch unique-charge `IntegrityError` as duplicate.
- [ ] Use helper from webhook and reconciliation.
- [ ] Confirm focused tests and full Backend CI pass.

### Task 3: Red tests for real provider refund reservations

**Files:**
- Modify: `backend/tests/test_money_operations.py`
- Later modify: `backend/app/models.py`
- Later create: `backend/migrations/versions/a4d9c2e1f7b6_money_hardening.py`
- Later modify: `backend/app/routers/admin_accounts.py`
- Later modify: `backend/app/reconcile.py`

**Interfaces:**
- API: `POST /admin/payments/{purchase_id}/refund` body `{request_id, amount_rub, note}`.
- Data: `PaymentRefund`, `Purchase.refunded_amount`.

- [ ] Add tests for retrying the same request id, insufficient wallet, total refund cap, explicit provider rejection rollback, and ambiguous transport failure remaining pending.
- [ ] Commit tests only.
- [ ] Confirm Backend CI fails for the missing refund API/model.

### Task 4: Implement durable bank refund flow

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/migrations/versions/a4d9c2e1f7b6_money_hardening.py`
- Modify: `backend/app/routers/admin_accounts.py`
- Modify: `backend/app/reconcile.py`

**Interfaces:**
- `PaymentRefund` fields from the design spec.
- Provider helper `_create_yookassa_refund(charge_id, amount, request_id) -> tuple[str, str | None]`, returning outcome `succeeded|rejected|unknown` and provider id where known.

- [ ] Add schema/model with one migration head.
- [ ] Reserve purchase refundable amount and wallet balance atomically before provider I/O.
- [ ] Reuse an existing `request_id` without a second reservation/provider operation.
- [ ] Use deterministic YooKassa idempotence key from request id.
- [ ] On success mark refund succeeded; on definitive rejection restore both reservations; on unknown keep pending.
- [ ] Confirm migration, focused tests, SQLite and PostgreSQL Backend CI pass.

### Task 5: Protect account erasure from financial loss

**Files:**
- Modify: `backend/tests/test_money_operations.py`
- Modify: `backend/app/routers/admin_accounts.py`

**Interfaces:**
- `erase_account` returns 409 while wallet balance > 0, pending commission exists, or pending `PaymentRefund` exists.

- [ ] Add failing tests for all three blockers and success after blockers are cleared.
- [ ] Remove the old behavior that zeroed a positive wallet during erasure.
- [ ] Add explicit preflight blockers before personal-data mutation.
- [ ] Confirm focused and full backend tests pass.

### Task 6: Documentation and release verification

**Files:**
- Modify: `docs/PROJECT_BRAIN.md`
- Modify: `SECURITY.md` if behavior text is stale.

**Interfaces:**
- Checkpoint records exact commit, verification, remaining risks, and next task.

- [ ] Update financial-integrity documentation and Project Brain checkpoint.
- [ ] Run/inspect Backend CI, E2E, and Security workflows on the final branch head.
- [ ] Review the final diff for secrets, accidental unrelated changes, migration-head conflicts, and money-state inconsistencies.
- [ ] Open a draft PR targeting `codex/staffswipe-release-candidate`; do not merge or deploy automatically.