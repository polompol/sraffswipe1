# StaffSwipe Database & Migrations

## Mission
Keep PostgreSQL schema changes safe, reversible where practical, performant, and compatible with running application versions.

## Rules
- Every schema change uses Alembic; never edit production schema manually.
- Inspect generated SQL and migration dependencies before merge.
- Avoid destructive changes in one step: expand -> deploy compatible code -> backfill -> contract.
- Preserve data during type/column renames with explicit migration logic.
- Add indexes for real query paths and inspect potentially expensive scans.
- Foreign keys, uniqueness, and check constraints must encode money/state invariants where feasible.
- Migration tests must run against the supported database engine.

## Money/state safety
- Wallet movements require an append-only journal and atomic balance updates.
- Commission uniqueness must remain enforced at database level when possible.
- Payment provider identifiers must be unique/idempotent.
- Match state transitions must not permit impossible terminal-state reversals.

## Review checklist
Check upgrade, fresh install, duplicate execution, concurrent access, rollback/recovery plan, lock duration, and compatibility with the previous application version.
