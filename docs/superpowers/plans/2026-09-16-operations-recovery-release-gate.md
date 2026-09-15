# Stage 7 Operations, Recovery & Release Gate Implementation Plan

> Execute inline in `codex/staffswipe-production-readiness`. Keep PR #62 Draft. Do not merge `main` or release-candidate during this plan.

**Goal:** add scheduler liveness evidence, sanitized operational health, verified PostgreSQL restore, and one same-SHA repository release gate without replacing Sentry or changing product/business behavior.

**Architecture:** keep `/health` and `/health/ready` unchanged; persist scheduler heartbeat in a dedicated table; expose a separate `/health/ops`; retain Redis runtime fallback but add a fresh health probe; verify the existing SQL+gzip backup format against a disposable PostgreSQL database; aggregate the four canonical GitHub workflows for one exact commit SHA.

**TDD rule:** no production behavior change before a focused test is committed and observed failing for the intended missing behavior.

---

## Task 1 — Characterize existing health contracts

**Files**
- Add/extend: `backend/tests/test_health.py` or the existing health test file discovered in the repository.

**RED/characterization assertions**
- `GET /health` remains `200 {"status":"ok"}`.
- `GET /health/ready` remains DB-only readiness and returns 503 when the DB probe fails.
- `/health/ops` does not yet exist (expected RED for the new contract).

**Verification**
- Run the focused backend test in CI/targeted workflow evidence.
- Confirm the failure is specifically missing `/health/ops`, not fixture/import failure.

No production code in this task.

## Task 2 — Scheduler heartbeat model and persistence

**Files**
- Modify: `backend/app/models.py`
- Modify: `backend/app/scheduler.py`
- Add: one Alembic migration under `backend/migrations/versions/`
- Add: `backend/tests/test_scheduler_heartbeat.py`

**RED tests first**
1. heartbeat write creates `service_heartbeats.scheduler`;
2. second heartbeat updates the same row instead of inserting a duplicate;
3. timestamp advances when a later heartbeat is written;
4. a heartbeat DB failure does not escape the scheduler loop helper.

**Minimal implementation**
- `ServiceHeartbeat` model with `service` primary key and UTC `updated_at`.
- `_write_heartbeat()` helper using a short independent DB session.
- use an idempotent/upsert-safe write compatible with SQLite test coverage and PostgreSQL production coverage;
- invoke heartbeat once per scheduler loop before sleep;
- log failure without terminating the loop.

**Migration**
- determine the actual current Alembic head before writing `down_revision`;
- create/drop only `service_heartbeats`;
- verify migration on PostgreSQL CI.

## Task 3 — Fresh Redis health probe

**Files**
- Modify: `backend/app/redisclient.py`
- Add/extend: `backend/tests/test_redisclient.py`

**RED tests first**
- no `REDIS_URL` → `disabled`/non-failing health result;
- configured Redis successful fresh ping → healthy;
- configured Redis connection/ping exception → unhealthy but exception does not propagate;
- probe does not alter cached clients/fallback state used by normal app behavior.

**Minimal implementation**
- add a dedicated short-timeout health probe separate from `sync_client()` cache;
- sanitize errors to boolean/status only.

## Task 4 — Operational health endpoint

**Files**
- Modify: `backend/app/main.py`
- Add/extend: health tests from Task 1.

**RED tests first**
1. fresh scheduler heartbeat + DB OK + Redis disabled/OK → 200;
2. missing heartbeat → 503;
3. heartbeat older than 180s → 503;
4. configured Redis unhealthy → 503;
5. DB unavailable → 503;
6. response contains only bounded status data and no raw exception/connection secret;
7. existing `/health` and `/health/ready` responses remain unchanged.

**Minimal implementation**
- `GET|HEAD /health/ops`;
- DB `SELECT 1`;
- call fresh Redis health probe;
- query `ServiceHeartbeat(service="scheduler")`;
- compute heartbeat age in UTC with a 180-second default stale threshold;
- return 200/503 with component status only;
- do not point Docker API healthcheck at this endpoint.

## Task 5 — Backup/restore executable contract

**Files**
- Add: `scripts/verify-backup-restore.sh`
- Add: lightweight shell/static contract test if an existing shell-test harness exists; otherwise drive the first RED through Backend CI after wiring the missing script invocation.
- Modify: `.github/workflows/backend.yml`

**Required behavior**
- use CI PostgreSQL only;
- apply migrations to a source DB;
- insert a unique sentinel row into a stable core table with all required fields satisfied;
- dump using production-compatible SQL semantics (`pg_dump --clean --if-exists | gzip`);
- `gzip -t` archive;
- create a second disposable restore DB;
- restore with `psql` from `zcat`/`gzip -dc`;
- verify core table exists and sentinel row is present;
- explicitly test a corrupt/truncated archive exits non-zero;
- clean temporary DB/files with `trap`.

**CI integration**
- add a PostgreSQL recovery verification step/job to Backend CI;
- do not upload the SQL dump as an artifact;
- keep credentials CI-local.

## Task 6 — Same-SHA repository release gate

**Files**
- Add: `.github/workflows/release-gate.yml`
- Optionally add/update: release documentation/checklist if needed.

**Contract**
- one visible `Repository Release Gate` check;
- source workflows: `TMA CI`, `Backend CI`, `E2E`, `Security`;
- evidence must be for the same commit SHA;
- failed/cancelled/timed-out/missing source evidence is not green;
- workflow permissions read-only (`actions: read`, `contents: read`, `checks/statuses: read` only if needed);
- bounded wait/retry if GitHub's eventual consistency requires polling;
- do not rerun or duplicate the four suites;
- summary explicitly states that Telegram physical-device and YooKassa test-environment smokes are external and are not auto-passed.

**Verification**
- first execution may expose workflow-name/API assumptions; fix only from exact logs;
- final gate must succeed only after all canonical workflows on the current head succeed.

## Task 7 — Documentation and production runbook

**Files**
- Modify: `docs/DEPLOY.md`
- Modify: `docs/STAFFSWIPE-READINESS.md` if present/currently used.

**Document**
- `/health` vs `/health/ready` vs `/health/ops` semantics;
- recommended external monitor target for alerting (`/health/ops`) while Docker remains on `/health/ready`;
- scheduler stale threshold;
- how to inspect `scheduler` logs/Sentry after ops alert;
- nightly backup plus periodic manual/automated restore verification;
- off-server backup remains a real production requirement;
- external release gates remain Telegram physical-device and YooKassa test environment.

## Task 8 — Final verification on one SHA

Before claiming completion, load `verification-before-completion` skill and gather fresh evidence.

Required final evidence on one exact head SHA:

- TMA CI: success;
- Backend CI including PostgreSQL and restore verification: success;
- E2E: success;
- Security: success;
- Repository Release Gate: success;
- PR #62: open, Draft, unmerged.

Also confirm external gates remain accurately represented:

- Telegram physical iOS smoke: PENDING unless user/external evidence confirms it;
- Telegram physical Android smoke: PENDING unless user/external evidence confirms it;
- YooKassa test environment payment/webhook/refund/reconciliation smoke: PENDING unless separately confirmed;
- production domain/HTTPS/off-server backup are deployment/operations gates, not implied by repository CI.

## Stop conditions

Stop and debug rather than broadening scope if:

- existing `/health` or `/health/ready` contract changes unexpectedly;
- heartbeat affects scheduler job idempotency;
- Redis health probing mutates application fallback/cache state;
- restore verification touches a non-disposable DB;
- release gate appears green with source runs from another SHA;
- Security/E2E/Backend/TMA regress for unrelated reasons.

No merge to `main` or release-candidate is part of Stage 7.