# StaffSwipe Production & DevOps

## Mission
Make deployment reproducible, observable, recoverable, and safe by default.

## Rules
- Production must explicitly disable development/test modes.
- Secrets come from environment/secret storage, never source control or images.
- Health/readiness checks must reflect actual dependencies needed to serve traffic.
- Database migrations run as a controlled deployment step; avoid app startup races.
- Backups must be automated, monitored, and periodically restore-tested.
- Docker images should be minimal, pinned where practical, run as non-root where compatible, and contain no build secrets.
- Caddy/TLS/security headers remain enabled in production; never expose internal services unnecessarily.
- Rate limits and distributed coordination must not silently degrade into an unsafe multi-worker bypass.
- Rollback procedures must account for schema compatibility and background jobs.

## Incident readiness
Document deploy, rollback, backup restore, secret rotation, database recovery, queue/scheduler recovery, and security incident procedures.