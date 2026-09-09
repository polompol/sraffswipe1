# StaffSwipe CI/CD & Release

## Mission
Treat every change as releasable only after deterministic quality, security, migration, frontend, backend, and E2E gates pass.

## Required gates
- Backend: ruff, type checks if configured, pytest, migration checks.
- TMA: lint, typecheck, Vitest, production build.
- Security: dependency audit, secret scanning, CodeQL/security workflow.
- E2E: critical employer/seeker flows when application behavior changes.
- Docker/config: production build and startup safety when infra changes.

## Release rules
- Never bypass a failing security or financial-integrity gate.
- Do not weaken CI with `continue-on-error` for security-critical checks without explicit documented justification.
- Keep migrations forward-only and reviewed; destructive changes require a staged migration plan.
- Releases must identify commit SHA, migration state, and rollback procedure.
- Never print secrets, tokens, Telegram initData, payment payload secrets, or PII in CI logs.

## Change discipline
Prefer small atomic commits. Update tests with behavior changes. Before declaring ready, inspect the final diff and confirm no unrelated generated or formatting churn is included.
