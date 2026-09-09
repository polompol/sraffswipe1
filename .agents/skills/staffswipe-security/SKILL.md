---
name: staffswipe-security
description: Security review for StaffSwipe1. Use before auth, payments, personal-data, Telegram init data, admin, Docker/deploy, or externally reachable endpoint changes.
---

# StaffSwipe1 security review

Before declaring a security-sensitive change complete, review it as an attacker and verify the existing project rules in `SECURITY.md` and `CLAUDE.md`.

## Mandatory checks

- Never trust Telegram client data (`initDataUnsafe`); authenticate from server-validated init data.
- Treat `tg_id` as the identity key. Relinking accounts must not create an admin identity or privilege escalation.
- Keep INN/phone out of public candidate endpoints and never persist document photos.
- Keep secrets in environment variables; do not weaken `assert_production_safe()`.
- Money and balances use atomic conditional database updates; never read-modify-write balances.
- Commission accrual must remain idempotent by `match_id`.
- Payment webhooks must be authenticated/validated, idempotent, and amount-checked against trusted metadata.
- Authorization must be enforced server-side for every state-changing endpoint; UI hiding is not authorization.
- Validate ownership of match/shift resources to prevent IDOR.
- Check rate limits, replay resistance, expiry, and brute-force resistance for codes/tokens.
- For new DB fields, require an Alembic migration; inspect migration ordering and single-head consistency.
- For Docker/Caddy changes, avoid exposing databases/admin services and verify TLS, headers, network boundaries, and secret handling.
- For dependencies or scripts, inspect lifecycle hooks, network access, and unnecessary privileges before adding them.

## Adversarial questions

For every feature ask: Can a worker impersonate another worker? Can a venue alter another venue's shift/match? Can a client forge confirmation? Can money be charged twice or avoided? Can an expired/replayed token work? Can a public endpoint disclose private data? Can an admin action be reached by a normal user?

## Verification

Run the smallest relevant tests, then the project-wide checks from `CLAUDE.md`: backend lint/tests, TMA lint/typecheck/tests/build, and `scripts/verify.sh` when available.
