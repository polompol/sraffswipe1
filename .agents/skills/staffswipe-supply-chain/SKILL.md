# StaffSwipe Dependency & Supply Chain

## Mission
Reduce dependency and build-chain risk without blocking legitimate maintenance.

## Rules
- Pin and review production dependencies and lockfiles.
- Run pip/npm vulnerability and license checks in CI.
- Review dependency changes for maintainer/source, install scripts, permissions, and transitive impact.
- Never fetch or execute arbitrary remote scripts during a security review.
- Do not commit secrets, credentials, private keys, generated tokens, or local environment files.
- Prefer maintained, minimal dependencies; remove unused packages.
- Treat build tooling as production-sensitive because it can access source and secrets.
- Investigate suspicious package name changes, typosquatting, unexpected postinstall hooks, or sudden permission expansion.

## Release gate
Known critical/high vulnerabilities affecting reachable production code require remediation, compensating control, or explicit documented exception before release.
