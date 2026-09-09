---
name: staffswipe-incident-response
description: Incident response, outage, security breach, token leak, database failure, payment/YooKassa failure, Redis failure, Telegram outage, mass error, data-integrity, rollback, recovery, and postmortem review for StaffSwipe1. Use for operational incidents, emergency changes, or resilience planning.
---

# StaffSwipe1 incident response

During an incident, protect users, data, money, and the ability to recover. Prefer a controlled reduction of functionality over uncertain writes or silent corruption.

This skill complements `staffswipe-security`, `staffswipe-observability`, `staffswipe-production`, `staffswipe-financial-integrity`, and `staffswipe-privacy`.

## Severity model

Use a simple severity scale:

- **SEV-1**: active security compromise, incorrect money movement, broad data exposure/loss, production unavailable for most users, or corruption with uncertain blast radius.
- **SEV-2**: major feature unavailable or degraded for many users, payment/Telegram/DB dependency failure with contained integrity risk, or elevated error rate causing material marketplace impact.
- **SEV-3**: limited degradation, localized bug, non-critical background job failure, or operator-only issue with workarounds.

Escalate severity when uncertainty about money/data integrity is high.

## First-response priorities

1. Stop harmful writes if integrity is uncertain.
2. Preserve evidence/logs.
3. Establish scope and start time.
4. Identify whether auth, money, personal data, or shift lifecycle is affected.
5. Mitigate with the smallest reversible action.
6. Communicate accurate user/operator status without speculation.
7. Recover and verify before declaring resolved.
8. Produce a postmortem and preventive actions.

Do not rush destructive cleanup before evidence is captured.

## Emergency safe modes

Design/operate with reversible switches where practical:

- disable new payments while keeping balance/history readable;
- disable commission accrual if duplicate/incorrect charging is suspected;
- disable new shift creation while existing confirmed shifts remain visible;
- disable swipe/match creation while chat/status remains available;
- disable uploads when storage malware/abuse risk is suspected;
- disable referral rewards during fraud spikes;
- disable admin mutations while retaining read-only diagnostics.

A feature flag or environment switch must itself be authenticated/configured safely and documented. Do not create an unauthenticated "maintenance endpoint".

## Secret/token leak

If a secret may be exposed, treat rotation as mandatory; deleting a commit/log is not enough.

### Telegram bot token

- rotate/revoke with the provider immediately;
- update production secret storage;
- restart only the services that require it where practical;
- verify bot webhooks/updates and Mini App auth validation;
- review suspicious bot/admin activity since suspected exposure.

### JWT secret

- rotate the secret;
- expect current sessions to become invalid;
- confirm relogin works through Telegram init-data verification;
- investigate whether tokens were also exposed.

### Internal API/payment/storage/database credentials

- rotate provider-side credentials first where possible;
- update application secrets;
- revoke/expire old credentials;
- verify least privilege and connectivity;
- reconcile affected writes after recovery.

Never paste real secrets into issues, PRs, logs, chat, analytics, or incident notes.

## Database outage or corruption

If PostgreSQL is unavailable:

- fail closed for state-changing operations that require authoritative data;
- do not buffer financial/confirmation writes in untrusted client storage;
- allow only clearly safe cached/read-only UX where semantics remain honest;
- inspect DB health, disk, connections, locks, migrations, and recent deploys;
- restore service before replaying queued internal jobs.

If corruption or bad migration is suspected:

- stop affected writes;
- capture current state/backup before repair when feasible;
- identify last known-good backup and point-in-time recovery options;
- prefer forward repair when safer than destructive rollback;
- verify Alembic head and schema consistency;
- reconcile money and shift state after restoration.

A backup is not considered healthy merely because a dump file exists; restoration must be tested periodically.

## Redis outage

Redis supports shared rate-limit/chat state in production. On outage:

- understand which protections degrade;
- never silently disable critical authorization because Redis is down;
- choose explicit fail-open/fail-closed behavior per feature;
- rate limiting may need conservative local fallback if already supported;
- WebSocket/realtime degradation should fall back to REST/refetch where possible;
- after recovery, confirm stale presence/connection state does not affect authoritative shift/payment state.

## YooKassa/payment failure

Money integrity takes precedence over UX continuity.

For provider outage/timeouts:

- do not assume a timeout means payment failed;
- preserve provider payment id/idempotency key and trusted requested amount;
- show pending/unknown state honestly;
- retry/reconcile through the existing idempotent reconciliation flow;
- never credit a wallet twice because the client retried;
- never infer success solely from a redirect/client callback.

For suspected duplicate or wrong credits/commissions:

- disable the affected write path;
- query authoritative wallet transactions/commissions/provider state;
- reconcile by immutable transaction history rather than editing balances manually;
- use atomic compensating/refund transactions;
- preserve audit evidence.

Coordinate every financial incident with `staffswipe-financial-integrity`.

## Telegram outage or degraded Mini App platform

When Telegram APIs or clients fail:

- keep backend state authoritative;
- avoid marking notification delivery as user acknowledgement;
- do not cancel or close shifts merely because a bot notification failed;
- allow recovery/refetch when users reopen the Mini App;
- degrade haptics/theme/buttons/deep-link conveniences gracefully;
- queue/retry non-critical bot notifications only with dedupe/idempotency.

## Mass application errors

For a spike in 5xx/client crashes:

- inspect Sentry/structured logs, deploy SHA, endpoint/route concentration, affected version/platform, and dependency health;
- compare against the latest deploy/config/migration;
- rollback or disable the smallest risky feature when confidence is sufficient;
- avoid repeated speculative redeploys that destroy evidence;
- verify recovery through error rate plus real synthetic/user flow checks.

## Security attack

For active abuse/DDoS/credential abuse:

- use proxy/WAF/provider controls before application-level emergency hacks where available;
- tighten rate limits carefully and monitor false positives;
- block abusive sources/signals without exposing detection logic;
- rotate credentials if compromise is plausible;
- preserve request/security logs;
- review privileged/admin actions;
- coordinate user/account enforcement with `staffswipe-trust-safety`.

For suspected personal-data exposure, involve privacy/legal obligations and document what fields, users, and time window may be affected.

## Incident communications

Internal incident notes should track:

- severity;
- incident commander/owner when applicable;
- start/detection times;
- symptoms and scope;
- current mitigation;
- known user impact;
- data/money integrity status;
- next verification step;
- relevant deploy/config changes.

User-facing communication must:

- say what is known;
- avoid unsupported root-cause claims;
- explain what functionality is affected;
- avoid exposing security-sensitive internals;
- explicitly distinguish pending payments/shift status from confirmed outcomes.

## Recovery verification

Do not close an incident because a process restarted. Verify the actual user journeys relevant to the incident, for example:

- Telegram login;
- feed retrieval;
- swipe/match creation;
- chat REST/WebSocket;
- shift confirm/complete/cancel state;
- payment top-up and webhook/reconciliation;
- commission accrual exactly once;
- admin/support access;
- image upload/read where relevant.

Check delayed schedulers/queues after downtime so jobs do not execute twice or at the wrong time.

## Postmortem

For SEV-1 and meaningful SEV-2 incidents, record:

- timeline;
- user/business impact;
- detection gap;
- technical root cause;
- contributing conditions;
- what mitigated impact;
- what made response harder;
- concrete corrective actions with owners/priorities;
- tests/alerts/runbook changes needed.

Avoid blame-focused language. Corrective actions should change systems/processes, not merely say "be more careful".

## Preparedness checklist

Maintain and periodically verify:

- recent restorable backups;
- secret rotation procedure;
- production deploy/rollback path;
- Sentry/health monitoring;
- payment reconciliation;
- audit logs for privileged actions;
- documented production dependencies;
- emergency feature-disable strategy;
- contact/access continuity for critical providers;
- tested recovery of core shift and payment flows.

## Verification

For resilience changes, add failure-path tests where practical: provider timeouts, duplicate webhooks, DB/Redis unavailability, stale scheduler jobs, retry/idempotency, and rollback/migration scenarios. Run the project verification suite and review observability coverage before shipping.
