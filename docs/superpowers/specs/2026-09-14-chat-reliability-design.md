# StaffSwipe Chat Reliability Design

Date: 2026-09-14
Parent: `docs/superpowers/specs/2026-09-14-production-readiness-design.md`
Target integration line: `codex/staffswipe-release-candidate`

## Goal

Make StaffSwipe chat feel reliable under real mobile conditions: subway/network loss, backgrounding, reconnects, duplicate taps and temporary backend failures must not lose or duplicate a user's message.

The user should always understand whether a message is sending, delivered, failed or waiting for connectivity, without needing to reopen the chat or retype text.

## Existing behavior to preserve

Server already provides:
- REST history with stable pagination;
- `client_message_id` support and uniqueness per match/sender;
- duplicate suppression shared by REST and WebSocket persistence;
- no duplicate moderation/notification/broadcast when the same receipt is retried;
- cross-process Redis broadcast;
- WebSocket participant/access revalidation;
- periodic access revalidation while idle;
- rate limits and frame-size limits.

Client already provides:
- history loading and older-message pagination;
- automatic WebSocket reconnect with exponential backoff;
- history invalidation after reconnect;
- message dedupe by server `id` in query cache;
- visible reconnect state in `ChatPage`;
- REST send fallback as the current primary send path.

The new design extends these pieces instead of replacing them.

## Current client gaps

1. `sendMessage(matchId, text)` does not expose/send `client_message_id`.
2. The frontend `Message` type does not carry `clientMessageId`.
3. `ChatPage.deliver()` clears the composer before request completion and restores only raw text on failure; it has no durable outbox item or per-message state.
4. A timeout after the server committed a message can lead the user to manually resend as a new logical message.
5. WebSocket receives messages but does not own outbound delivery receipts.
6. Draft text is local component state and is lost on navigation/app close.
7. History dedupes only by server id, not by client receipt id.
8. Offline/reconnecting information exists, but individual message bubbles do not express pending/error/retry state.

## Architecture

### 1. Message identity

Every non-system message created by this client gets a UUID before the first network attempt.

The same UUID is sent as `client_message_id` on every retry for that logical message. The server remains the source of truth for final message identity.

Frontend message model gains optional `clientMessageId` because old/mock/system payloads may not have one.

### 2. Outbox model

Create a chat-scoped outbox abstraction with one entry per logical outbound message.

Outbox entry fields:
- `clientMessageId`;
- `matchId`;
- `text`;
- `createdAt` (client time for ordering while pending only);
- `status`: `pending | sending | failed`;
- optional last error category;
- retry-attempt metadata used only for UI/backoff decisions.

The outbox is not a second source of truth for confirmed chat history. Once a server message with the same receipt arrives, the outbox entry is removed/reconciled.

### 3. Persistence

Persist unsent/failed outbox entries and draft text locally, namespaced by account identity and match id.

Requirements:
- never mix outbox/drafts between different logged-in users or roles;
- clear data on logout/account switch;
- remove confirmed entries promptly;
- cap stored entries and text size to prevent unbounded storage growth;
- persistence must contain chat text only, no auth token or sensitive secrets.

Use existing project storage patterns if available; otherwise introduce a small versioned local-storage adapter under the chat feature/lib boundary.

### 4. Send path

`sendMessage` API changes to accept `{ text, clientMessageId }` and sends `client_message_id` to backend.

Primary delivery remains REST for acknowledgement simplicity; WebSocket remains real-time inbound transport. This avoids introducing a second outbound protocol state machine unless later evidence requires it.

Send flow:
1. trim/validate text;
2. create UUID;
3. persist outbox entry as `pending`;
4. render optimistic bubble immediately;
5. mark `sending` and POST using the UUID;
6. on success, append/merge server message and remove outbox entry;
7. on ambiguous network error/timeout, mark `failed` but retain UUID;
8. explicit retry or automatic reconnect retry uses the same UUID;
9. server `409` for same UUID/different text is treated as a client integrity error and is not silently retried with altered text.

### 5. Retry policy

Automatic retry is conservative:
- when the app regains connectivity/reconnects, retry failed/pending entries for the active match;
- use the exact same UUID and text;
- never create a replacement UUID for the same bubble;
- limit automatic burst rate and respect server rate-limit responses;
- if server says access is revoked/forbidden, stop retrying and mark the item non-sendable with a clear UI explanation;
- if a message has been confirmed by history/socket before retry, reconcile and remove it instead of sending again.

Manual “Повторить” always reuses the same receipt.

### 6. Reconciliation and dedupe

History cache and socket frames must normalize `client_message_id` to `clientMessageId`.

Deduplication priority:
1. same server message `id`;
2. same `clientMessageId` for the current user's message;
3. otherwise append as new server message.

When confirmed server history contains an outbox receipt, the optimistic bubble is replaced by server truth and removed from outbox even if the original request returned an error.

### 7. Draft behavior

Draft storage is per account + match.

Rules:
- update persistence with a short debounce;
- switching chats preserves each chat's own draft;
- successful send clears only the draft text that was actually submitted, and only if the composer was not edited to a different value while send was in flight;
- failed send does not erase the current composer;
- logout/account switch clears or isolates previous-user drafts.

### 8. UI states

Outbound bubble state:
- `sending`: subtle spinner/clock and reduced opacity only if needed;
- confirmed: normal bubble, no noisy success icon required;
- failed: compact “Не отправилось · Повторить” action;
- blocked/revoked: “Чат больше недоступен” and no retry button.

Chat-level connection banner:
- connected: hidden in normal operation;
- reconnecting: small non-blocking “Восстанавливаем связь…”;
- offline: “Нет сети — сообщения отправятся после подключения”;
- backend unavailable: recovery-oriented error;
- access revoked: persistent terminal state with navigation back.

Do not use repeated toast spam for every reconnect attempt. Bubble/connection state is the primary feedback surface.

### 9. Component boundaries

Target decomposition, only if useful during implementation:

- `useChatHistory` — confirmed server history/pagination and reconciliation helpers;
- `useChatSocket` — inbound live connection/reconnect/access terminal events;
- `useChatOutbox` — optimistic items, persistence, retry/reconciliation;
- `MessageList` — confirmed + optimistic merged presentation and scroll behavior;
- `MessageComposer` — draft persistence, validation and submit;
- `ChatConnectionState` — connection/offline/access banner.

`ChatPage` remains the coordinator for shift-specific actions and chat composition but should no longer own low-level send retry/draft mechanics.

## Server changes

Server changes should be minimal because receipt idempotency already exists.

Verify/add only what tests prove missing:
- response schema must expose `client_message_id` consistently for REST/history/WS;
- invalid/conflicting receipt errors are stable enough for client recovery;
- duplicate REST retry cannot trigger second notification/moderation/broadcast;
- history pagination and duplicate receipt race tests remain green;
- WebSocket access revocation remains fail-closed.

Do not add a second message queue/database unless current primitives fail required tests.

## Mock/demo compatibility

Mock API must accept the same `clientMessageId` send contract and return it. Demo mode should exercise pending/success/error UI deterministically through tests; it must not diverge structurally from backend mode.

## Accessibility and ergonomics

- retry action has an accessible label and minimum touch target;
- pending/error status is not color-only;
- screen reader announces terminal send failure without repeatedly announcing reconnect attempts;
- composer stays visible above Telegram keyboard/safe area;
- failed/pending metadata does not make bubbles jump in width/position significantly;
- reduced-motion users do not receive animated reconnect/pending loops beyond minimal progress indication.

## Failure-mode matrix

### Request times out after server commit
History/socket later returns same `clientMessageId`; client reconciles optimistic/failed entry to confirmed server message. Retry with same UUID is safe if it happens first.

### Request fails before server commit
Entry remains failed; retry with same UUID creates exactly one server message.

### User taps send repeatedly
First tap creates one outbox item; composer is detached from that item. UI disables duplicate submission of the same in-flight composer action long enough to prevent accidental double-tap, while intentionally sending identical text later still creates a new UUID.

### App closes while message pending
Persisted outbox rehydrates. On active-chat/open/connectivity recovery, reconcile history first and then retry only receipts not already confirmed.

### Access revoked while offline
On reconnect/history/send, server denial moves chat to terminal unavailable state; outbox stops retrying.

### Redis unavailable
REST acknowledgement still determines sender success. Server local broadcast degradation must not create duplicate persistence; reconnect/history fills missed real-time delivery.

### Rate limit
Outbox item remains retryable. UI explains delay; automatic retries honor a cooldown and do not hammer the endpoint.

## Testing plan requirements

### Frontend unit/component
- UUID generated once per logical send;
- retry reuses same UUID;
- timeout retains failed outbox item;
- successful response reconciles optimistic item;
- socket/history confirmation reconciles a previously failed item;
- duplicate server id/client id does not produce two bubbles;
- drafts persist per match and per account;
- successful send does not erase newer composer edits;
- reconnect retries only unresolved entries;
- revoked access stops retry;
- rate limit cooldown behavior;
- logout/account change isolates/clears persistence;
- connection and bubble status accessibility.

### Backend
- REST retry same receipt/same text returns same logical message;
- same receipt/different text rejects;
- duplicate concurrent insert does not duplicate notification/moderation/broadcast;
- history exposes receipt id;
- WebSocket repeat uses same guarantees;
- revoked socket cannot continue receiving/sending;
- PostgreSQL race coverage.

### E2E
- send on healthy connection;
- simulated request timeout then history reconciliation without duplicate bubble;
- offline send → reconnect → one confirmed message;
- refresh/reopen with persisted failed message → reconciliation/retry;
- rapid double tap;
- access revoked while chat is open;
- old-history pagination while new message arrives;
- small viewport + keyboard composer visibility.

## Definition of Done

Chat block is complete only when:
- server receipt/idempotency invariants remain green on SQLite and PostgreSQL;
- frontend outbox/draft/reconnect behavior is covered by tests;
- no duplicate messages appear under timeout/retry/race scenarios;
- failed messages are recoverable without retyping;
- app restart/background/network loss does not silently lose user intent;
- inaccessible chats fail closed;
- TMA lint/typecheck/unit/build pass;
- relevant Playwright E2E passes;
- Security workflow passes;
- Project Brain and user-facing text catalog are updated;
- no unresolved Critical or Important review findings remain.
