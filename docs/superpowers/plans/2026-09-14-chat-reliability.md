# StaffSwipe Chat Reliability Implementation Plan

Date: 2026-09-14
Design: `docs/superpowers/specs/2026-09-14-chat-reliability-design.md`
Branch: `codex/staffswipe-production-readiness`

## Objective

Make the existing StaffSwipe chat resilient to duplicate taps, timeouts, network loss, reconnects, navigation and app restarts without creating duplicate messages or losing a user's unfinished text.

The server-side receipt/idempotency path already exists. This plan extends the TMA so it actually uses that contract and exposes understandable delivery states to the user.

## Guardrails

- Keep REST as the acknowledged outbound send path; WebSocket remains inbound real-time delivery.
- Generate one client receipt UUID per logical message and reuse it forever for retries of that message.
- Do not add a new server-side message queue.
- Do not weaken WebSocket participant/access checks.
- Do not store auth tokens inside chat persistence. Chat persistence may contain only the user's draft/outbox text plus message receipt/status metadata.
- Namespace persisted chat data by current account identity and role; clear the current account's persisted chat state on logout/account switch.
- Do not redesign unrelated shift controls in `ChatPage.tsx` while extracting chat mechanics.
- Every behavior change starts with a failing test, then the smallest implementation that makes it pass.

---

## Task 1 — Prove and expose the client receipt contract

### Files

Modify:
- `tma/src/types/domain.ts`
- `tma/src/api/endpoints.ts`
- `tma/src/api/mock.ts`
- `tma/src/features/chat/useChatSocket.ts`
- `tma/src/features/chat/useChatHistory.ts`

Create:
- `tma/src/features/chat/messageIdentity.test.ts`
- `tma/src/features/chat/messageIdentity.ts`

Verify existing backend tests:
- `backend/tests/test_chat_delivery_integrity.py`
- `backend/tests/test_chat_history.py`
- `backend/tests/test_ws_chat_limits.py`

### Step 1.1 — RED: normalize and deduplicate by receipt

Create a focused test module for message identity. The tests must fail before implementation because `Message` has no `clientMessageId` and history dedupe only compares server ids.

Required tests:

```ts
import { describe, expect, it } from "vitest";
import { mergeConfirmedMessage, normalizeSocketMessage } from "./messageIdentity";
import type { Message } from "@/types/domain";

describe("chat message identity", () => {
  it("maps websocket client_message_id to clientMessageId", () => {
    expect(normalizeSocketMessage({
      id: "srv-1",
      client_message_id: "11111111-1111-4111-8111-111111111111",
      sender_id: "u1",
      text: "Привет",
      is_system: false,
      created_at: "2026-09-14T10:00:00Z",
    }).clientMessageId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("does not duplicate the same server id", () => {
    const current: Message[] = [{
      id: "srv-1", senderId: "u1", text: "Привет", isSystem: false,
      createdAt: "2026-09-14T10:00:00Z", clientMessageId: "c1",
    }];
    expect(mergeConfirmedMessage(current, current[0], "u1")).toHaveLength(1);
  });

  it("replaces an earlier same-receipt copy instead of appending another bubble", () => {
    const old: Message = {
      id: "temporary-or-old", senderId: "u1", text: "Привет", isSystem: false,
      createdAt: "2026-09-14T10:00:00Z", clientMessageId: "c1",
    };
    const confirmed = { ...old, id: "srv-1", createdAt: "2026-09-14T10:00:01Z" };
    expect(mergeConfirmedMessage([old], confirmed, "u1")).toEqual([confirmed]);
  });
});
```

Run via the normal TMA test workflow and confirm failure for missing module/fields before implementation.

### Step 1.2 — GREEN: introduce one normalization/merge boundary

Implement `messageIdentity.ts` with:

```ts
export function normalizeSocketMessage(raw: any): Message {
  return {
    id: String(raw.id),
    clientMessageId: raw.client_message_id ? String(raw.client_message_id) : undefined,
    senderId: String(raw.sender_id),
    text: String(raw.text ?? ""),
    isSystem: Boolean(raw.is_system),
    createdAt: raw.created_at ?? new Date().toISOString(),
  };
}
```

`mergeConfirmedMessage(list, msg, myId)` must:
1. replace exact server-id match;
2. for the current user's non-system messages only, replace same `clientMessageId` match;
3. otherwise append.

Add optional `clientMessageId?: string` to `Message`.

Update `useChatSocket` to call `normalizeSocketMessage`.

Update `useChatHistory.appendMessage` to use `mergeConfirmedMessage` and receive `myId` if needed, rather than raw id-only dedupe.

### Step 1.3 — RED/GREEN: send API carries the receipt

Add tests around a small pure request-body helper in `messageIdentity.ts` or a directly testable endpoint helper:

```ts
expect(messageInput("hello", "c1")).toEqual({
  text: "hello",
  client_message_id: "c1",
});
```

Change the public endpoint contract to:

```ts
export async function sendMessage(
  matchId: string,
  input: { text: string; clientMessageId: string },
): Promise<Message>
```

Backend request body must be:

```json
{
  "text": "...",
  "client_message_id": "..."
}
```

Update mock send behavior to return the same receipt.

### Step 1.4 — Backend contract verification

Do not change backend unless a test proves a gap.

Run/inspect:

```bash
cd backend
python -m pytest -q tests/test_chat_delivery_integrity.py tests/test_chat_history.py tests/test_ws_chat_limits.py
```

Confirm REST/history/WS responses expose the receipt and duplicate retries do not duplicate notification/moderation/broadcast. If any contract test is missing, add it RED-first to `test_chat_delivery_integrity.py`.

### Task 1 checkpoint

Run:

```bash
cd tma
npm test -- --run src/features/chat/messageIdentity.test.ts
npm run typecheck
```

Commit only when green.

---

## Task 2 — Versioned per-account chat persistence

### Files

Modify:
- `tma/src/lib/storage.ts`
- `tma/src/store/session.ts`

Create:
- `tma/src/features/chat/chatPersistence.ts`
- `tma/src/features/chat/chatPersistence.test.ts`

### Persisted model

```ts
export type OutboxStatus = "pending" | "sending" | "failed" | "blocked";

export interface OutboxEntry {
  clientMessageId: string;
  matchId: string;
  text: string;
  createdAt: string;
  status: OutboxStatus;
  attempts: number;
  lastError?: "network" | "rate_limit" | "forbidden" | "server" | "integrity";
  retryAfter?: number;
}

interface PersistedChatStateV1 {
  version: 1;
  drafts: Record<string, string>;
  outbox: OutboxEntry[];
}
```

Storage key shape:

```text
ss_chat_v1:<role>:<userId>
```

The central `LS` registry stores the prefix only, e.g. `chat: "ss_chat_v1"`.

Limits:
- at most 100 outbox entries per account;
- max 2000 characters per outbox text;
- max 2000 characters per draft;
- malformed/corrupt storage resets safely to an empty state;
- only known status/error values are accepted during hydration.

### Step 2.1 — RED persistence tests

Required tests:
- different `userId` values cannot see each other's drafts/outbox;
- different roles cannot share the same persisted state;
- draft survives module reload/load-save cycle;
- upserting an outbox entry by receipt does not duplicate it;
- removing confirmed receipt deletes it;
- oversized/corrupt data is sanitized;
- clearAccount removes only the selected account state;
- cap keeps the newest 100 entries.

### Step 2.2 — GREEN persistence implementation

Implement only pure localStorage helpers; no React in this module.

Suggested API:

```ts
export function chatStorageKey(userId: string, role: AppRole): string;
export function loadChatState(userId: string, role: AppRole): PersistedChatStateV1;
export function saveDraft(userId: string, role: AppRole, matchId: string, text: string): void;
export function loadDraft(userId: string, role: AppRole, matchId: string): string;
export function upsertOutbox(userId: string, role: AppRole, entry: OutboxEntry): void;
export function removeOutbox(userId: string, role: AppRole, clientMessageId: string): void;
export function loadOutbox(userId: string, role: AppRole, matchId?: string): OutboxEntry[];
export function clearChatAccount(userId: string, role: AppRole): void;
```

All localStorage access must be try/catch safe for restricted/private WebViews.

### Step 2.3 — Session cleanup/isolation

Add RED tests to `tma/src/store/session.test.ts` proving:
- logout clears current account chat state before removing `uid/role`;
- logging into a different account clears the previous account's pending chat state;
- logging back into the same identity does not erase its active state merely because token refreshed.

Implement cleanup with a small import from `chatPersistence`; avoid circular imports back into session.

### Task 2 checkpoint

Run:

```bash
cd tma
npm test -- --run src/features/chat/chatPersistence.test.ts src/store/session.test.ts
npm run typecheck
```

Commit when green.

---

## Task 3 — Outbox state machine and safe retry

### Files

Create:
- `tma/src/features/chat/useChatOutbox.ts`
- `tma/src/features/chat/useChatOutbox.test.tsx`

Modify as needed:
- `tma/src/lib/errors.ts`
- `tma/src/api/client.ts` only if error classification cannot be done through existing error shape

### Step 3.1 — Secure receipt generation

Implement helper in the outbox module or a tiny `clientReceipt.ts` module:

```ts
export function newClientMessageId(): string
```

Use `crypto.randomUUID()` when present; fallback uses `crypto.getRandomValues()` to build RFC4122 v4. Never use `Math.random()` for receipt identity.

RED tests:
- generated id has UUID-v4 shape;
- supplied/mock generator can make deterministic tests;
- retry path never calls generator again for an existing entry.

### Step 3.2 — Outbox hook contract

Hook inputs:

```ts
interface UseChatOutboxArgs {
  matchId: string;
  userId: string;
  role: AppRole;
  confirmedMessages: Message[];
  live: boolean;
  appendConfirmed: (message: Message) => void;
}
```

Hook outputs:

```ts
{
  entries,
  sendText,
  retry,
  reconcileConfirmed,
  flush,
  terminalAccessLost,
}
```

`sendText(text)`:
1. validate trimmed text;
2. create exactly one receipt;
3. persist `pending`;
4. expose optimistic entry immediately;
5. transition to `sending`;
6. call `sendMessage` with same receipt;
7. on success append confirmed + remove outbox;
8. on ambiguous failure mark `failed` preserving receipt/text.

### Step 3.3 — RED hook/state tests

Required tests using a small render harness:
- first send generates exactly one receipt;
- successful send removes entry and calls `appendConfirmed`;
- network rejection leaves one `failed` entry;
- manual retry reuses same receipt;
- confirmed history with same receipt removes a failed entry without another POST;
- reconnect/live transition flushes unresolved active-match entries only;
- rate limit marks retryable failure and respects cooldown before auto flush;
- 401/403 access loss marks affected entries `blocked` and stops automatic retries;
- 409 same-receipt/different-text integrity error becomes terminal `blocked/integrity`, never generates a replacement UUID;
- repeated `sendText` invocation caused by a double-click guard does not submit the same composer action twice;
- entries from another match are not flushed while current match is active.

### Step 3.4 — Error classification

Reuse existing `ApiError`/Axios status handling. Keep categories small:
- `forbidden`: 401/403;
- `rate_limit`: 429, optionally parse Retry-After if already available;
- `integrity`: 409 receipt conflict;
- `server`: deterministic non-ambiguous 4xx/5xx not covered above;
- `network`: no trustworthy response/timeout.

For 5xx after an outbound request, keep receipt retryable because server commit status may be ambiguous.

### Step 3.5 — Reconciliation before retry

When confirmed messages change, remove any outbox entry whose receipt appears in server truth before auto retry runs.

Auto flush rules:
- only active match;
- only `pending`/`failed`;
- not before `retryAfter`;
- never `blocked`;
- sequential/small concurrency to avoid rate-limit bursts;
- same receipt and immutable text.

### Task 3 checkpoint

Run:

```bash
cd tma
npm test -- --run src/features/chat/useChatOutbox.test.tsx
npm run typecheck
npm run lint
```

Commit when green.

---

## Task 4 — Durable drafts without erasing newer edits

### Files

Create:
- `tma/src/features/chat/useChatDraft.ts`
- `tma/src/features/chat/useChatDraft.test.tsx`

Modify:
- `tma/src/features/chat/ChatPage.tsx`

### Step 4.1 — RED draft tests

Required tests:
- draft loads from current account+match on mount;
- typing persists after debounce;
- switching match stores independent drafts;
- successful send clears only the submitted text;
- if user typed new text while previous message was sending, success does not clear the newer text;
- failed send does not clear current draft;
- account/role namespace is respected.

### Step 4.2 — GREEN hook

Suggested contract:

```ts
const {
  text,
  setText,
  snapshotForSend,
  clearIfUnchanged,
} = useChatDraft({ userId, role, matchId });
```

Debounce localStorage writes around 150–300 ms. Flush latest value on unmount if needed.

Do not persist empty keys indefinitely; remove empty draft entries.

### Task 4 checkpoint

Run targeted tests and typecheck.

---

## Task 5 — Integrate outbox/drafts into ChatPage with user-visible states

### Files

Modify:
- `tma/src/features/chat/ChatPage.tsx`
- `tma/src/index.css` or the existing chat-specific style area only

Create if decomposition improves clarity:
- `tma/src/features/chat/MessageList.tsx`
- `tma/src/features/chat/MessageComposer.tsx`
- `tma/src/features/chat/ChatConnectionState.tsx`
- corresponding component tests

### Step 5.1 — RED component behavior tests

Create `tma/src/features/chat/ChatPage.delivery.test.tsx` or smaller component tests proving:
- pending message appears immediately after send;
- pending bubble has non-color-only accessible status text/label;
- failed message renders `Не отправилось · Повторить`;
- retry control has an accessible name and usable button semantics;
- offline/reconnecting banner does not block reading history;
- access-revoked state removes retry/send affordances and explains the chat is unavailable;
- composer text survives navigation/remount;
- rapid send button double tap produces one outbox entry for one composer submission;
- small viewport layout keeps composer reachable (component/CSS assertion where practical).

### Step 5.2 — Merge confirmed + optimistic presentation

Render confirmed server messages plus unresolved outbox entries in chronological order. Avoid placing an optimistic bubble twice when a receipt has already been confirmed.

Optimistic bubble uses local `createdAt` only while unresolved; confirmed server timestamp replaces it.

### Step 5.3 — Connection states

Replace noisy reconnect toast behavior with compact state surface:
- reconnecting: `Восстанавливаем связь…`;
- browser offline: `Нет сети — сообщения отправятся после подключения`;
- terminal access loss: `Чат больше недоступен`;
- normal connected state: no persistent banner.

Use `navigator.onLine` plus socket state only as UI hints; server response remains authoritative.

Extend `useChatSocket` handler from boolean `onLive` to a small state only if required:

```ts
type ChatConnection = "connected" | "reconnecting" | "offline" | "access_lost";
```

If server closes with 4401/4403, surface terminal access state and stop reconnect loop rather than retry forever.

### Step 5.4 — Composer ergonomics

- preserve existing Telegram safe-area/keyboard behavior;
- disable send for whitespace/empty text;
- do not erase text before an outbox item exists durably;
- once outbox owns the submitted snapshot, composer may clear immediately for a responsive feel;
- if persistence write fails, keep composer text and surface recoverable error rather than pretending the message is queued;
- quick replies use the same outbox path and receipt semantics.

### Step 5.5 — Accessibility

- status is exposed via text or `aria-label`, not color alone;
- one terminal send failure may use an `aria-live` region; repeated reconnect attempts must not spam announcements;
- retry touch target follows existing button sizing conventions;
- reduced-motion CSS avoids pulsing/infinite motion for pending/reconnecting indicators.

### Task 5 checkpoint

Run:

```bash
cd tma
npm run lint
npm run typecheck
npm test
npm run build
```

Commit when all are green.

---

## Task 6 — E2E chat recovery scenarios

### Files

Inspect existing `e2e/` structure first and follow its fixture conventions.

Modify/create narrowly scoped Playwright specs for chat reliability.

Required E2E scenarios:
1. healthy message send → exactly one bubble;
2. simulated POST response loss/timeout after server commit → refresh/history reconciliation → still one bubble;
3. offline send → failed/pending bubble → reconnect → one confirmed message;
4. reload with persisted failed entry → history reconciliation or safe retry with same receipt;
5. rapid double tap on send → one logical message;
6. access revoked while chat open → terminal unavailable state, no further retry loop;
7. load older page while a live new message arrives → neither duplicate nor scroll corruption;
8. representative small mobile viewport with keyboard/composer area visible.

Do not fake a scenario solely in frontend state if the E2E harness can drive the actual API/route interception.

### Task 6 checkpoint

Run project E2E workflow/script and inspect Playwright failures/artifacts if any.

---

## Task 7 — Backend and PostgreSQL chat race verification

### Files

Prefer existing tests. Add tests only for unproven guarantees.

Potential additions to `backend/tests/test_chat_delivery_integrity.py`:
- history response contains `client_message_id` for an idempotent REST send;
- repeated same receipt after ambiguous client retry returns the same server id;
- concurrent same-receipt insertion emits only one notification/moderation/broadcast (if not already proven);
- same receipt/different text returns 409;
- WebSocket duplicate acknowledgement never broadcasts a second copy;
- participant revocation blocks delivery to an already-open socket.

Run full backend test suite on SQLite and PostgreSQL because receipt races rely on database uniqueness semantics.

### Task 7 checkpoint

Required green evidence:
- Backend lint/FastAPI job;
- PostgreSQL job.

---

## Task 8 — Documentation, review and final chat release gate

### Files

Modify:
- `docs/PROJECT_BRAIN.md`
- `docs/ТЕКСТЫ.md` only through the repository's generator if code changes alter catalogued user text
- chat/operational docs only where behavior changed

### Step 8.1 — Update Project Brain accurately

Record:
- client now uses server receipt idempotency;
- durable per-account drafts/outbox;
- retry/reconnect/access-lost semantics;
- exact test/CI evidence and head SHA;
- remaining next stage: explicit shift lifecycle state machine.

Do not state full pilot/production readiness from chat completion alone.

### Step 8.2 — Full verification

Run/inspect on the final chat head:
- Backend CI: lint/FastAPI + PostgreSQL;
- TMA lint/typecheck/test/build via its workflow or `scripts/verify.sh` path;
- E2E;
- Security: gitleaks, dependency audits, CodeQL Python/JS, critical gate.

### Step 8.3 — Code review gate

Review branch diff from the prior verified checkpoint. Focus on:
- duplicate-send paths;
- persistence leaking across identities;
- accidental storage of auth/secrets;
- blocked/revoked chat retry loops;
- draft loss;
- outbox growth bounds;
- stale closure/reconnect races;
- UI dead ends on small Telegram viewports.

No unresolved Critical/Important review findings may remain.

### Step 8.4 — PR checkpoint

Keep PR #62 draft while later production-readiness stages remain. Update its body with chat verification evidence and mark Stage 2 complete only after all gates above are green.

---

## Execution order and commit discipline

Use small commits aligned to RED/GREEN milestones:

1. `test: define chat client receipt contract` (RED)
2. `feat: propagate chat client receipt identity` (GREEN)
3. `test: define durable chat persistence` (RED)
4. `feat: persist chat drafts and outbox per account` (GREEN)
5. `test: define chat outbox retry semantics` (RED)
6. `feat: add idempotent chat outbox` (GREEN)
7. `test: define durable chat draft behavior` (RED)
8. `feat: preserve chat drafts across navigation` (GREEN)
9. `test: define chat delivery UI states` (RED)
10. `feat: integrate resilient chat delivery UX` (GREEN)
11. `test: cover chat recovery end to end`
12. fixes discovered by E2E/backend/PostgreSQL/security verification
13. `docs: checkpoint chat reliability`

Do not combine a failing test and its implementation into the same commit when a separate RED commit is practical; the branch history should retain evidence that the regression test failed before the fix.

## Final success criteria for this plan

Stage 2 is complete only when all of the following are true on one final head:

- one user message has one receipt across all retries;
- timeout after server commit cannot produce a duplicate bubble/message;
- draft survives navigation/reopen;
- failed outbound message survives reopen and can be retried without retyping;
- reconnect reconciliation happens before resend;
- account switch/logout cannot expose previous account drafts/outbox;
- access-revoked chats stop retries and fail closed;
- quick replies use the exact same safe send path;
- storage remains bounded and contains no auth secrets;
- frontend lint/typecheck/unit/build are green;
- backend SQLite and PostgreSQL tests are green;
- relevant E2E scenarios are green;
- Security workflow is green;
- docs/checkpoint are current;
- review has no unresolved Critical or Important finding.
