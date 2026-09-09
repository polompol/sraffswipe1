---
name: staffswipe-testing
description: Testing and verification workflow for StaffSwipe1. Use after any code change, especially auth, payments, matching, shifts, API contracts, or TMA behavior.
---

# StaffSwipe1 testing

Treat tests as part of the implementation, not a final optional step.

## Backend

From `backend/` run:

```bash
ruff check .
python -m pytest -q
```

For database changes, verify the Alembic migration upgrades cleanly and preserves the single-head chain. For money/state-machine changes, add or update tests for duplicate requests, invalid transitions, authorization failures, and rollback/transaction behavior.

## TMA

From `tma/` run:

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Cover loading, error, empty, mobile/touch, and Telegram-specific behavior for changed screens. Do not make tests depend on real Telegram credentials.

## End-to-end

When a change crosses frontend/backend/auth/payment flows, use the existing `e2e/` Playwright suite and `bash scripts/e2e.sh` when available. Do not commit temporary screenshots or measurement scripts.

## Security regression cases

For every sensitive endpoint test unauthenticated access, wrong-user ownership, malformed input, replay/duplicate requests, and attempts to mutate another user's resource. For payment/commission tests explicitly prove that duplicate webhook/settlement attempts cannot double-credit or double-charge.
