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
Add an isolated financial ledger instead of modifying historical `Purchase` rows.

`RefundAllowance`:
- `purchase_id`: PK/FK to `purchases.id`;
- `reserved_amount`: integer RUB already reserved by succeeded or in-flight bank refunds.

`PaymentRefund`:
- `id`: internal UUID;
- `purchase_id`: FK to `purchases.id`, indexed;
- `owner_id`: indexed;
- `request_id`: UUID string, globally unique (admin retry identity);
- `provider_refund_id`: nullable unique provider id;
- `amount`: integer RUB;
- `status`: `pending|succeeded|failed`;
- `note`: operator reason;
- `actor_id`: administrator principal id;
- `created_at`.

The per-purchase cap is enforced with an atomic conditional update of `RefundAllowance.reserved_amount`, so `reserved_amount + amount <= Purchase.amount` even under concurrent requests. Keeping this counter in its own table avoids rewriting existing purchase rows while preserving a durable reservation.

## Top-up application
One helper is used by webhook and reconciliation. It validates trusted provider payment data, then tries to insert the `Purchase` inside a savepoint and flush it before touching wallet balance. If the unique provider charge already exists, the helper returns duplicate without crediting. If the insert wins, wallet credit and journal entry happen in the same outer transaction.

## Bank refund flow
`POST /admin/payments/{purchase_id}/refund` accepts `request_id`, `amount_rub`, and `note`.

Reservation transaction:
1. Require admin and a paid YooKassa wallet-topup purchase.
2. Claim the globally unique `request_id` before money mutation; an existing request returns its current state.
3. Ensure the purchase has a `RefundAllowance` row.
4. Atomically reserve refundable amount in `RefundAllowance` with a cap at the original `Purchase.amount`.
5. Atomically debit employer wallet (`balance_rub -= amount` with sufficient-balance condition).
6. Add `PaymentRefund(status=pending)` and a negative `WalletTxn(kind=provider_refund)` audit row.
7. Commit reservation before external I/O.

Provider call uses deterministic YooKassa `Idempotence-Key` equal to `request_id`. A successful response stores provider refund id/status. A transport/unknown failure leaves the request pending and reserved so a retry cannot double-refund. A definitive provider rejection releases both the allowance reservation and wallet debit atomically and marks the refund failed.

Pending provider refunds remain fail-closed: the platform does not silently put reserved money back after an ambiguous provider response. A follow-up reconciliation mechanism can resolve these states against YooKassa without risking a double refund.

## Account erasure
Before anonymization, reject with 409 when:
- `Entitlement.balance_rub > 0`;
- employer has `Commission.status == pending`;
- owner has `PaymentRefund.status == pending`.

The old erase path is reused only after these preconditions pass, so it can no longer silently destroy a positive advance. Operator must complete a real refund/settlement/write-off first, leaving a coherent financial history.

## Testing
Adversarial backend tests cover:
- duplicate provider charge claimed once;
- webhook/reconciliation helper duplicate path does not double-credit;
- reconcile rejects wrong currency and metadata amount mismatch;
- refund retry with same request id reserves once;
- total partial refunds cannot exceed purchase amount;
- refund cannot exceed available wallet balance;
- definitive refund rejection restores wallet and allowance reservation;
- ambiguous provider failure stays pending/reserved;
- erasure blocked by positive wallet, pending commission, and pending bank refund.

Run Ruff, backend tests on SQLite and PostgreSQL via CI, E2E, and Security workflows before considering merge. No production deployment or real YooKassa call is part of this change.