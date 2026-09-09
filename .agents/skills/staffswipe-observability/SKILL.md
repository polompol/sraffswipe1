---
name: staffswipe-observability
description: Observability and production diagnostics for StaffSwipe1. Use for Sentry, logging, errors, payments, authentication, scheduler jobs, API failures, or production incidents.
---

# StaffSwipe1 observability

Make production failures diagnosable without leaking secrets or personal data.

- Use the project's existing Sentry integration rather than adding a second telemetry stack without need.
- Capture actionable exceptions, route/operation context, release/version, and safe identifiers.
- Never log Telegram bot tokens, JWTs, authorization headers, payment secrets, passwords, full initData, SMS codes, arrival codes, or sensitive personal data.
- For payment failures record safe provider event/payment IDs, expected-vs-received state where appropriate, and reconciliation status; never log secret credentials.
- For authentication failures record reason/category and safe request context, not raw credentials or signed Telegram payloads.
- Scheduler jobs should expose success/failure and duration and retain idempotent job-run records.
- API errors should have stable categories/codes so the TMA can present useful messages without exposing stack traces.
- Preserve correlation/request IDs across frontend-visible errors and backend logs when the existing architecture supports them.
- Distinguish expected user errors (validation, expired state, conflict) from unexpected server failures.
- Monitoring must not become a privacy backdoor: collect the minimum data necessary to debug.

When changing a critical flow, ask what signal would let an operator detect, diagnose, and reconcile a failure without accessing raw private data.
