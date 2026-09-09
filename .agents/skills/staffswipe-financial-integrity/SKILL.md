# StaffSwipe Financial Integrity

## Mission
Protect every ruble and every settlement against duplication, omission, races, unauthorized changes, and provider inconsistencies.

## Invariants
- A match can generate service commission at most once, keyed by match identity.
- Wallet balance changes are atomic and accompanied by a journal entry.
- Payment webhooks are authenticated, provider-verified, amount/currency/metadata-verified, and idempotent.
- A repeated webhook, retry, timeout, or worker restart cannot create a second credit.
- Employer/seeker actions cannot create settlement outside the allowed state machine.
- Arrival/check-in evidence is never itself a payment trigger.
- Debt rules cannot be bypassed by alternate publication/swipe paths.
- Admin money operations require authorization, reason, actor traceability, and an immutable journal record.

## Adversarial tests
Test duplicate requests, concurrent settlement, attendance vs not-held races, webhook replay, wrong amount/currency/metadata, refund duplication, negative/overflow amounts, and transaction rollback after each money mutation.

## Review rule
Never optimize away an idempotency key, transaction boundary, conditional update, or audit record without replacing it with an equally strong control.