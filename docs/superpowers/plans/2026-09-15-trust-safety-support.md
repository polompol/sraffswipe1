# Trust, Safety & Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tracked in-app support cases and make consequential moderation actions require explicit reasons and confirmation while preserving the existing manual-moderation model.

**Architecture:** Introduce a small `SupportCase` persistence/API vertical separate from moderation `Report`. Reuse the existing `AdminActionLog`, `notify_admins`, `notify_owner`, auth/rate-limit infrastructure and current admin workspace. Frontend work stays within the existing SupportPage/AdminPage patterns; no new global state store is introduced.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL/SQLite test matrix, React, TypeScript, TanStack Query, Vitest/Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-trust-safety-support-design.md`

## Global Constraints

- No automatic account bans from report count.
- No hidden device fingerprinting or covert multi-account tracking.
- Consequential admin mutations must be reason-required on the server.
- Existing `AdminActionLog` is the only operator audit trail.
- Ordinary users may only read support cases owned by their current principal id and role.
- Telegram support remains a fallback channel.
- Preserve existing report privacy/authorization rules.

---

### Task 1: Support case persistence and user API

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/app/routers/support.py`
- Modify: `backend/app/main.py`
- Create: `backend/migrations/versions/c6d7e8f9a0b1_support_cases.py`
- Create: `backend/tests/test_support_cases.py`

**Interfaces:**
- Produces model `SupportCase` with fields `id`, `owner_id`, `owner_role`, `topic`, `text`, `status`, `admin_reply`, `created_at`, `updated_at`.
- Produces `POST /support/cases` and `GET /support/cases`.
- Response shape: `{id, number, topic, text, status, adminReply, createdAt, updatedAt}` where `number = "SS-" + id[:8].upper()`.

- [ ] **Step 1: Write failing backend tests**

Create tests covering create/list, role scoping, validation and rate limiting. Core assertions:

```python
created = client.post(
    "/support/cases",
    headers=seeker_h,
    json={"topic": "payment", "text": "Не вижу ответ по оплате"},
)
assert created.status_code == 201
assert created.json()["number"].startswith("SS-")

rows = client.get("/support/cases", headers=seeker_h).json()
assert [row["id"] for row in rows] == [created.json()["id"]]
```

Also create the same Telegram identity in the opposite role and assert the role-specific list does not leak the first role's case.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd backend && pytest -q tests/test_support_cases.py`
Expected: failures because the routes/model do not exist.

- [ ] **Step 3: Implement model/router/migration minimally**

`SupportCase` uses indexed owner/status timestamps. The router uses `current_principal` and `rate_limit("support_case", 5, 60)`. Request validation:

```python
class SupportCaseIn(BaseModel):
    topic: Literal["shift", "payment", "account", "safety", "other"]
    text: str = Field(min_length=5, max_length=2000)
```

Create commits before notification side-effects; `notify_admins` receives only number/topic/a short preview.

Migration revision is `c6d7e8f9a0b1`, down revision `b7e2d4f6a8c1`.

- [ ] **Step 4: Run focused backend tests**

Run: `cd backend && pytest -q tests/test_support_cases.py`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(support): add tracked user support cases`

---

### Task 2: Admin support queue, replies and audit

**Files:**
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/tests/test_support_cases.py`
- Modify: `backend/tests/test_admin_audit.py`

**Interfaces:**
- Produces `GET /admin/support?status=open|all`.
- Produces `POST /admin/support/{case_id}/reply` with `{reply: string}`.
- Produces `POST /admin/support/{case_id}/close` with `{reply?: string}`.
- Audit actions: `support.reply`, `support.close`.

- [ ] **Step 1: Add failing authorization/lifecycle tests**

Assert ordinary users get 403 for the admin queue and mutation routes. Assert reply sets `answered`, stores `admin_reply`, and creates an audit row containing the case id. Assert close sets `closed` and also audits.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd backend && pytest -q tests/test_support_cases.py tests/test_admin_audit.py`
Expected: new admin-support assertions fail because routes are absent.

- [ ] **Step 3: Implement admin routes**

Use existing `require_admin`, `record_admin_action`, `notify_owner`. Reply validation:

```python
class SupportReplyIn(BaseModel):
    reply: str = Field(min_length=2, max_length=2000)
```

For close, allow optional trimmed final reply but always set status `closed` and update `updated_at`. Record audit before commit in the same transaction.

- [ ] **Step 4: Run focused tests**

Run: `cd backend && pytest -q tests/test_support_cases.py tests/test_admin_audit.py`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(admin): add audited support queue`

---

### Task 3: Require reasons for critical moderation actions

**Files:**
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/routers/matches.py`
- Modify: `backend/tests/test_admin_audit.py`
- Modify: relevant match-resolution backend test file discovered from current tests before edit
- Modify: `tma/src/api/endpoints.ts`
- Create: `tma/src/features/admin/AdminConfirmSheet.tsx`
- Create: `tma/src/features/admin/AdminConfirmSheet.test.tsx`
- Modify: `tma/src/features/admin/TodayTab.tsx`

**Interfaces:**
- `POST /admin/users/{id}/block` and `/admin/vacancies/{id}/block` require JSON `{reason}` with trimmed length >= 3.
- Admin match resolution requires `{outcome, reason}` where outcome is `completed|no_show` and trimmed reason length >= 3.
- Frontend endpoint helpers accept the reason and send it exactly once.

- [ ] **Step 1: Add failing backend tests for blank reasons**

Assertions:

```python
r = client.post(f"/admin/users/{victim_id}/block", headers=admin_h, json={"reason": "  "})
assert r.status_code == 422
```

Repeat for vacancy block and match resolution. Existing successful tests must be updated to supply explicit reasons.

- [ ] **Step 2: Run focused backend tests and verify RED**

Run the admin audit and match resolution files only. Expected: blank reason is currently accepted.

- [ ] **Step 3: Enforce reason-required DTOs server-side**

Use a Pydantic constrained validator/model rather than checking only in React. Preserve audit reason exactly after trimming.

- [ ] **Step 4: Add failing TMA confirmation tests**

`AdminConfirmSheet.test.tsx` asserts:
- confirm disabled when reason is blank;
- cancel calls no mutation;
- submit passes the trimmed reason once;
- busy state prevents a duplicate confirm.

- [ ] **Step 5: Implement `AdminConfirmSheet` and wire critical TodayTab actions**

The sheet shows action title, target information, consequence copy and a textarea. `TodayTab` opens it for block-user, block-vacancy and disputed-match outcomes, then calls the existing action helper only after confirmation.

- [ ] **Step 6: Run focused frontend tests**

Run: `cd tma && npm test -- --run src/features/admin/AdminConfirmSheet.test.tsx src/features/admin/AdminPage.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat(admin): confirm critical moderation actions`

---

### Task 4: In-app support UI and operator queue UI

**Files:**
- Modify: `tma/src/api/endpoints.ts`
- Modify: `tma/src/features/support/SupportPage.tsx`
- Create: `tma/src/features/support/SupportPage.test.tsx`
- Create: `tma/src/features/admin/SupportQueue.tsx`
- Create: `tma/src/features/admin/SupportQueue.test.tsx`
- Modify: `tma/src/features/admin/TodayTab.tsx`

**Interfaces:**
- TMA types mirror the backend support-case response.
- `createSupportCase(topic, text)`, `fetchSupportCases()`, `fetchAdminSupport(status)`, `replySupportCase(id, reply)`, `closeSupportCase(id, reply?)`.

- [ ] **Step 1: Write failing SupportPage tests**

Assert topic + minimum description are required, success shows returned case number, query refresh displays the created card, and an answered case renders `adminReply`.

- [ ] **Step 2: Run focused test and verify RED**

Run: `cd tma && npm test -- --run src/features/support/SupportPage.test.tsx`
Expected: FAIL because tracked support UI/endpoints do not exist.

- [ ] **Step 3: Implement SupportPage tracked workflow**

Keep FAQ and external Telegram link. Add a compact `Сообщить о проблеме` form and `Мои обращения` section using TanStack Query. Do not persist support text locally.

- [ ] **Step 4: Write failing admin queue tests**

Assert open cases render with number/topic/owner info, reply requires text, successful reply refreshes the queue, and close invokes the close endpoint once.

- [ ] **Step 5: Implement `SupportQueue` and place it in TodayTab**

Use the existing operator visual primitives and `act()` helper. Do not mix support cases into moderation `Report`; render them as a separate section.

- [ ] **Step 6: Run focused frontend tests**

Run: `cd tma && npm test -- --run src/features/support/SupportPage.test.tsx src/features/admin/SupportQueue.test.tsx src/features/admin/AdminPage.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat(tma): add tracked support workflow`

---

### Task 5: Browser flow and full release gates

**Files:**
- Create: `e2e/tests/support.spec.ts`
- Modify only if an E2E-discovered product defect requires it.

**Interfaces:**
- Browser test creates a logged-in user, opens `/#/support`, submits a support case, sees `SS-...`, reloads and still sees the case.

- [ ] **Step 1: Add E2E support flow**

Use existing `login`/`openApp` harness helpers; do not mock the support API.

- [ ] **Step 2: Run E2E and fix only proven defects**

Run the project E2E command from the existing workflow/harness. Expected: support case survives reload and no horizontal layout regression occurs on the default mobile viewport.

- [ ] **Step 3: Run final repository gates on one SHA**

Verify all four PR workflows on the same final head commit:
- TMA CI: success;
- Backend CI including PostgreSQL: success;
- E2E: success;
- Security: success.

- [ ] **Step 4: Commit any E2E-only test addition**

Commit message: `test: cover tracked support flow`

- [ ] **Step 5: Re-verify PR #62 metadata**

PR remains Draft and unmerged after this stage; report final head SHA and gate status. Do not merge to the release candidate/main as part of this task.
