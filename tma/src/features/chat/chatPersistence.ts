import type { AppRole } from "@/types/domain";

const CHAT_STORAGE_PREFIX = "ss_chat_v1";
const MAX_TEXT = 2000;
const MAX_OUTBOX = 100;

export type OutboxStatus = "pending" | "sending" | "failed" | "blocked";
export type OutboxError =
  | "network"
  | "rate_limit"
  | "forbidden"
  | "server"
  | "integrity";

export interface OutboxEntry {
  clientMessageId: string;
  matchId: string;
  text: string;
  createdAt: string;
  status: OutboxStatus;
  attempts: number;
  lastError?: OutboxError;
  retryAfter?: number;
}

export interface PersistedChatStateV1 {
  version: 1;
  drafts: Record<string, string>;
  outbox: OutboxEntry[];
}

const OUTBOX_STATUSES = new Set<OutboxStatus>([
  "pending",
  "sending",
  "failed",
  "blocked",
]);
const OUTBOX_ERRORS = new Set<OutboxError>([
  "network",
  "rate_limit",
  "forbidden",
  "server",
  "integrity",
]);

function emptyState(): PersistedChatStateV1 {
  return { version: 1, drafts: {}, outbox: [] };
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeOutboxEntry(value: unknown): OutboxEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.clientMessageId !== "string" || !row.clientMessageId ||
    typeof row.matchId !== "string" || !row.matchId ||
    typeof row.text !== "string" ||
    typeof row.createdAt !== "string" || !row.createdAt ||
    typeof row.status !== "string" ||
    !OUTBOX_STATUSES.has(row.status as OutboxStatus) ||
    !finiteNumber(row.attempts)
  ) {
    return null;
  }

  const attempts = Math.max(0, Math.floor(row.attempts));
  const lastError =
    typeof row.lastError === "string" && OUTBOX_ERRORS.has(row.lastError as OutboxError)
      ? row.lastError as OutboxError
      : undefined;
  const retryAfter = finiteNumber(row.retryAfter) ? row.retryAfter : undefined;

  return {
    clientMessageId: row.clientMessageId,
    matchId: row.matchId,
    text: row.text.slice(0, MAX_TEXT),
    createdAt: row.createdAt,
    status: row.status as OutboxStatus,
    attempts,
    ...(lastError ? { lastError } : {}),
    ...(retryAfter !== undefined ? { retryAfter } : {}),
  };
}

function sanitizeState(value: unknown): PersistedChatStateV1 {
  if (!value || typeof value !== "object") return emptyState();
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return emptyState();

  const drafts: Record<string, string> = {};
  if (raw.drafts && typeof raw.drafts === "object") {
    for (const [matchId, text] of Object.entries(raw.drafts as Record<string, unknown>)) {
      if (matchId && typeof text === "string" && text.length > 0) {
        drafts[matchId] = text.slice(0, MAX_TEXT);
      }
    }
  }

  const outbox = Array.isArray(raw.outbox)
    ? raw.outbox
        .map(sanitizeOutboxEntry)
        .filter((row): row is OutboxEntry => row !== null)
        .slice(-MAX_OUTBOX)
    : [];

  return { version: 1, drafts, outbox };
}

/** Chat persistence is isolated by both account id and active role. */
export function chatStorageKey(userId: string, role: AppRole): string {
  return `${CHAT_STORAGE_PREFIX}:${role}:${userId}`;
}

export function loadChatState(userId: string, role: AppRole): PersistedChatStateV1 {
  try {
    const raw = localStorage.getItem(chatStorageKey(userId, role));
    if (!raw) return emptyState();
    return sanitizeState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

/** Returns false when the WebView denies localStorage writes. */
export function saveChatState(
  userId: string,
  role: AppRole,
  state: PersistedChatStateV1,
): boolean {
  try {
    localStorage.setItem(
      chatStorageKey(userId, role),
      JSON.stringify(sanitizeState(state)),
    );
    return true;
  } catch {
    return false;
  }
}

export function saveDraft(
  userId: string,
  role: AppRole,
  matchId: string,
  text: string,
): boolean {
  const state = loadChatState(userId, role);
  const next = text.slice(0, MAX_TEXT);
  if (next) state.drafts[matchId] = next;
  else delete state.drafts[matchId];
  return saveChatState(userId, role, state);
}

export function loadDraft(
  userId: string,
  role: AppRole,
  matchId: string,
): string {
  return loadChatState(userId, role).drafts[matchId] ?? "";
}

export function upsertOutbox(
  userId: string,
  role: AppRole,
  entry: OutboxEntry,
): boolean {
  const clean = sanitizeOutboxEntry(entry);
  if (!clean) return false;
  const state = loadChatState(userId, role);
  const index = state.outbox.findIndex(
    (row) => row.clientMessageId === clean.clientMessageId,
  );
  if (index >= 0) state.outbox[index] = clean;
  else state.outbox.push(clean);
  state.outbox = state.outbox.slice(-MAX_OUTBOX);
  return saveChatState(userId, role, state);
}

export function removeOutbox(
  userId: string,
  role: AppRole,
  clientMessageId: string,
): boolean {
  const state = loadChatState(userId, role);
  state.outbox = state.outbox.filter(
    (row) => row.clientMessageId !== clientMessageId,
  );
  return saveChatState(userId, role, state);
}

export function loadOutbox(
  userId: string,
  role: AppRole,
  matchId?: string,
): OutboxEntry[] {
  const rows = loadChatState(userId, role).outbox;
  return matchId ? rows.filter((row) => row.matchId === matchId) : rows;
}

/** Remove only the selected account/role chat state. */
export function clearChatAccount(userId: string, role: AppRole): void {
  try {
    localStorage.removeItem(chatStorageKey(userId, role));
  } catch {
    // Restricted Telegram/private storage must never make logout fail.
  }
}
