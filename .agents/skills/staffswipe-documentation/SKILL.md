# StaffSwipe Documentation

## Mission
Keep project knowledge accurate enough for a new engineer or operator to build, deploy, debug, and recover StaffSwipe safely.

## Required docs
- Architecture and trust boundaries.
- Environment variables and production-safe defaults without publishing secret values.
- Database/migration procedure.
- Authentication and authorization model.
- Match/shift state machine and financial invariants.
- Deployment, rollback, backup/restore, and secret rotation runbooks.
- Incident response and security reporting.
- API contract and TMA integration notes.

## Rules
Documentation must match executable behavior. When behavior changes, update affected docs in the same change. Never document real credentials, tokens, personal data, or private infrastructure details.

## Quality
Use concise diagrams/tables for state machines and ownership boundaries. Mark assumptions and operational prerequisites explicitly. Keep a changelog or release notes for user-visible and financial behavior changes.