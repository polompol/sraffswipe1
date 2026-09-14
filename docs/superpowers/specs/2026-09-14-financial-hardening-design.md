# StaffSwipe Financial Hardening Design

## Goal
Close the remaining release-blocking money-integrity gaps without changing StaffSwipe's product model: YooKassa remains the only card rail, employer wallet is an advance balance, and service commission is charged only for completed shifts.

## Scope
1. Make YooKassa top-up application exactly-once under webhook/reconciliation retries and races.
2. Make reconciliation validate the same provider-owned facts as the webhook before crediting.
3. Add a real YooKassa refund flow tied to a concrete paid purchase, with retry-safe request identity, audit trail, amount caps, and wallet reservation.
4. Prevent account erasure from silently destroying a positive wallet balance or unresolved commission debt.
5. Preserve existing manual wallet correction as an operator accounting adjustment; it is not a bank refund.

## Invariants
- A provider charge credits the wallet at most once, even when webhook and reconciliation race.
- `Purchase.provider_charge_id` is the database ownership claim for a top-up; wallet credit happens only after that claim is acquired inside the same transaction.
- Provider facts must be `status=succeeded`, `currency=RUB`, `sku=wallet_topup`, a valid owner, and an integer-ruble amount matching `metadata.amount_rub`.
- A bank refund may never exceed the original purchase amount across succeeded or in-flight refund requests.
- A bank refund may never return more than the employer's currently available wallet balance; reservation uses an atomic conditional update.
- Repeating the same refund `request_id` never reserves balance twice and never creates a second provider refund.
- An uncertain provider response leaves the refund reserved/pending; it is safer to reconcile than to risk returning money twice.
- Account erasure is blocked while wallet balance is positive, a provider refund is pending, or employer commission debt is pending. Financial records stay immutable/auditable.

## Data model
Add `PaymentRefund`:
- `id`: internal UUID
- `purchase_id`: FK to `purchases.id`, indexed
- `owner_id`: indexed
- `request_id`: UUID string, globally unique (client/admin retry identity)
- `provider_refund_id`: nullable unique provider id
- `amount`: integer RUB
- `status`: `pending|succeeded|failed`
- `note`: operator reason
- `actor_id`: administrator principal id
- `created_at`

Add `Purchase.refunded_amount` integer default 0. It represents money reserved for succeeded or uncertain/pending provider refunds. The field is updated atomically with `refunded_amount + amount <= purchase.amount`.

## Top-up application
Create one helper used by webhook and reconciliation. It first validates trusted provider payment data, then tries to insert the `Purchase` inside a savepoint and flush it before touching wallet balance. If the unique provider charge already exists, the helper returns duplicate without crediting. If the insert wins, wallet credit and journal entry happen in the same outer transaction.

## Bank refund flow
`POST /admin/payments/{purchase_id}/refund` accepts `request_id`, `amount_rub`, and `note`.

Reservation transaction:
1. Require admin and a paid YooKassa wallet-topup purchase.
2. If `request_id` already exists, return its current state without mutating money.
3. Atomically reserve purchase refundable amount (`refunded_amount += amount` with cap).
4. Atomically debit employer wallet (`balance_rub -= amount` with sufficient-balance condition).
5. Add `PaymentRefund(status=pending)` and a negative `WalletTxn(kind=provider_refund)` audit row.
6. Commit reservation before external I/O.

Provider call uses deterministic `Idempotence-Key` derived from `request_id`. A successful response stores provider refund id/status. A transport/unknown failure leaves the request pending and reserved so a retry cannot double-refund. A definitive provider rejection releases both reservations atomically and marks the refund failed.

A provider lookup/reconciliation helper can re-check pending refund ids/requests later; this design does not silently credit money back on ambiguous network outcomes.

## Account erasure
Before anonymization, reject with 409 when:
- `Entitlement.balance_rub > 0`;
- employer has `Commission.status == pending`;
- owner has `PaymentRefund.status == pending`.

Do not create the old `erase` wallet transaction that simply destroys a positive advance. Operator must complete a real refund/settlement/write-off first, leaving a coherent financial history.

## Testing
Add adversarial backend tests for:
- duplicate provider charge claimed once;
- webhook/reconciliation helper duplicate path does not double-credit;
- reconcile rejects wrong currency and metadata amount mismatch;
- refund retry with same request id reserves once;
- total partial refunds cannot exceed purchase amount;
- refund cannot exceed available wallet balance;
- definitive refund rejection restores wallet and purchase refundable amount;
- ambiguous provider failure stays pending/reserved;
- erasure blocked by positive wallet, pending commission, and pending bank refund;
- erasure still works once financial blockers are cleared.

Run Ruff, backend tests on SQLite and PostgreSQL via CI, E2E, and Security workflows before considering merge. No production deployment or real YooKassa call is part of this change.