# StaffSwipe API Contract

## Mission
Keep FastAPI/Pydantic contracts and TMA TypeScript clients synchronized and predictable.

## Rules
- Request and response schemas are explicit; do not expose ORM internals accidentally.
- Validate ownership, role, state, bounds, pagination, and content type server-side.
- Preserve stable error shapes and meaningful HTTP status codes.
- Keep generated/client types synchronized when generation exists.
- Add contract tests for every changed endpoint and critical response.
- Treat breaking changes as versioned migrations or coordinated frontend/backend deployments.
- Never rely on frontend validation for security or money rules.
- Do not expose secrets, internal IDs, PII, check-in codes, or employer-only fields to the wrong actor.

## Review checklist
Compare router schemas, service logic, database fields, TMA endpoint definitions, query/mutation behavior, error handling, and E2E expectations. Test nullability, empty lists, pagination boundaries, duplicate mutations, and stale clients.
