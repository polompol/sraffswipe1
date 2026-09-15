# StaffSwipe Trust & Safety, Support and Admin Safety Design

## Goal

Close the production-readiness gap between user reports, support requests and operator actions without adding automatic bans, hidden device fingerprinting or a heavyweight fraud engine.

## Principles

1. A report and a support request are different objects. Reports are moderation signals about a vacancy/user/match; support requests are conversations about the user's own problem.
2. No automatic account ban is triggered by report count. High-risk reasons such as `scam` may be visually prioritized, but an operator decides the outcome.
3. No device fingerprint or covert cross-account tracking is added in this stage.
4. Consequential operator actions require an explicit confirmation and a non-empty reason. The server enforces the reason; the UI is not the security boundary.
5. Existing `AdminActionLog` remains the append-only operator audit trail. New actions reuse it instead of creating a second audit system.
6. Existing report privacy rules remain: users cannot enumerate other users' reports or access another match by guessing an id.

## Support cases

Add a `support_cases` table with:

- `id`: UUID primary key;
- `owner_id`: authenticated principal id, indexed;
- `owner_role`: `seeker|employer` so the same Telegram person can distinguish role-specific requests;
- `topic`: `shift|payment|account|safety|other`;
- `text`: user description, max 2000 characters at the API boundary;
- `status`: `open|answered|closed`;
- `admin_reply`: latest operator reply, empty by default;
- `created_at` and `updated_at`.

The API exposes a human-facing number derived from the UUID (`SS-XXXXXXXX`) rather than a separate sequential identifier. This avoids sequence portability issues and does not expose user counts.

### User API

- `POST /support/cases`: authenticated, rate-limited, creates one case and notifies admins.
- `GET /support/cases`: authenticated, returns only the current principal's cases for the current role, newest first.

Users cannot fetch or mutate arbitrary case ids. A user creates a new case if a new issue occurs; this stage does not add a threaded live-chat system.

### Admin API

- `GET /admin/support?status=open|all`: admin-only queue, newest first.
- `POST /admin/support/{case_id}/reply`: requires a non-empty reply, sets `answered`, records `support.reply`, notifies the owner.
- `POST /admin/support/{case_id}/close`: closes the case, records `support.close`; an optional final reply may be supplied and delivered before closing.

The admin queue may display owner-facing identity/context already available to the operator, but that data is never returned through the user support endpoint.

## User experience

`SupportPage` keeps the current FAQ and Telegram fallback. Above the external Telegram button it adds:

- `Сообщить о проблеме` action;
- topic picker and description form;
- success state: `Обращение SS-XXXXXXXX принято`;
- `Мои обращения` cards showing topic, date, status and operator reply when present.

Telegram support remains available as a fallback, not the primary tracked workflow.

## Operator safety

The following actions become reason-required at the backend and confirmation-required in the TMA admin UI:

- block a user/employer;
- block/remove a vacancy;
- resolve a disputed match as `completed` or `no_show`.

The confirmation sheet shows the exact action and target, requires a reason, and only then enables the final button. The reason is sent to the backend and written into `AdminActionLog` in the same database transaction as the state change.

`warn` and ordinary `report.resolve` remain lighter-weight: they already preserve report state and can include operator text, while they do not directly disable an account or decide a disputed shift outcome.

## Backend authorization and abuse controls

- all support user routes require `current_principal`;
- create is rate-limited to 5 requests per 60 seconds per existing rate-limit semantics;
- admin support routes use the existing `require_admin` dependency;
- support list queries are always scoped by `owner_id` and `owner_role`;
- report logic remains separate and retains target-existence, self-report, duplicate-open-report and match-participant checks;
- no endpoint exposes reporter identity to ordinary users.

## Notifications

- new support case: `notify_admins` with case number, topic and short sanitized preview;
- operator reply/final close message: `notify_owner` to the case owner;
- notification failure must not roll back the already committed support state, matching existing notification semantics.

## Data migration

Create one Alembic migration for `support_cases` with indexes on `(owner_id, owner_role, created_at)` and `(status, created_at)`. The migration must work on PostgreSQL; normal test setup may continue using SQLAlchemy metadata for SQLite tests.

## Testing

### Backend

- create/list own cases;
- current role scoping when one Telegram identity has both roles;
- validation and rate-limit behavior;
- another user cannot see a case;
- non-admin cannot access admin queue/reply/close;
- reply changes status, notifies owner and appends audit row;
- close appends audit row;
- block user/vacancy and match resolution reject blank reasons;
- successful consequential actions persist the same reason in `AdminActionLog`;
- PostgreSQL/Alembic gate covers the migration.

### TMA

- support form cannot submit without topic/text;
- successful create shows case number and refreshes `Мои обращения`;
- answered case displays operator reply;
- critical admin confirmation cannot submit blank reason;
- cancel performs no API mutation;
- confirmed action sends the reason exactly once.

### E2E

At minimum cover the user support create/list flow in the browser and keep the existing full TMA/Backend/PostgreSQL/Security gates green. Admin critical-action behavior is additionally covered by focused component tests because production admin identity is intentionally restricted.

## Non-goals for this stage

- automatic fraud scoring or automatic bans;
- device fingerprinting;
- file attachments in support cases;
- SLA timers/escalation engine;
- multi-message threaded support chat;
- replacing the existing Telegram fallback channel;
- changing the marketplace/report ranking algorithm.
