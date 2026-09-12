# StaffSwipe — instructions for AI agents

## First rule: continue, do not restart

For any StaffSwipe task, especially requests like «Продолжи StaffSwipe», «работаем дальше», «доделай проект» or similar, read `docs/PROJECT_BRAIN.md` first and treat it as the continuity checkpoint.

Then inspect the relevant current files in `main`. Never propose already-implemented functionality as if it were new, and do not replace agreed architecture, product rules, or design without a concrete reason.

## Sources of truth

Priority:
1. Executable code + migrations in current `main`.
2. `docs/PROJECT_BRAIN.md` — canonical cross-session checkpoint.
3. `CLAUDE.md` — detailed technical/domain memory.
4. `DESIGN_SYSTEM.md`, `SECURITY.md`, `README.md`, and relevant `docs/*` files.
5. Latest explicit user decision for product/design choices.

If sources conflict, surface the conflict. For technical behavior, current executable code wins unless the task is explicitly to change it.

## Project identity

StaffSwipe is a Telegram Mini App for HoReCa shift matching: worker ↔ venue, swipe → mutual interest → match → shift confirmation → attendance/completion/dispute → reputation/commission.

Keep it mobile-first, Telegram-first, minimal, fast, and understandable to non-technical users.

## Non-negotiable checks

Before changing code, inspect the relevant existing implementation. Preserve financial, authentication, authorization, privacy, and shift-state invariants documented in `CLAUDE.md` and `docs/PROJECT_BRAIN.md`.

After changes run the relevant verification:

```bash
# Backend
cd backend && ruff check . && python -m pytest -q

# TMA
cd tma && npm run lint && npx tsc --noEmit && npx vitest run && npm run build

# Whole repo
bash scripts/verify.sh

# Browser E2E when relevant
bash scripts/e2e.sh
```

For schema changes, create an Alembic migration and keep one migration head.

## Product / UX rules

- Reuse the existing design system and tokens; do not introduce arbitrary colors/components.
- Design happy path plus loading, empty, error, disabled, success, retry, and destructive-confirmation states.
- Respect Telegram WebView safe areas, viewport changes, themes, keyboard behavior, BackButton/MainButton and haptics where relevant.
- UI copy is Russian, simple and warm unless the user explicitly asks otherwise.
- Admin capabilities must be authorized server-side.
- Never put secrets in client code or repository files.

## Security rule

Before completion, perform a short attacker review: can this be replayed, forged, enumerated, abused for privilege escalation, used to bypass commission, or expose personal data?

## Completion rule

After substantial work, update the `Checkpoint` section of `docs/PROJECT_BRAIN.md` with:
- what changed;
- files/screens affected;
- verification performed;
- remaining risks;
- exact next task.

This is what allows the next AI session to continue instead of reconstructing the project from scratch.
